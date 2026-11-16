<#
  Paletizado 3D – copia corporativa (CEDI ATS R10 Valledupar)
  Abre la app en este PC sin instalar nada y sin permisos de administrador.
  Se adapta solo a lo que pida TI:
    - Modo de lenguaje restringido (AppLocker/WDAC)  -> abre la versión web oficial.
    - Puerto ocupado                                 -> busca otro y lo recuerda.
    - Sin Chrome                                     -> usa Microsoft Edge o el navegador predeterminado.
    - Proxy corporativo                              -> lo maneja el navegador (este script no sale a internet).
  Uso: doble clic en Iniciar-Paletizado.cmd
#>
[CmdletBinding()]
param(
  [int]$Puerto = 0,
  [ValidateSet('auto', 'chrome', 'edge', 'predeterminado', 'ninguno')]
  [string]$Navegador = '',
  [string]$ArchivoParar = '',
  [switch]$SoloRevisar
)

$ErrorActionPreference = 'Stop'
$VERSION = '0.8.3-corp.1'
$WEB_OFICIAL = 'https://luismendoza122.github.io/app-paletizado-3d/'
$raiz = $PSScriptRoot
$app = Join-Path $raiz 'app'

# ---------- Carpeta de datos del usuario (nada se guarda en Archivos de programa ni en el registro) ----------
$baseDatos = $env:LOCALAPPDATA
if (-not $baseDatos) { $baseDatos = $env:TEMP }
$datos = Join-Path $baseDatos 'Paletizado3D-Corporativo'
try { New-Item -ItemType Directory -Force -Path $datos | Out-Null } catch { $datos = $env:TEMP }
$registro = Join-Path $datos 'registro.txt'

function Write-Registro([string]$texto) {
  try {
    if ((Test-Path -LiteralPath $registro) -and ((Get-Item -LiteralPath $registro).Length -gt 1MB)) {
      Move-Item -LiteralPath $registro -Destination ($registro + '.anterior') -Force
    }
    Add-Content -LiteralPath $registro -Value ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $texto) -Encoding UTF8
  } catch {}
}

function Write-Paso([string]$texto, [string]$color = 'Gray') {
  Write-Host $texto -ForegroundColor $color
  Write-Registro $texto
}

function Open-Web([string]$url, [string]$preferido) {
  # Abre la URL en modo ventana (sin barras) con Chrome o Edge; si no hay, con el navegador predeterminado.
  if ($preferido -eq 'ninguno') { return 'ninguno' }
  $candidatos = @()
  # Rutas armadas solo con lo que existe (en algunos PCs falta ProgramFiles(x86))
  $chrome = @(); $edge = @()
  foreach ($base in @(${env:ProgramFiles}, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
    if ($base) {
      $chrome += ($base + '\Google\Chrome\Application\chrome.exe')
      $edge += ($base + '\Microsoft\Edge\Application\msedge.exe')
    }
  }
  if ($preferido -eq 'edge') { $candidatos = $edge + $chrome }
  elseif ($preferido -ne 'predeterminado') { $candidatos = $chrome + $edge }
  foreach ($exe in $candidatos) {
    if ($exe -and (Test-Path -LiteralPath $exe)) {
      try {
        Start-Process -FilePath $exe -ArgumentList @("--app=$url", '--new-window') | Out-Null
        return (Get-Item -LiteralPath $exe).BaseName
      } catch { Write-Registro "No pude abrir $exe : $($_.Exception.Message)" }
    }
  }
  try { Start-Process $url | Out-Null; return 'predeterminado' } catch { return 'ninguno' }
}

function Read-Configuracion {
  $conf = @{ puerto = 8765; navegador = 'auto' }
  $archivo = Join-Path $raiz 'configuracion.json'
  if (Test-Path -LiteralPath $archivo) {
    try {
      $j = Get-Content -LiteralPath $archivo -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($j.puerto) { $conf.puerto = [int]$j.puerto }
      if ($j.navegador) { $conf.navegador = [string]$j.navegador }
    } catch { Write-Registro "configuracion.json no se pudo leer: $($_.Exception.Message)" }
  }
  return $conf
}

function Test-Integridad {
  # Compara cada archivo de la app con la huella guardada en TI\integridad.json.
  $lista = Join-Path $raiz 'TI\integridad.json'
  if (-not (Test-Path -LiteralPath $lista)) { return @{ ok = $true; revisados = 0; distintos = @() } }
  $j = Get-Content -LiteralPath $lista -Raw -Encoding UTF8 | ConvertFrom-Json
  $distintos = @()
  $n = 0
  foreach ($a in $j.archivos) {
    $n++
    $ruta = Join-Path $raiz ($a.ruta.Replace('/', '\'))
    if (-not (Test-Path -LiteralPath $ruta)) { $distintos += "$($a.ruta) (falta)"; continue }
    $h = (Get-FileHash -LiteralPath $ruta -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($h -ne $a.sha256) { $distintos += $a.ruta }
  }
  return @{ ok = ($distintos.Count -eq 0); revisados = $n; distintos = $distintos }
}

# ---------- Inicio ----------
try { $Host.UI.RawUI.WindowTitle = "Paletizado 3D (corporativo) $VERSION" } catch {}
Write-Paso "Paletizado 3D - copia corporativa $VERSION" 'Cyan'

$conf = Read-Configuracion
if (-not $Navegador) { $Navegador = $conf.navegador }

# 1) Modo de lenguaje: con AppLocker/WDAC PowerShell queda restringido y no puede abrir el servidor.
$modo = $ExecutionContext.SessionState.LanguageMode
if ($modo -ne 'FullLanguage') {
  Write-Paso "TI tiene PowerShell en modo restringido ($modo). Abro la versión web oficial: funciona igual." 'Yellow'
  Open-Web $WEB_OFICIAL $Navegador | Out-Null
  exit 3
}

Write-Registro "PowerShell $($PSVersionTable.PSVersion) | $([System.Environment]::OSVersion.VersionString) | usuario $env:USERNAME"

# 2) La app debe estar completa
if (-not (Test-Path -LiteralPath (Join-Path $app 'index.html'))) {
  Write-Paso "No encuentro la carpeta app junto a este archivo. Descomprime todo el paquete antes de abrirlo." 'Red'
  Open-Web $WEB_OFICIAL $Navegador | Out-Null
  exit 2
}

# 3) Integridad (avisa si alguien cambió archivos de la app)
$int = Test-Integridad
if ($int.ok) { Write-Paso "Archivos revisados: $($int.revisados), todos originales." 'Green' }
else { Write-Paso ("Aviso: estos archivos no coinciden con el paquete original: " + ($int.distintos -join ', ')) 'Yellow' }
if ($SoloRevisar) { if ($int.ok) { exit 0 } else { exit 4 } }

# 4) Puerto: se recuerda el último para que los datos guardados en el navegador sigan apareciendo
. (Join-Path $raiz 'nucleo\servidor.ps1')
$archivoPuerto = Join-Path $datos 'puerto.txt'
$preferido = $conf.puerto
if ($Puerto -gt 0) { $preferido = $Puerto }
elseif (Test-Path -LiteralPath $archivoPuerto) {
  $guardado = 0
  if ([int]::TryParse((Get-Content -LiteralPath $archivoPuerto -Raw).Trim(), [ref]$guardado) -and $guardado -gt 1024) { $preferido = $guardado }
}

$escucha = $null
$puertoUsado = 0
foreach ($p in @($preferido) + (($preferido + 1)..($preferido + 15))) {
  if (Test-PaletizadoEnPuerto -Puerto $p) {
    $url = "http://127.0.0.1:$p/"
    Write-Paso "Paletizado ya está abierto en $url. Abro otra ventana." 'Green'
    Open-Web $url $Navegador | Out-Null
    exit 0
  }
  $escucha = New-Escucha -Puerto $p
  if ($escucha) { $puertoUsado = $p; break }
  Write-Registro "Puerto $p ocupado por otro programa."
}
if (-not $escucha) {
  Write-Paso "No encontré un puerto libre en este PC. Abro la versión web oficial." 'Yellow'
  Open-Web $WEB_OFICIAL $Navegador | Out-Null
  exit 5
}
if ($Puerto -le 0) { try { Set-Content -LiteralPath $archivoPuerto -Value $puertoUsado -Encoding ASCII } catch {} }

$url = "http://127.0.0.1:$puertoUsado/"
$abierto = Open-Web $url $Navegador
Write-Paso "Paletizado 3D abierto en $url ($abierto)." 'Green'
Write-Host ''
Write-Host 'Deja esta ventana abierta (puedes minimizarla). Para salir, ciérrala.' -ForegroundColor White
Write-Host "Registro: $registro" -ForegroundColor DarkGray

try {
  Start-BucleServidor -Escucha $escucha -Raiz $app -Version $VERSION -ArchivoParar $ArchivoParar
} finally {
  try { $escucha.Stop() } catch {}
  Write-Registro 'Servidor detenido.'
}
