import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, shell } from "electron";
import { type StartedServer, startServer } from "../../src/server.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const appRoot = join(currentDir, "../..");
const preloadPath = join(currentDir, "../preload/index.mjs");
let backend: StartedServer | undefined;
let mainWindow: BrowserWindow | undefined;

function loadDesktopEnvironment(): void {
  const envPath = app.isPackaged
    ? join(dirname(process.execPath), ".env")
    : join(appRoot, ".env");
  if (existsSync(envPath)) {
    loadEnvFile(envPath);
  }
}

async function createWindow(): Promise<void> {
  backend ??= await startServer({
    host: "127.0.0.1",
    log: false,
    port: 0,
    staticDir: join(currentDir, "../renderer"),
  });

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 680,
    show: false,
    title: "CS 凡",
    autoHideMenuBar: true,
    webPreferences: {
      additionalArguments: [`--csfan-api-base=${backend.url}`],
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      sandbox: true,
    },
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  const trustedOrigin = new URL(rendererUrl ?? backend.url).origin;
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== trustedOrigin) {
      event.preventDefault();
      if (url.startsWith("http://") || url.startsWith("https://")) {
        void shell.openExternal(url);
      }
    }
  });

  if (rendererUrl) {
    await mainWindow.loadURL(rendererUrl);
  } else {
    await mainWindow.loadURL(backend.url);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    loadDesktopEnvironment();
    await createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow();
      }
    });
  });

  app.on("second-instance", () => {
    if (mainWindow?.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow?.focus();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void backend?.close();
});
