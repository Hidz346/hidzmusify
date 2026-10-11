// Static file server with SPA fallback that mirrors the production `_redirects` rule
// (`/* /index.html 200`). Used by the e2e tests so they exercise the *built* files, not a dev server.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain',
    '.xml': 'application/xml',
    '.wasm': 'application/wasm',
};

/**
 * @param {string} root directory to serve
 * @param {{port?: number, spaFallback?: boolean}} [opts]
 * @returns {Promise<{url: string, close: () => Promise<void>}>}
 */
export function startStaticServer(root, { port = 0, spaFallback = true } = {}) {
    const base = path.resolve(root);
    const server = http.createServer((req, res) => {
        const u = new URL(req.url, 'http://x');
        const rel = path.normalize(decodeURIComponent(u.pathname)).replace(/^(\.\.[/\\])+/, '');
        let file = path.join(base, rel);
        if (!file.startsWith(base)) {
            res.writeHead(403);
            return res.end();
        }
        let st = fs.existsSync(file) && fs.statSync(file);
        if (st && st.isDirectory()) {
            file = path.join(file, 'index.html');
            st = fs.existsSync(file) && fs.statSync(file);
        }
        if (!st) {
            if (!spaFallback) {
                res.writeHead(404);
                return res.end('not found');
            }
            file = path.join(base, 'index.html'); // 200 + index.html, exactly like `_redirects`
        }
        res.writeHead(200, {
            'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-store',
        });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => {
            const { port: p } = server.address();
            resolve({
                url: `http://127.0.0.1:${p}`,
                close: () => new Promise((r) => server.close(() => r())),
            });
        });
    });
}
