// ============================================================
// server.js — a minimal local web server for development.
//
// Run it with:   node server.js
// Then open:     http://localhost:8080
//
// A web server is just a program that listens for requests like
// "GET /index.html" and replies with the file's contents. That's
// all this does. (You don't need this file on GitHub Pages —
// GitHub runs the server for you.)
// ============================================================

const http = require('http');   // Node's built-in web server toolkit
const fs = require('fs');       // read files from disk
const path = require('path');   // join file paths safely

const PORT = process.env.PORT || 8080; // set PORT to run beside another instance

// The browser needs to be told what KIND of file it's getting —
// these labels are called MIME types.
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
};

const server = http.createServer((request, response) => {
  // "/" means the homepage → serve index.html.
  // split('?') strips things like "?v=2" off the end of URLs.
  const urlPath = request.url.split('?')[0];
  const filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);

  // Safety check: never serve files from OUTSIDE the project folder.
  if (!filePath.startsWith(__dirname)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404).end('Not found: ' + urlPath);
      return;
    }
    const type = MIME[path.extname(filePath)] || 'application/octet-stream';
    // "no-store" = never cache, so you always see your latest edits.
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    response.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`Serving on http://localhost:${PORT} — press Ctrl+C to stop.`);
});
