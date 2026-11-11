// Prepara la versión para la página de claude.ai (artefacto) en la carpeta artefacto/:
// igual a www/, pero Three.js y el lector de Excel se cargan desde CDN permitidos.
import { cpSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'artefacto');
rmSync(destino, { recursive: true, force: true });
cpSync(join(raiz, 'www'), destino, { recursive: true, filter: (f) => !f.includes(`${join('www', 'vendor')}`) });
const version = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')).dependencies.three.replace(/[^0-9.]/g, '');
let html = readFileSync(join(destino, 'index.html'), 'utf8');
html = html
  .replace('"./vendor/three/three.module.js"', `"https://cdn.jsdelivr.net/npm/three@${version}/build/three.module.js"`)
  .replace('"./vendor/three/addons/"', `"https://cdn.jsdelivr.net/npm/three@${version}/examples/jsm/"`)
  .replace('src="vendor/xlsx.full.min.js"', 'src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"');
writeFileSync(join(destino, 'index.html'), html);
console.log('Listo: carpeta artefacto/ preparada (three', version + ')');
