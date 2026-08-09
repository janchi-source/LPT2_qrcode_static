// Lokálny server na skúšku a na tlač rozpisov. Na Verceli sa nepoužíva.
//
// Kamera v prehliadači ide len na „secure context" — čiže na http://localhost
// (toto) alebo na https:// s dôveryhodným certifikátom (Vercel). Na tábore sa
// teda skenuje z nasadenej Vercel adresy, lokálne sa hlavne tlačí a testuje.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { handler } = require('./lib/handler');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, 'public');

const TYPY = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
};

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) return handler(req, res);

  const rel = u.pathname === '/' ? '/index.html' : u.pathname;
  // path.normalize + kontrola prefixu — bez toho by sa dalo cez ../ čítať
  // čokoľvek na disku.
  const subor = path.normalize(path.join(PUBLIC, decodeURIComponent(rel)));
  if (!subor.startsWith(PUBLIC)) { res.writeHead(403); return res.end('nie'); }

  fs.readFile(subor, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Nenájdené'); }
    res.writeHead(200, { 'Content-Type': TYPY[path.extname(subor)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`LPT2 statická hra beží na http://localhost:${PORT}`);
});
