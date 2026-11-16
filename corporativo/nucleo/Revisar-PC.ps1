# Revisa qué permite este PC corporativo y deja un informe para Luis o para TI.
# No cambia nada en el PC: solo lee.
$ErrorActionPreference = 'Continue'
$raiz = Split-Path -Parent $PSScriptRoot
$datos = Join-Path $env:LOCALAPPDATA 'Paletizado3D-Corporativo'
New-Item -ItemType Directory -Force -Path $datos | Out-Null
$informe = Join-Path $datos 'informe-pc.txt'
$lineas = New-Object System.Collections.Generic.List[string]
function Agregar([string]$t) { $lineas.Add($t); Write-Host $t }

Agregar "INFORME DEL PC - Paletizado 3D corporativo - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
Agregar "Equipo: $env:COMPUTERNAME   Usuario: $env:USERNAME"
Agregar "Windows: $([System.Environment]::OSVersion.VersionString)"
Agregar "PowerShell: $($PSVersionTable.PSVersion)   Modo de lenguaje: $($ExecutionContext.SessionState.LanguageMode)"
Agregar ''
Agregar 'Políticas de ejecución (la de arriba manda):'
try { Get-ExecutionPolicy -List | ForEach-Object { Agregar ("  {0,-14} {1}" -f $_.Scope, $_.ExecutionPolicy) } } catch { Agregar '  No se pudieron leer.' }
Agregar ''
Agregar 'Navegadores encontrados:'
$hay = $false
foreach ($base in @(${env:ProgramFiles}, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
  if (-not $base) { continue }
  foreach ($r in @('Google\Chrome\Application\chrome.exe', 'Microsoft\Edge\Application\msedge.exe')) {
    $exe = Join-Path $base $r
    if (Test-Path -LiteralPath $exe) { $hay = $true; Agregar "  $exe  (versión $((Get-Item -LiteralPath $exe).VersionInfo.ProductVersion))" }
  }
}
if (-not $hay) { Agregar '  Ninguno en las rutas normales: se usará el navegador predeterminado.' }
Agregar ''
$conf = 8765
$archivoPuerto = Join-Path $datos 'puerto.txt'
if (Test-Path -LiteralPath $archivoPuerto) { $conf = (Get-Content -LiteralPath $archivoPuerto -Raw).Trim() }
Agregar "Puerto local de la app: $conf"
if ($ExecutionContext.SessionState.LanguageMode -eq 'FullLanguage') {
  try {
    $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0); $l.Start(); $p = $l.LocalEndpoint.Port; $l.Stop()
    Agregar "  Abrir un puerto local (127.0.0.1) funciona (prueba en $p)."
  } catch { Agregar "  No se puede abrir un puerto local: $($_.Exception.Message)" }
  try {
    $proxy = [System.Net.WebRequest]::GetSystemWebProxy()
    $destino = [Uri]'https://nfrqrboqxcpgsagnmwqq.supabase.co'
    $via = $proxy.GetProxy($destino)
    if ($via -eq $destino) { Agregar 'Proxy: conexión directa.' } else { Agregar "Proxy corporativo: $via" }
  } catch {}
} else {
  Agregar '  PowerShell restringido por TI: la copia abrirá la versión web oficial.'
}
Agregar ''
Agregar 'Acceso a internet que usa la app (lo usa el navegador, no este script):'
foreach ($u in @('https://luismendoza122.github.io/app-paletizado-3d/', 'https://nfrqrboqxcpgsagnmwqq.supabase.co/functions/v1/paletizado', 'https://m365.cloud.microsoft/')) {
  try {
    $r = Invoke-WebRequest -Uri $u -UseBasicParsing -UseDefaultCredentials -Method Head -TimeoutSec 10
    Agregar "  OK  $u ($($r.StatusCode))"
  } catch {
    $c = $null; try { $c = [int]$_.Exception.Response.StatusCode } catch {}
    if ($c) { Agregar "  OK  $u (responde $c)" } else { Agregar "  BLOQUEADO o sin red  $u" }
  }
}
Agregar ''
$int = Join-Path $raiz 'TI\integridad.json'
if (Test-Path -LiteralPath $int) {
  $j = Get-Content -LiteralPath $int -Raw -Encoding UTF8 | ConvertFrom-Json
  $mal = @($j.archivos | Where-Object { $f = Join-Path $raiz ($_.ruta.Replace('/', '\')); -not (Test-Path -LiteralPath $f) -or ([System.BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash([System.IO.File]::ReadAllBytes($f)))).Replace('-', '').ToLowerInvariant() -ne $_.sha256 })
  if ($mal.Count -eq 0) { Agregar "Archivos de la app: $($j.archivos.Count) originales." } else { Agregar "Archivos cambiados o faltantes: $(($mal | ForEach-Object { $_.ruta }) -join ', ')" }
}
$lineas | Set-Content -LiteralPath $informe -Encoding UTF8
Write-Host ''
Write-Host "Informe guardado en: $informe" -ForegroundColor Green
