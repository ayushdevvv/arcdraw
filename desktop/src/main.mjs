import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, safeStorage, shell } from "electron";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import httpProxy from "http-proxy";
import { autoUpdater } from "electron-updater";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = "127.0.0.1";
const PORT = 43127;
const LOCAL_ORIGIN = `http://${HOST}:${PORT}`; // Stable origin keeps localStorage and IndexedDB available across launches.
const API_WEB_ORIGIN = (process.env.ARCDRAW_WEB_ORIGIN || "https://arcdraw.vercel.app").replace(/\/$/, "");
const SOCKET_ORIGIN = (process.env.ARCDRAW_SOCKET_ORIGIN || "https://arcdraw.onrender.com").replace(/\/$/, "");
const API_PREFIX = "/api/v1";
const MAX_BODY_BYTES = 24 * 1024 * 1024;
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf", ".wasm": "application/wasm", ".txt": "text/plain; charset=utf-8"
};

let mainWindow = null;
let localServer = null;
let pendingOAuth = null;
let authVault = { accessToken: null, refreshToken: null, user: null };
let lastSessionRefreshWasOffline = false;
const socketProxy = httpProxy.createProxyServer({ target: SOCKET_ORIGIN, changeOrigin: true, ws: true, secure: true, xfwd: true });

function log(...args) {
  console.log("[ArcDraw Desktop]", ...args);
}

function equalState(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function vaultPath() {
  return path.join(app.getPath("userData"), "session.vault");
}

function persistVault() {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      log("OS encryption is unavailable; the current account will stay signed in for this app session only.");
      return false;
    }
    const directory = app.getPath("userData");
    fs.mkdirSync(directory, { recursive: true });
    const encrypted = safeStorage.encryptString(JSON.stringify(authVault));
    const tempPath = `${vaultPath()}.tmp`;
    fs.writeFileSync(tempPath, encrypted, { mode: 0o600 });
    fs.renameSync(tempPath, vaultPath());
    return true;
  } catch (error) {
    log("Could not persist the encrypted account session:", error.message);
    return false;
  }
}

function loadVault() {
  try {
    if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(vaultPath())) return;
    const decrypted = safeStorage.decryptString(fs.readFileSync(vaultPath()));
    const parsed = JSON.parse(decrypted);
    authVault = {
      accessToken: typeof parsed.accessToken === "string" ? parsed.accessToken : null,
      refreshToken: typeof parsed.refreshToken === "string" ? parsed.refreshToken : null,
      user: parsed.user && typeof parsed.user === "object" ? parsed.user : null
    };
  } catch (error) {
    log("Saved account session could not be opened. The app will ask you to sign in again.", error.message);
    authVault = { accessToken: null, refreshToken: null, user: null };
  }
}

function saveDesktopSession(session, user) {
  if (!session?.accessToken || !session?.refreshToken) throw new Error("The server did not return a complete desktop session.");
  authVault = {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    user: user && typeof user === "object" ? user : authVault.user
  };
  persistVault();
}

function clearDesktopSession() {
  authVault = { accessToken: null, refreshToken: null, user: null };
  try { fs.rmSync(vaultPath(), { force: true }); } catch { /* already cleared */ }
}

function apiUrl(pathname) {
  return `${API_WEB_ORIGIN}${pathname}`;
}

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request payload is too large.");
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : null;
}

async function refreshDesktopSession() {
  lastSessionRefreshWasOffline = false;
  if (!authVault.refreshToken) return false;
  try {
    const response = await fetch(apiUrl(`${API_PREFIX}/auth/desktop/refresh`), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ArcDraw-Client": "desktop", Accept: "application/json" },
      body: JSON.stringify({ refreshToken: authVault.refreshToken }),
      signal: AbortSignal.timeout(15000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.desktopSession) {
      if (response.status === 401) clearDesktopSession();
      else if (response.status >= 500 || response.status === 408 || response.status === 429) lastSessionRefreshWasOffline = true;
      return false;
    }
    saveDesktopSession(payload.desktopSession, payload.user);
    return true;
  } catch (error) {
    lastSessionRefreshWasOffline = true;
    log("Session refresh could not reach the API:", error.message);
    return false;
  }
}

function safeRequestHeaders(request) {
  const headers = new Headers();
  const allowed = ["accept", "content-type", "x-board-share-token", "if-none-match", "if-modified-since"];
  for (const key of allowed) {
    const value = request.headers[key];
    if (typeof value === "string") headers.set(key, value);
  }
  headers.set("X-ArcDraw-Client", "desktop");
  if (authVault.accessToken) headers.set("Authorization", `Bearer ${authVault.accessToken}`);
  return headers;
}

async function upstreamApiRequest(url, method, headers, body) {
  return fetch(url, {
    method,
    headers,
    ...(method === "GET" || method === "HEAD" ? {} : { body }),
    redirect: "manual",
    signal: AbortSignal.timeout(120000)
  });
}

function writeJson(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(body.length),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(body);
}

async function proxyApiRequest(request, response, url) {
  if (!url.pathname.startsWith(API_PREFIX)) return writeJson(response, 404, { success: false, error: { message: "API route not found." } });
  if (url.pathname === `${API_PREFIX}/auth/refresh` && request.method === "POST") {
    const refreshed = await refreshDesktopSession();
    if (!refreshed) {
      const offline = lastSessionRefreshWasOffline;
      return writeJson(response, offline ? 503 : 401, {
        success: false,
        error: offline
          ? { message: "ArcDraw is offline. Your downloaded workspace is still available on this computer.", code: "NETWORK_OFFLINE" }
          : { message: "Your desktop session expired. Sign in again.", code: "AUTH_REQUIRED" }
      });
    }
    return writeJson(response, 200, { success: true, user: authVault.user });
  }

  let body;
  try {
    body = await readRequestBody(request);
  } catch (error) {
    return writeJson(response, 413, { success: false, error: { message: error.message } });
  }

  if (url.pathname === `${API_PREFIX}/auth/logout` && request.method === "POST") {
    body = Buffer.from(JSON.stringify({ refreshToken: authVault.refreshToken }));
  }

  const targetUrl = apiUrl(`${url.pathname}${url.search}`);
  const headers = safeRequestHeaders(request);
  if (body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  let upstream;
  try {
    upstream = await upstreamApiRequest(targetUrl, request.method, headers, body);
    const publicAuthRoute = /\/auth\/(login|register|verify-email|resend-verification|forgot-password|reset-password|providers|desktop\/refresh|desktop\/exchange)$/.test(url.pathname);
    if (upstream.status === 401 && authVault.refreshToken && !publicAuthRoute && !url.pathname.endsWith("/auth/logout")) {
      const refreshed = await refreshDesktopSession();
      if (refreshed) upstream = await upstreamApiRequest(targetUrl, request.method, safeRequestHeaders(request), body);
      else if (lastSessionRefreshWasOffline) {
        return writeJson(response, 503, { success: false, error: { code: "NETWORK_OFFLINE", message: "ArcDraw is offline. Your local rooms and edits remain available on this computer." } });
      }
    }
  } catch (error) {
    return writeJson(response, 503, {
      success: false,
      error: {
        code: "NETWORK_OFFLINE",
        message: "ArcDraw can't reach its cloud services right now. Your local rooms and edits remain saved on this computer."
      }
    });
  }

  const contentType = upstream.headers.get("content-type") || "application/octet-stream";
  const isJson = contentType.includes("application/json");
  if (isJson) {
    const raw = await upstream.text();
    let payload;
    try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { message: raw }; }
    if (upstream.ok && payload.desktopSession) {
      saveDesktopSession(payload.desktopSession, payload.user);
      delete payload.desktopSession;
    } else if (upstream.ok && payload.user && authVault.refreshToken) {
      authVault.user = payload.user;
      persistVault();
    }
    if (upstream.ok && (url.pathname.endsWith("/auth/logout") || url.pathname.endsWith("/auth/logout-all"))) clearDesktopSession();
    response.writeHead(upstream.status, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    return response.end(JSON.stringify(payload));
  }

  const forwardHeaders = {
    "Content-Type": contentType,
    "Cache-Control": upstream.headers.get("cache-control") || "no-store",
    "X-Content-Type-Options": "nosniff"
  };
  const contentDisposition = upstream.headers.get("content-disposition");
  if (contentDisposition) forwardHeaders["Content-Disposition"] = contentDisposition;
  const etag = upstream.headers.get("etag");
  if (etag) forwardHeaders.ETag = etag;
  response.writeHead(upstream.status, forwardHeaders);
  if (!upstream.body) return response.end();
  Readable.fromWeb(upstream.body).on("error", () => response.destroy()).pipe(response);
}

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss: ws:",
      "media-src 'self' data: blob:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join("; ")
  };
}

function rendererRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "frontend-dist")
    : path.resolve(__dirname, "../../frontend/dist");
}

function serveStatic(request, response, pathname) {
  const root = rendererRoot();
  let decoded;
  try {
    decoded = decodeURIComponent(pathname.split("?")[0] || "/");
  } catch {
    return writeJson(response, 400, { success: false, error: { message: "Invalid path encoding." } });
  }
  const candidate = path.resolve(root, `.${decoded === "/" ? "/index.html" : decoded}`);
  if (!candidate.startsWith(`${root}${path.sep}`) && candidate !== path.join(root, "index.html")) {
    return writeJson(response, 403, { success: false, error: { message: "Invalid path." } });
  }
  let filePath = candidate;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) filePath = path.join(root, "index.html");
  if (!fs.existsSync(filePath)) return writeJson(response, 503, { success: false, error: { message: "ArcDraw desktop files are missing. Reinstall the application." } });
  const ext = path.extname(filePath).toLowerCase();
  const headers = {
    ...securityHeaders(),
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=31536000, immutable"
  };
  response.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(response);
}

function loopbackRequest(request) {
  const remote = String(request.socket.remoteAddress || "");
  return remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
}

function oauthCallbackPage(success, message) {
  const safeMessage = String(message || "").replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character]));
  const title = success ? "ArcDraw is ready" : "Sign in wasn't completed";
  const color = success ? "#45b68a" : "#c87878";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111;color:#f5f5f5;font:15px/1.5 Inter,system-ui,sans-serif}.card{max-width:440px;margin:24px;padding:36px;border:1px solid #303030;border-radius:22px;background:#1a1a1a;text-align:center}.mark{width:44px;height:44px;border-radius:14px;margin:0 auto 22px;background:${color};display:grid;place-items:center;color:#111;font-weight:800;font-size:22px}.muted{color:#a3a3a3}</style></head><body><main class="card"><div class="mark">A</div><h2>${title}</h2><p class="muted">${safeMessage}</p><p class="muted">You can close this browser tab and return to ArcDraw Desktop.</p></main></body></html>`;
}

async function completeOAuthCallback(request, response, url) {
  if (!loopbackRequest(request) || !pendingOAuth) return writeJson(response, 404, { message: "No desktop sign-in is waiting." });
  const incomingState = url.searchParams.get("state") || "";
  if (!equalState(incomingState, pendingOAuth.state)) {
    response.writeHead(400, { "Content-Type": "text/html; charset=utf-8", ...securityHeaders() });
    return response.end(oauthCallbackPage(false, "The sign-in response could not be verified. Start again from ArcDraw Desktop."));
  }
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (error || !code) {
    const message = error === "access_denied" ? "The provider sign-in was cancelled." : "The provider could not complete sign-in. Please try again.";
    const pending = pendingOAuth;
    pendingOAuth = null;
    clearTimeout(pending.timeout);
    pending.reject(new Error(message));
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...securityHeaders() });
    return response.end(oauthCallbackPage(false, message));
  }

  try {
    const exchangeResponse = await fetch(apiUrl(`${API_PREFIX}/auth/desktop/exchange`), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ArcDraw-Client": "desktop", Accept: "application/json" },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(20000)
    });
    const payload = await exchangeResponse.json().catch(() => ({}));
    if (!exchangeResponse.ok || !payload.desktopSession?.accessToken || !payload.desktopSession?.refreshToken) {
      throw new Error(payload.error?.message || payload.message || "ArcDraw could not complete the desktop sign-in.");
    }
    saveDesktopSession(payload.desktopSession, payload.user);
    const pending = pendingOAuth;
    pendingOAuth = null;
    clearTimeout(pending.timeout);
    pending.resolve({ success: true, user: payload.user });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("desktop:auth-changed", payload.user);
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...securityHeaders() });
    return response.end(oauthCallbackPage(true, "Your ArcDraw account is connected. Return to the desktop app."));
  } catch (cause) {
    const pending = pendingOAuth;
    pendingOAuth = null;
    if (pending) {
      clearTimeout(pending.timeout);
      pending.reject(cause);
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...securityHeaders() });
    return response.end(oauthCallbackPage(false, cause.message));
  }
}

function startLocalServer() {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", LOCAL_ORIGIN);
    const requestOrigin = request.headers.origin;
    const fetchSite = request.headers["sec-fetch-site"];
    if (request.headers.host !== `${HOST}:${PORT}`) return writeJson(response, 403, { message: "Invalid desktop host." });
    if (requestOrigin && requestOrigin !== LOCAL_ORIGIN) return writeJson(response, 403, { message: "Cross-origin desktop request blocked." });
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return writeJson(response, 403, { message: "Cross-site desktop request blocked." });
    if (url.pathname.startsWith(API_PREFIX)) return proxyApiRequest(request, response, url);
    if (url.pathname === "/socket.io" || url.pathname.startsWith("/socket.io/")) {
      return socketProxy.web(request, response, { target: SOCKET_ORIGIN, changeOrigin: true, secure: true });
    }
    if (url.pathname === "/oauth/callback" && request.method === "GET") return completeOAuthCallback(request, response, url);
    if (url.pathname === "/desktop-health") return writeJson(response, 200, { status: "ready", version: app.getVersion() });
    return serveStatic(request, response, url.pathname);
  });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "/", LOCAL_ORIGIN);
    const requestOrigin = request.headers.origin;
    if (request.headers.host !== `${HOST}:${PORT}` || (requestOrigin && requestOrigin !== LOCAL_ORIGIN)) {
      socket.destroy();
      return;
    }
    if (url.pathname === "/socket.io" || url.pathname.startsWith("/socket.io/")) {
      socketProxy.ws(request, socket, head, { target: SOCKET_ORIGIN, changeOrigin: true, secure: true });
    } else {
      socket.destroy();
    }
  });

  socketProxy.on("proxyReq", (proxyRequest) => proxyRequest.setHeader("Origin", API_WEB_ORIGIN));
  socketProxy.on("proxyReqWs", (proxyRequest) => proxyRequest.setHeader("Origin", API_WEB_ORIGIN));
  socketProxy.on("error", (error, request, response) => {
    log("Realtime proxy error:", error.message);
    if (response && typeof response.writeHead === "function" && !response.headersSent) {
      writeJson(response, 502, { message: "Realtime service is unavailable." });
    } else if (response && typeof response.destroy === "function" && !response.destroyed) {
      response.destroy();
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, () => {
      server.removeListener("error", reject);
      log(`Local app server ready at ${LOCAL_ORIGIN}`);
      resolve(server);
    });
  });
}

function trustedSender(event) {
  try {
    const url = new URL(event.senderFrame.url);
    return url.protocol === "http:" && url.hostname === HOST && Number(url.port) === PORT;
  } catch {
    return false;
  }
}

async function beginOAuth(provider) {
  if (provider !== "google" && provider !== "github") throw new Error("Unsupported sign-in provider.");
  if (pendingOAuth) throw new Error("A sign-in attempt is already open. Finish it or close the browser tab first.");
  const state = randomBytes(32).toString("base64url");
  const callback = new URL(`http://${HOST}:${PORT}/oauth/callback`);
  callback.searchParams.set("state", state);
  const startUrl = new URL(`${API_PREFIX}/auth/${provider}`, API_WEB_ORIGIN);
  startUrl.searchParams.set("desktop_redirect", callback.toString());

  const resultPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!pendingOAuth || pendingOAuth.state !== state) return;
      pendingOAuth = null;
      reject(new Error("Sign-in timed out. Return to ArcDraw Desktop and try again."));
    }, 3 * 60 * 1000);
    pendingOAuth = { state, resolve, reject, timeout };
  });

  try {
    await shell.openExternal(startUrl.toString());
  } catch (error) {
    if (pendingOAuth?.state === state) {
      clearTimeout(pendingOAuth.timeout);
      pendingOAuth = null;
    }
    throw new Error(`Could not open your default browser: ${error.message}`);
  }
  return resultPromise;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: "#111111",
    title: "ArcDraw",
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: true
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:") {
        void shell.openExternal(url);
      } else if (parsed.protocol === "mailto:") {
        void shell.openExternal(url);
      }
    } catch { /* reject malformed URLs */ }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, target) => {
    try {
      const parsed = new URL(target);
      if (parsed.origin === LOCAL_ORIGIN) return;
      event.preventDefault();
      if (parsed.protocol === "https:" || parsed.protocol === "mailto:") void shell.openExternal(target);
    } catch {
      event.preventDefault();
    }
  });
  mainWindow.on("closed", () => { mainWindow = null; });
  void mainWindow.loadURL(`${LOCAL_ORIGIN}/`);
}

function buildMenu() {
  const template = [
    {
      label: "ArcDraw",
      submenu: [
        { label: "About ArcDraw", click: () => dialog.showMessageBox(mainWindow, { type: "info", title: "ArcDraw", message: `ArcDraw Desktop ${app.getVersion()}`, detail: "A collaborative workspace for visual thinking and project work." }) },
        { type: "separator" },
        { label: "Check for updates…", click: () => { if (app.isPackaged) void autoUpdater.checkForUpdates().catch((error) => log(error.message)); else dialog.showMessageBox({ message: "Updates are checked in packaged builds." }); } },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [ { role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" } ]
    },
    {
      label: "View",
      submenu: [ { role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools", visible: !app.isPackaged }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "togglefullscreen" } ]
    },
    { label: "Window", submenu: [ { role: "minimize" }, { role: "close" } ] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle("desktop:get-user", (event) => trustedSender(event) ? authVault.user : null);
ipcMain.handle("desktop:clear-session", (event) => {
  if (!trustedSender(event)) return false;
  clearDesktopSession();
  return true;
});
ipcMain.handle("desktop:get-version", (event) => trustedSender(event) ? app.getVersion() : null);
ipcMain.handle("desktop:start-oauth", async (event, provider) => {
  if (!trustedSender(event)) throw new Error("Untrusted desktop renderer.");
  return beginOAuth(provider);
});
ipcMain.handle("desktop:notify", (event, payload = {}) => {
  if (!trustedSender(event) || !Notification.isSupported()) return false;
  const notification = new Notification({
    title: String(payload.title || "ArcDraw").slice(0, 100),
    body: String(payload.body || "").slice(0, 300),
    silent: Boolean(payload.silent)
  });
  notification.on("click", () => mainWindow?.focus());
  notification.show();
  return true;
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId("com.arcdraw.desktop");
    loadVault();
    try {
      localServer = await startLocalServer();
    } catch (error) {
      await dialog.showMessageBox({
        type: "error",
        title: "ArcDraw could not start",
        message: `ArcDraw could not open its local workspace at 127.0.0.1:${PORT}.`,
        detail: error.code === "EADDRINUSE" ? "Another process is using the ArcDraw local port. Close the other ArcDraw instance and try again." : error.message
      });
      app.quit();
      return;
    }

    buildMenu();
    createMainWindow();
    if (app.isPackaged) {
      autoUpdater.autoDownload = true;
      autoUpdater.on("update-downloaded", async () => {
        const result = await dialog.showMessageBox(mainWindow, {
          type: "info",
          buttons: ["Restart and install", "Later"],
          defaultId: 0,
          cancelId: 1,
          title: "ArcDraw update ready",
          message: "A new ArcDraw version is ready to install."
        });
        if (result.response === 0) autoUpdater.quitAndInstall();
      });
      setTimeout(() => { void autoUpdater.checkForUpdatesAndNotify().catch((error) => log("Update check failed:", error.message)); }, 5000);
    }
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });
  });
}

app.on("before-quit", () => {
  if (pendingOAuth) {
    clearTimeout(pendingOAuth.timeout);
    pendingOAuth.reject(new Error("ArcDraw closed before sign-in completed."));
    pendingOAuth = null;
  }
  socketProxy.close();
  localServer?.close();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
