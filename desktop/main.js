const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { URL } = require('url');

// ─────────────────────────────────────────────────────────────
// Lokasi folder web HidzMusify (hasil build asli kamu, TIDAK diubah).
// - Saat development (npm start)  : folder sibling "../HidzMusify"
// - Saat sudah di-package (installer) : disalin ke resources/HidzMusify
//   lewat konfigurasi "extraResources" di package.json
// ─────────────────────────────────────────────────────────────
const WEB_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'HidzMusify')
  : path.join(__dirname, '..', 'HidzMusify');

const PORT = 47123;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

// Mencegah path traversal (mis. "/../../../etc/passwd")
function resolveSafePath(base, urlPath) {
  const normalized = path.posix.normalize('/' + urlPath).replace(/^\/+/, '');
  const resolved = path.join(base, normalized);
  if (!resolved.startsWith(base)) return base;
  return resolved;
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME_TYPES[ext] || 'application/octet-stream';
  const stat = fs.statSync(filePath);

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(filePath).pipe(res);
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);
        let filePath = resolveSafePath(WEB_DIR, decodeURIComponent(reqUrl.pathname));

        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
          filePath = path.join(filePath, 'index.html');
        }

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          sendFile(res, filePath);
          return;
        }

        // Fallback ke index.html untuk route SPA (path tanpa ekstensi file)
        if (!path.extname(reqUrl.pathname)) {
          sendFile(res, path.join(WEB_DIR, 'index.html'));
          return;
        }

        res.writeHead(404);
        res.end('Not found');
      } catch (err) {
        res.writeHead(500);
        res.end('Server error: ' + err.message);
      }
    });

    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

let mainWindow;

async function createWindow() {
  if (!fs.existsSync(WEB_DIR)) {
    throw new Error(
      `Folder web HidzMusify tidak ditemukan di: ${WEB_DIR}\n` +
      `Pastikan folder "HidzMusify" ada tepat di sebelah folder "desktop".`
    );
  }

  await startServer();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#000000',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}/index.html`);

  // Link eksternal (Discord, dsb) dibuka di browser OS, bukan di dalam window app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
