// Главный процесс Electron: окно, доступ к папке-хранилищу и HTTP без CORS.
const { app, BrowserWindow, clipboard, desktopCapturer, dialog, globalShortcut, ipcMain, Notification, screen, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const DEV_URL = process.env.POLYGRAPH_DEV_URL;
const configFile = () => path.join(app.getPath("userData"), "polygraph.json");

let vaultRoot = null;

async function loadConfig() {
  try {
    return JSON.parse(await fs.readFile(configFile(), "utf8"));
  } catch {
    return {};
  }
}

async function saveConfig(cfg) {
  await fs.mkdir(path.dirname(configFile()), { recursive: true });
  await fs.writeFile(configFile(), JSON.stringify(cfg, null, 2));
}

async function getRoot() {
  if (!vaultRoot) {
    const cfg = await loadConfig();
    // resolve нормализует разделители: иначе проверка «внутри хранилища» ломается на C:/…
    vaultRoot = path.resolve(process.env.POLYGRAPH_VAULT || cfg.vault || path.join(app.getPath("documents"), "Polygraph"));
  }
  await fs.mkdir(vaultRoot, { recursive: true });
  return vaultRoot;
}

// Путь из окна — всегда относительный и не выходит за пределы хранилища.
async function resolveInVault(rel) {
  const root = await getRoot();
  const full = path.resolve(root, String(rel));
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error(`Path outside vault: ${rel}`);
  return full;
}

ipcMain.handle("vault:root", () => getRoot());

ipcMain.handle("vault:choose", async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory", "createDirectory"], defaultPath: await getRoot() });
  if (r.canceled || !r.filePaths[0]) return null;
  vaultRoot = path.resolve(r.filePaths[0]);
  await saveConfig({ ...(await loadConfig()), vault: vaultRoot });
  return vaultRoot;
});

ipcMain.handle("vault:reveal", async () => {
  await shell.openPath(await getRoot());
});

ipcMain.handle("vault:list", async (_e, dir) => {
  try {
    const entries = await fs.readdir(await resolveInVault(dir || "."), { withFileTypes: true });
    return entries.filter((d) => d.isFile()).map((d) => d.name);
  } catch {
    return [];
  }
});

ipcMain.handle("vault:read", async (_e, rel) => {
  try {
    return await fs.readFile(await resolveInVault(rel), "utf8");
  } catch {
    return null;
  }
});

ipcMain.handle("vault:write", async (e, rel, content) => {
  const full = await resolveInVault(rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  // Пишем во временный файл и переименовываем: синхронизатор не увидит полфайла.
  const tmp = `${full}.tmp`;
  await fs.writeFile(tmp, String(content), "utf8");
  await fs.rename(tmp, full);
  // Другие окна (бегущая строка ↔ главное) держат копию данных — сообщаем им.
  for (const w of BrowserWindow.getAllWindows()) if (w.webContents !== e.sender) w.webContents.send("vault:changed", rel);
});

ipcMain.handle("vault:remove", async (_e, rel) => {
  await fs.rm(await resolveInVault(rel), { force: true });
});

// Скачивание файлов (офлайн-словари): бинарно и с переходами по редиректам GitHub.
ipcMain.handle("http:download", async (_e, url) => {
  if (!url.startsWith("https://")) throw new Error("Only https URLs are allowed");
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
});

ipcMain.handle("http:request", async (_e, req) => {
  if (!/^https?:\/\//.test(req.url)) throw new Error("Only http(s) URLs are allowed");
  const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
  const headers = {};
  res.headers.forEach((v, k) => (headers[k] = v));
  return { status: res.status, headers, body: await res.text() };
});

const webPreferences = {
  preload: path.join(__dirname, "preload.cjs"),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
};

function loadApp(win, hash) {
  // ?smoke включает в окне отладочный вход для дымового теста (src/main.tsx).
  const search = process.env.POLYGRAPH_SMOKE && !hash ? "smoke=1" : undefined;
  if (DEV_URL) win.loadURL(`${DEV_URL}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`);
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash, search });
}

// Бегущая строка для второго монитора: маленькое окно поверх всех окон,
// включая полноэкранные игры в оконном режиме.
let tickerWin = null;

ipcMain.handle("ticker:open", () => {
  if (tickerWin && !tickerWin.isDestroyed()) {
    tickerWin.show();
    return;
  }
  tickerWin = new BrowserWindow({
    width: 520,
    height: 120,
    minWidth: 260,
    minHeight: 80,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    title: "Polygraph — ticker",
    icon: path.join(__dirname, "..", "public", "icon.png"),
    webPreferences,
  });
  tickerWin.setAlwaysOnTop(true, "screen-saver");
  tickerWin.setVisibleOnAllWorkspaces(true);
  tickerWin.on("closed", () => (tickerWin = null));
  loadApp(tickerWin, "ticker");
});

ipcMain.handle("ticker:close", () => {
  if (tickerWin && !tickerWin.isDestroyed()) tickerWin.close();
});

// ——— Захват из любой программы ———
// Ctrl+Alt+I — скопированный текст в инбокс, не выходя из фильма или игры.
// Ctrl+Alt+O — снимок экрана под курсором → распознавание текста в приложении.

let mainWin = null;

async function captureScreen() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const thumbnailSize = {
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor),
  };
  const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize });
  const src = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
  return src ? src.thumbnail.toDataURL() : null;
}

ipcMain.handle("screen:capture", async (e) => {
  // Кнопка в самом приложении: убираем своё окно, иначе на снимке будет оно.
  const win = BrowserWindow.fromWebContents(e.sender);
  win?.minimize();
  await new Promise((r) => setTimeout(r, 450));
  const image = await captureScreen();
  win?.restore();
  return image;
});

function notify(body) {
  if (Notification.isSupported()) new Notification({ title: "Polygraph", body, silent: true }).show();
}

function registerShortcuts() {
  globalShortcut.register("CommandOrControl+Alt+I", () => {
    const text = clipboard.readText().trim();
    if (!text || !mainWin) return;
    mainWin.webContents.send("capture", { kind: "clipboard", text: text.slice(0, 500) });
    notify(`→ Inbox: ${text.slice(0, 80)}`);
  });
  globalShortcut.register("CommandOrControl+Alt+O", async () => {
    if (!mainWin) return;
    const image = await captureScreen();
    if (!image) return;
    mainWin.webContents.send("capture", { kind: "screen", image });
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.show();
    mainWin.focus();
  });
}

app.on("will-quit", () => globalShortcut.unregisterAll());

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 380,
    minHeight: 500,
    title: "Polygraph",
    icon: path.join(__dirname, "..", "public", "icon.png"),
    autoHideMenuBar: true,
    webPreferences,
  });
  // Внешние ссылки — в системный браузер, а не в окно приложения.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  if (process.env.POLYGRAPH_SMOKE) smokeTest(win);
  loadApp(win);
  mainWin = win;
  // Главное окно закрыто — бегущая строка без него не нужна.
  win.on("closed", () => {
    mainWin = null;
    if (tickerWin && !tickerWin.isDestroyed()) tickerWin.close();
  });
}

// Дымовой тест для CI: окно загрузилось, мост на месте, хранилище пишет и читает.
function smokeTest(win) {
  setTimeout(() => {
    console.error("SMOKE FAIL: timeout");
    app.exit(1);
  }, 90000);
  win.webContents.once("did-finish-load", async () => {
    try {
      const r = await win.webContents.executeJavaScript(`new Promise((resolve) => setTimeout(async () => {
        try {
          const v = window.polygraph.vault;
          await v.write("smoke/check.md", "ok");
          const httpUrl = ${JSON.stringify(process.env.POLYGRAPH_SMOKE_HTTP || "")};
          const http = httpUrl ? (await window.polygraph.http({ url: httpUrl, method: "GET", headers: {} })).status : null;
          await window.polygraph.ticker.open();
          await new Promise((r) => setTimeout(r, 1500));
          // PDF: минимальный документ с одной строкой текста.
          const content = "BT /F1 18 Tf 20 100 Td (Hola mundo) Tj ET";
          const pdfSrc = "%PDF-1.4\\n1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj\\n2 0 obj <</Type/Pages/Kids[3 0 R]/Count 1>> endobj\\n3 0 obj <</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>> endobj\\n4 0 obj <</Length " + content.length + ">> stream\\n" + content + "\\nendstream endobj\\n5 0 obj <</Type/Font/Subtype/Type1/BaseFont/Helvetica>> endobj\\ntrailer <</Root 1 0 R>>\\n%%EOF";
          let pdf = null, ocr = null;
          try { pdf = (await window.__smoke.pdf(new TextEncoder().encode(pdfSrc))).paragraphs.join(" "); } catch (e) { pdf = "ERR " + e; }
          // Распознавание текста: надпись на холсте.
          try {
            const c = document.createElement("canvas");
            c.width = 600; c.height = 140;
            const g = c.getContext("2d");
            g.fillStyle = "#fff"; g.fillRect(0, 0, 600, 140); g.fillStyle = "#000"; g.font = "48px Arial"; g.fillText("Hola mundo", 20, 90);
            ocr = await window.__smoke.ocr(await new Promise((r) => c.toBlob(r)));
          } catch (e) { ocr = "ERR " + e; }
          resolve({ root: await v.root(), read: await v.read("smoke/check.md"), list: await v.list("smoke"), http, pdf, ocr, download: typeof window.polygraph.download, text: document.body.innerText.slice(0, 60) });
        } catch (e) {
          resolve({ error: String(e) });
        }
      }, 1500))`);
      r.windows = BrowserWindow.getAllWindows().length;
      r.ticker = !!tickerWin && !tickerWin.isDestroyed() && tickerWin.webContents.getURL().endsWith("#ticker");
      if (r.ticker) r.tickerText = await tickerWin.webContents.executeJavaScript("document.body.innerText.slice(0, 80)");
      const ok = r.read === "ok" && !!r.text && r.ticker && r.download === "function" && /Hola/.test(r.pdf ?? "") && /Hola/.test(r.ocr ?? "");
      console.log(ok ? "SMOKE OK" : "SMOKE FAIL", JSON.stringify(r));
      if (!ok) process.exitCode = 1;
    } catch (e) {
      console.error("SMOKE FAIL", e);
      process.exitCode = 1;
    }
    app.quit();
  });
}

app.whenReady().then(() => {
  createWindow();
  registerShortcuts();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
