// Firma la APK siempre con la MISMA llave, para que el celular acepte las actualizaciones.
// (Sin esto, cada compilación en GitHub usa una llave nueva y Android dice "conflicto de paquetes".)
// Uso: FIRMA_ARCHIVO=ruta/llave.keystore FIRMA_CLAVE=... FIRMA_ALIAS=... node scripts/firmar-android.js
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const archivo = process.env.FIRMA_ARCHIVO;
const clave = process.env.FIRMA_CLAVE;
const alias = process.env.FIRMA_ALIAS || 'paletizado';
if (!archivo || !clave || !existsSync(archivo)) {
  console.error('Falta la llave de firma (FIRMA_ARCHIVO y FIRMA_CLAVE).');
  process.exit(1);
}
const gradle = resolve('android/app/build.gradle');
let texto = readFileSync(gradle, 'utf8');
if (!texto.includes('signingConfigs.fija')) {
  const ruta = resolve(archivo).replace(/\\/g, '/');
  texto += `
// Firma fija agregada por scripts/firmar-android.js
android {
    signingConfigs {
        fija {
            storeFile file('${ruta}')
            storePassword '${clave}'
            keyAlias '${alias}'
            keyPassword '${clave}'
        }
    }
    buildTypes {
        debug { signingConfig signingConfigs.fija }
        release { signingConfig signingConfigs.fija }
    }
}
`;
  writeFileSync(gradle, texto);
}
console.log('Firma fija lista:', archivo);
