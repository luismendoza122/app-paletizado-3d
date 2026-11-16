# Ficha técnica para TI – Paletizado 3D (copia corporativa)

**Uso:** conformación de palets en 3D y toma de datos de posiciones de picking del CEDI ATS R10 Valledupar.
**Responsable:** Luis Alfonso Mendoza Corzo (operador logístico).

## Qué hace en el equipo
| Punto | Detalle |
|---|---|
| Instalación | Ninguna. Carpeta portable; se puede borrar en cualquier momento. |
| Permisos | Usuario estándar. No pide administrador ni elevación (UAC). |
| Proceso | `powershell.exe` (Windows PowerShell 5.1) ejecutando `Iniciar-Paletizado.ps1` con `-ExecutionPolicy Bypass` **solo para ese proceso** (no cambia la política del equipo). |
| Red local | Servidor de archivos estáticos de solo lectura con `System.Net.Sockets.TcpListener` en **127.0.0.1** (puerto 8765 o siguiente libre). No usa http.sys ni reservas de URL; no abre puertos hacia la red; Windows Firewall no pide permiso. Solo GET/HEAD; POST/PUT dan 405; rutas fuera de `app\` dan 403. |
| Archivos escritos | Solo `%LOCALAPPDATA%\Paletizado3D-Corporativo\` (registro.txt ≤ 1 MB con rotación, puerto.txt, informe-pc.txt). |
| Registro de Windows | No lo toca. Sin tareas programadas, servicios ni inicio automático. |
| Navegador | Chrome o Edge con `--app=http://127.0.0.1:<puerto>/` usando el perfil normal del usuario (respeta políticas del navegador, proxy y certificados corporativos). |
| Internet | El script de PowerShell **no** sale a internet. La página usa, desde el navegador: `nfrqrboqxcpgsagnmwqq.supabase.co` (nube compartida de la app, HTTPS), `luismendoza122.github.io` (versión web oficial, alternativa) y opcionalmente `script.google.com` (puente a Google Drive, solo si el usuario lo configura) y `m365.cloud.microsoft` (agente en Copilot). |
| Librerías | Three.js y SheetJS incluidas en `app\vendor` (sin CDN). |
| Integridad | `TI\integridad.json` trae el SHA-256 de cada archivo; el lanzador los compara al abrir y avisa si alguno cambió. `Iniciar-Paletizado.ps1 -SoloRevisar` devuelve 0 si todo coincide y 4 si no. |
| Restricciones de TI | Si PowerShell está en `ConstrainedLanguage` (AppLocker/WDAC), el lanzador no intenta saltarse nada: abre la versión web oficial y termina (código 3). Si la política `AllSigned` viene por GPO, el `.cmd` detecta el error y abre la web oficial. |
| Firma | Los `.ps1` no vienen firmados. Si la empresa exige `AllSigned`, TI puede firmarlos con su certificado: `Set-AuthenticodeSignature -FilePath .\Iniciar-Paletizado.ps1,.\nucleo\*.ps1 -Certificate <cert>`. |

## Códigos de salida de `Iniciar-Paletizado.ps1`
0 normal · 2 falta la carpeta app · 3 PowerShell restringido (abre la web) · 4 archivos cambiados (`-SoloRevisar`) · 5 sin puerto libre (abre la web).

## Pruebas
`nucleo\Probar-Paletizado.ps1` (Windows PowerShell 5.1 y PowerShell 7): integridad, tipos MIME, intentos de salir de la carpeta (`../`, `%2f`, `..\`, rutas de Windows), solo lectura, conexiones vacías, 30 pedidos seguidos, que no se vea desde la red, segunda apertura, puerto ocupado y archivo cambiado. En GitHub Actions también se prueba el modo restringido y las pantallas en Chrome.

## Quitarla
Cerrar la ventana, borrar la carpeta y, si se quiere, `%LOCALAPPDATA%\Paletizado3D-Corporativo`.
