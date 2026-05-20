const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DATA_DIR = path.join(__dirname, '..', 'data');

// Ensure the data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/save-data') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const { label, data } = JSON.parse(body);
        const timestamp = Date.now();
        const filename = `${label.toLowerCase()}_${timestamp}.json`;
        const filepath = path.join(DATA_DIR, filename);

        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        console.log(`[Success] Saved ${data.length} frames for label "${label}" to ${filename}`);
        
        res.statusCode = 200;
        res.end(JSON.stringify({ message: 'Saved successfully', filename }));
      } catch (err) {
        console.error('[Error] Failed to save data:', err.message);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else {
    res.statusCode = 404;
    res.end();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`--------------------------------------------------`);
  console.log(`Data Collection Server Running!`);
  console.log(`Listening on: http://localhost:${PORT}`);
  console.log(`Saving files to: ${DATA_DIR}`);
  console.log(`--------------------------------------------------`);
});
