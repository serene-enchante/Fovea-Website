import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const rootDirectory = resolve(import.meta.dirname, '../..');
const port = Number(process.env.PORT || 4173);

const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.geojson': 'application/geo+json',
    '.html': 'text/html; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.topojson': 'application/json',
    '.webp': 'image/webp',
    '.woff': 'font/woff'
};

function resolveRequestedFile(urlPathname) {
    const decodedPath = decodeURIComponent(urlPathname);
    const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
    const candidate = resolve(rootDirectory, relativePath);

    if (candidate !== rootDirectory && !candidate.startsWith(`${rootDirectory}${sep}`)) {
        return null;
    }
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
        return resolve(candidate, 'index.html');
    }
    return candidate;
}

createServer((request, response) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    const filePath = resolveRequestedFile(pathname);

    if (!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
    }

    response.writeHead(200, {
        'Content-Type': contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
    });
    createReadStream(filePath).pipe(response);
}).listen(port, '127.0.0.1', () => {
    console.log(`Fovea test server listening on http://127.0.0.1:${port}`);
});
