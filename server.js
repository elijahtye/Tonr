const http = require('http');
const fs = require('fs');
const path = require('path');

const PREFERRED_PORT = 5001;
const FALLBACK_PORT = 5002;
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

const STATIC_DIR = path.join(__dirname, 'public');

function createServer() {
  return http.createServer((req, res) => {
    let filePath = path.join(STATIC_DIR, req.url === '/' ? 'index.html' : req.url);
    filePath = path.resolve(filePath);
    if (!filePath.startsWith(path.resolve(STATIC_DIR))) {
      res.writeHead(403);
      res.end('Forbidden', 'utf-8');
      return;
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
      if (error) {
        if (error.code === 'ENOENT') {
          res.writeHead(404, { 'Content-Type': 'text/html' });
          res.end('<h1>404 - File Not Found</h1>', 'utf-8');
        } else {
          res.writeHead(500);
          res.end(`Server Error: ${error.code}`, 'utf-8');
        }
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });
}

function startServer(port) {
  const server = createServer();
  
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      if (port === PREFERRED_PORT) {
        console.log(`\n⚠️  Port ${PREFERRED_PORT} is in use (likely AirPlay Receiver).`);
        console.log(`   Trying port ${FALLBACK_PORT} instead...\n`);
        startServer(FALLBACK_PORT);
      } else {
        console.error(`\n❌ Port ${port} is also in use.`);
        console.log('\nTo use port 5000, disable AirPlay Receiver:');
        console.log('System Settings > General > AirDrop & Handoff > AirPlay Receiver (turn off)\n');
        process.exit(1);
      }
    } else {
      console.error(`Server error: ${e}`);
      process.exit(1);
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`\n✅ Tonr landing page is running at:`);
    console.log(`   http://localhost:${port}\n`);
    if (port !== PREFERRED_PORT) {
      console.log(`   (Port ${PREFERRED_PORT} was unavailable, using ${port} instead)\n`);
    }
    console.log('Press Ctrl+C to stop the server.\n');
  });
}

startServer(PREFERRED_PORT);

