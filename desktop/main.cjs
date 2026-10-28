'use strict';
/* EKPO Lab desktop shell (Electron).
 * The web app loads ES modules via relative URLs, which fails under file://,
 * so the shell serves the bundled web/ folder from a local HTTP origin.
 * The port is kept stable (17361) so the app's localStorage ledger
 * (lab_management_db_v9) persists across launches.
 */
const { app, BrowserWindow, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const WEB_ROOT = path.join(__dirname, 'web');
const PREFERRED_PORT = 17361;
const PORT_TRIES = 10;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.md': 'text/plain; charset=utf-8'
};

function startServer(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, 'http://127.0.0.1');
        let filePath = path.join(WEB_ROOT, decodeURIComponent(url.pathname));
        if (!filePath.startsWith(WEB_ROOT)) { res.writeHead(403); res.end(); return; }
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
          filePath = path.join(filePath, 'index.html');
        }
        fs.readFile(filePath, (err, data) => {
          if (err) { res.writeHead(404); res.end('Not found'); return; }
          res.writeHead(200, {
            'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store'
          });
          res.end(data);
        });
      } catch {
        res.writeHead(400); res.end();
      }
    });
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function listenOnStablePort() {
  for (let i = 0; i < PORT_TRIES; i++) {
    try { return await startServer(PREFERRED_PORT + i); }
    catch (err) { if (err.code !== 'EADDRINUSE') throw err; }
  }
  throw new Error('No free local port for EKPO Lab desktop shell');
}

let mainWindow = null;

async function createWindow() {
  const server = await listenOnStablePort();
  const port = server.address().port;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    title: 'EKPO 实验室日常管理',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && !url.startsWith('http://127.0.0.1')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  await mainWindow.loadURL('http://127.0.0.1:' + port + '/');

  // Optional smoke hook: EKPO_SMOKE=/path/shot.png captures the loaded UI and quits.
  if (process.env.EKPO_SMOKE) {
    await new Promise(r => setTimeout(r, 2500));
    const image = await mainWindow.capturePage();
    fs.writeFileSync(process.env.EKPO_SMOKE, image.toPNG());
    app.quit();
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(createWindow).catch(err => {
    console.error(err);
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
}
