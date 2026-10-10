// Главный процесс Electron: окно, доступ к папке-хранилищу и HTTP без CORS.
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
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
  if (DEV_URL) win.loadURL(hash ? `${DEV_URL}#${hash}` : DEV_URL);
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"), hash ? { hash } : undefined);
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
  // Главное окно закрыто — бегущая строка без него не нужна.
  win.on("closed", () => tickerWin && !tickerWin.isDestroyed() && tickerWin.close());
}

// Дымовой тест для CI: окно загрузилось, мост на месте, хранилище пишет и читает.
function smokeTest(win) {
  setTimeout(() => {
    console.error("SMOKE FAIL: timeout");
    app.exit(1);
  }, 30000);
  win.webContents.once("did-finish-load", async () => {
    try {
      const r = await win.webContents.executeJavaScript(`new Promise((resolve) => setTimeout(async () => {
        try {
          const v = window.polygraph.vault;
          await v.write("smoke/check.md", "ok");
          const httpUrl = ${JSON.stringify(process.env.POLYGRAPH_SMOKE_HTTP || "")};
          const http = httpUrl ? (await window.polygraph.http({ url: httpUrl, method: "GET", headers: {} })).status : null;
          resolve({ root: await v.root(), read: await v.read("smoke/check.md"), list: await v.list("smoke"), http, text: document.body.innerText.slice(0, 60) });
        } catch (e) {
          resolve({ error: String(e) });
        }
      }, 1500))`);
      const ok = r.read === "ok" && !!r.text;
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
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
