import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { platform } from "./platform";

/** Папка с md-файлами. Пути — относительные, через «/». */
export interface Vault {
  kind: "folder" | "android" | "browser";
  location(): Promise<string>;
  list(dir: string): Promise<string[]>;
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  remove(path: string): Promise<void>;
}

class ElectronVault implements Vault {
  kind = "folder" as const;
  private api = window.polygraph!.vault;
  location() {
    return this.api.root();
  }
  list(dir: string) {
    return this.api.list(dir);
  }
  read(path: string) {
    return this.api.read(path);
  }
  write(path: string, content: string) {
    return this.api.write(path, content);
  }
  remove(path: string) {
    return this.api.remove(path);
  }
}

/**
 * Android: Documents/Polygraph, чтобы папку было видно файловому менеджеру
 * и Syncthing. Если система не даёт писать в Documents — приватная папка
 * приложения.
 */
class AndroidVault implements Vault {
  kind = "android" as const;
  private dir: Directory = Directory.Documents;
  private ready: Promise<void>;
  private root = "Polygraph";

  constructor() {
    this.ready = this.probe();
  }

  private async probe() {
    try {
      await Filesystem.writeFile({ path: `${this.root}/.probe`, data: "ok", directory: this.dir, encoding: Encoding.UTF8, recursive: true });
    } catch {
      this.dir = Directory.Data;
    }
  }

  async location() {
    await this.ready;
    return this.dir === Directory.Documents ? "Documents/Polygraph" : "App storage/Polygraph";
  }

  async list(dir: string) {
    await this.ready;
    try {
      const r = await Filesystem.readdir({ path: `${this.root}/${dir}`, directory: this.dir });
      return r.files.filter((f) => f.type === "file").map((f) => f.name);
    } catch {
      return [];
    }
  }

  async read(path: string) {
    await this.ready;
    try {
      const r = await Filesystem.readFile({ path: `${this.root}/${path}`, directory: this.dir, encoding: Encoding.UTF8 });
      return typeof r.data === "string" ? r.data : await r.data.text();
    } catch {
      return null;
    }
  }

  async write(path: string, content: string) {
    await this.ready;
    await Filesystem.writeFile({ path: `${this.root}/${path}`, data: content, directory: this.dir, encoding: Encoding.UTF8, recursive: true });
  }

  async remove(path: string) {
    await this.ready;
    try {
      await Filesystem.deleteFile({ path: `${this.root}/${path}`, directory: this.dir });
    } catch {
      /* уже нет */
    }
  }
}

/** Браузер: файлы живут в IndexedDB. Выгрузить их можно резервной копией. */
class BrowserVault implements Vault {
  kind = "browser" as const;
  private db: Promise<IDBDatabase>;

  constructor() {
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open("polygraph-vault", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("files");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const req = fn(db.transaction("files", mode).objectStore("files"));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async location() {
    return "Browser storage (IndexedDB)";
  }

  async list(dir: string) {
    const keys = (await this.tx("readonly", (s) => s.getAllKeys())) as string[];
    const prefix = dir ? `${dir}/` : "";
    return keys.filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/")).map((k) => k.slice(prefix.length));
  }

  async read(path: string) {
    return ((await this.tx("readonly", (s) => s.get(path))) as string | undefined) ?? null;
  }

  async write(path: string, content: string) {
    await this.tx("readwrite", (s) => s.put(content, path));
  }

  async remove(path: string) {
    await this.tx("readwrite", (s) => s.delete(path));
  }
}

export function openVault(): Vault {
  switch (platform()) {
    case "electron":
      return new ElectronVault();
    case "android":
      return new AndroidVault();
    default:
      return new BrowserVault();
  }
}
