# Compila la APK de Paletizado 3D en Windows (PowerShell).
# Uso, desde la carpeta del proyecto:
#   npm run apk
# o bien:
#   powershell -ExecutionPolicy Bypass -File scripts\compilar-apk.ps1
#
# Necesita: Node.js 22, JDK 21 (JAVA_HOME) y el SDK de Android (ANDROID_HOME, viene con Android Studio).
# Firma fija (opcional, para que el celular acepte las actualizaciones):
#   $env:FIRMA_ARCHIVO = "C:\ruta\paletizado.keystore"; $env:FIRMA_CLAVE = "la-clave"
# Sin firma fija la APK sale con la llave de depuración de este PC.

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

function Paso($texto) { Write-Host "`n== $texto" -ForegroundColor Cyan }
function Falla($texto) { Write-Host "ERROR: $texto" -ForegroundColor Red; exit 1 }
function Ejecutar($comando) {
  Write-Host "> $comando" -ForegroundColor DarkGray
  & cmd /c $comando
  if ($LASTEXITCODE -ne 0) { Falla "falló: $comando" }
}

Paso 'Revisando herramientas'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Falla 'No encontré Node.js. Instálalo (versión 22 LTS) desde https://nodejs.org' }
$versionNode = [int]((node -v).TrimStart('v').Split('.')[0])
if ($versionNode -lt 20) { Falla "Node.js $((node -v)) es muy viejo. Instala la versión 22 LTS." }
if (-not $env:JAVA_HOME -and -not (Get-Command java -ErrorAction SilentlyContinue)) { Falla 'No encontré Java. Instala el JDK 21 (Microsoft Build of OpenJDK o Temurin) y define JAVA_HOME.' }
if (-not $env:ANDROID_HOME) {
  $sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  if (Test-Path $sdk) { $env:ANDROID_HOME = $sdk } else { Falla 'No encontré el SDK de Android. Instala Android Studio o define ANDROID_HOME.' }
}
Write-Host "Node $(node -v) · ANDROID_HOME=$env:ANDROID_HOME"

Paso 'Instalando bibliotecas'
Ejecutar 'npm install'

Paso 'Pruebas'
Ejecutar 'npm test'

Paso 'Preparando la app web'
Ejecutar 'npm run build'

Paso 'Proyecto Android'
if (-not (Test-Path 'android')) { Ejecutar 'npx cap add android' }
Ejecutar 'npx cap sync android'

if ($env:FIRMA_ARCHIVO -and $env:FIRMA_CLAVE -and (Test-Path -LiteralPath $env:FIRMA_ARCHIVO)) {
  Paso 'Firma fija'
  Ejecutar 'node scripts/firmar-android.js'
} else {
  Write-Host 'Sin firma fija: la APK usa la llave de depuración de este PC.' -ForegroundColor Yellow
}

Paso 'Compilando APK'
Push-Location android
try { Ejecutar 'gradlew.bat assembleDebug --no-daemon' } finally { Pop-Location }

$apk = 'android\app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path $apk)) { Falla 'No se generó la APK.' }
New-Item -ItemType Directory -Force -Path 'salida' | Out-Null
Copy-Item $apk 'salida\paletizado-3d.apk' -Force
$mb = [math]::Round((Get-Item 'salida\paletizado-3d.apk').Length / 1MB, 1)
Write-Host "`nListo: salida\paletizado-3d.apk ($mb MB)" -ForegroundColor Green
