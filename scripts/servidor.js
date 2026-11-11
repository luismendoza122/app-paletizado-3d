// Servidor local para probar la app en el PC:  npm start  →  http://localhost:5173
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const www = join(dirname(fileURLToPath(import.meta.url)), '..', 'www');
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const puerto = Number(process.env.PORT) || 5173;

createServer(async (req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const archivo = normalize(join(www, ruta === '/' ? 'index.html' : ruta));
  if (!archivo.startsWith(www)) { res.writeHead(403); res.end(); return; }
  try {
    const datos = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': (tipos[extname(archivo)] || 'application/octet-stream') + '; charset=utf-8' });
    res.end(datos);
  } catch {
    res.writeHead(404); res.end('No encontrado');
  }
}).listen(puerto, () => console.log(`Paletizado 3D en http://localhost:${puerto}`));
