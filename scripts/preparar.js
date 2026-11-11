// Copia Three.js y el lector de Excel dentro de www/vendor para que la app funcione sin internet
// (en Vercel y dentro de la APK). Se corre con:  npm run build
import { cpSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(raiz, 'node_modules');
const vendor = join(raiz, 'www', 'vendor');
rmSync(vendor, { recursive: true, force: true });
mkdirSync(join(vendor, 'three', 'addons', 'controls'), { recursive: true });

const copiar = (desde, hacia, obligatorio = true) => {
  if (!existsSync(desde)) {
    if (obligatorio) throw new Error(`No encontré ${desde}. Corre primero: npm install`);
    console.warn(`Aviso: falta ${desde}`);
    return;
  }
  cpSync(desde, hacia, { recursive: true });
  console.log('Copiado', hacia.replace(raiz, '.'));
};

// Three.js (el módulo principal importa three.core.js en las versiones nuevas)
copiar(join(nm, 'three', 'build', 'three.module.js'), join(vendor, 'three', 'three.module.js'));
copiar(join(nm, 'three', 'build', 'three.core.js'), join(vendor, 'three', 'three.core.js'), false);
copiar(join(nm, 'three', 'examples', 'jsm', 'controls', 'OrbitControls.js'), join(vendor, 'three', 'addons', 'controls', 'OrbitControls.js'));
// Lector de Excel (SheetJS)
copiar(join(nm, 'xlsx', 'dist', 'xlsx.full.min.js'), join(vendor, 'xlsx.full.min.js'));
console.log('Listo: www/vendor preparado.');
