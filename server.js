const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5001;

// Resolve public dir - works when run from project root
const PUBLIC = path.resolve(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0];
  const file = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.join(PUBLIC, file);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 - File Not Found</h1><p>' + filePath + '</p>', 'utf-8');
        return;
      }
      res.writeHead(500);
      res.end('Server Error', 'utf-8');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n✅ Tonr running at http://localhost:' + PORT + '\n');
});
