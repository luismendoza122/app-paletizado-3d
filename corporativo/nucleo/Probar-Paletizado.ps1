# Pruebas de la copia corporativa en un Windows real (las corre GitHub Actions y se pueden correr en el PC).
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File nucleo\Probar-Paletizado.ps1
param([string]$Paquete = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
$fallas = 0
$total = 0
function Revisar([string]$nombre, [bool]$ok, [string]$detalle = '') {
  $script:total++
  if ($ok) { Write-Host "  BIEN  $nombre" -ForegroundColor Green }
  else { $script:fallas++; Write-Host "  MAL   $nombre  $detalle" -ForegroundColor Red }
}
$exePS = (Get-Process -Id $PID).Path
Write-Host "Probando con $exePS ($($PSVersionTable.PSVersion))" -ForegroundColor Cyan

# Copia del paquete en una ruta con espacios y tildes (como OneDrive - Empresa\Escritorio)
$tmp = Join-Path $env:TEMP ("Prueba Paletización Ñ " + [guid]::NewGuid().ToString('N').Substring(0, 6))
Copy-Item -LiteralPath $Paquete -Destination $tmp -Recurse
$iniciar = Join-Path $tmp 'Iniciar-Paletizado.ps1'

function Iniciar([int]$puerto, [string]$parar, [hashtable]$entorno = @{}) {
  $argumentos = @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$iniciar`"", '-Navegador', 'ninguno', '-Puerto', $puerto, '-ArchivoParar', "`"$parar`"")
  $si = New-Object System.Diagnostics.ProcessStartInfo
  $si.FileName = $exePS
  $si.Arguments = ($argumentos -join ' ')
  $si.UseShellExecute = $false
  $si.CreateNoWindow = $true
  foreach ($k in $entorno.Keys) { $si.EnvironmentVariables[$k] = $entorno[$k] }
  return [System.Diagnostics.Process]::Start($si)
}
function Esperar-Puerto([int]$p) {
  for ($i = 0; $i -lt 100; $i++) {
    try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $p); $c.Close(); return $true } catch { Start-Sleep -Milliseconds 100 }
  }
  return $false
}
function Pedir-Crudo([int]$p, [string]$texto) {
  $c = New-Object System.Net.Sockets.TcpClient('127.0.0.1', $p)
  $c.ReceiveTimeout = 5000
  $s = $c.GetStream()
  $b = [System.Text.Encoding]::ASCII.GetBytes($texto)
  $s.Write($b, 0, $b.Length)
  $r = (New-Object System.IO.StreamReader($s)).ReadToEnd()
  $c.Close()
  return $r
}
function Pedir([string]$url) { return Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10 }

# 1) Integridad
& $exePS -NoProfile -ExecutionPolicy Bypass -File $iniciar -SoloRevisar | Out-Null
Revisar 'Integridad: todos los archivos originales' ($LASTEXITCODE -eq 0) "salida $LASTEXITCODE"

# 2) Servidor
$puerto = 18765
$parar = Join-Path $env:TEMP "parar-$puerto.txt"
Remove-Item -LiteralPath $parar -ErrorAction SilentlyContinue
$proc = Iniciar $puerto $parar
Revisar 'El servidor arranca en 127.0.0.1' (Esperar-Puerto $puerto)
$base = "http://127.0.0.1:$puerto"
try {
  # Una conexión callada (como las que abre Chrome por adelantado) no debe frenar a las demás
  $callada = New-Object System.Net.Sockets.TcpClient('127.0.0.1', $puerto)
  $reloj = [System.Diagnostics.Stopwatch]::StartNew()
  $r = Pedir "$base/"
  $reloj.Stop()
  Revisar 'Página principal (200, HTML)' ($r.StatusCode -eq 200 -and $r.Headers['Content-Type'] -like 'text/html*' -and $r.Content -match 'Paletizado')
  Revisar 'Una conexión callada no frena (menos de 2 s)' ($reloj.ElapsedMilliseconds -lt 2000) "$($reloj.ElapsedMilliseconds) ms"
  $callada.Close()
  foreach ($a in @(
      @('/js/app.js', 'text/javascript*'), @('/js/motor/mono.js', 'text/javascript*'), @('/css/estilos.css', 'text/css*'),
      @('/vendor/three/three.module.js', 'text/javascript*'), @('/vendor/three/addons/controls/OrbitControls.js', 'text/javascript*'),
      @('/vendor/xlsx.full.min.js', 'text/javascript*'), @('/manifest.webmanifest', 'application/manifest+json*'),
      @('/icons/icono-192.png', 'image/png'), @('/sw.js', 'text/javascript*'), @('/index.html?v=1', 'text/html*'))) {
    $r = Pedir ($base + $a[0])
    $local = Join-Path (Join-Path $tmp 'app') ((($a[0] -split '\?')[0]).TrimStart('/').Replace('/', '\'))
    $igual = ($r.RawContentLength -eq (Get-Item -LiteralPath $local).Length)
    Revisar "$($a[0]) ($($a[1]))" ($r.StatusCode -eq 200 -and $r.Headers['Content-Type'] -like $a[1] -and $igual) "$($r.Headers['Content-Type']) $($r.RawContentLength)"
  }
  if ([System.Net.Sockets.Socket]::OSSupportsIPv6) {
    $ok6 = $false; try { $ok6 = (Pedir "http://[::1]:$puerto/__estado").Content -match 'paletizado' } catch {}
    Revisar 'También responde en [::1] (localhost por IPv6)' $ok6
  }
  $e = Pedir "$base/__estado"
  Revisar 'Estado responde paletizado-3d-corporativo' ($e.Content -match 'paletizado-3d-corporativo')
  $t = Pedir-Crudo $puerto "GET /..%2f..%2fTI%2fintegridad.json HTTP/1.1`r`nHost: x`r`n`r`n"
  Revisar 'No deja salir de la carpeta app (%2f)' ($t -match '^HTTP/1.1 403')
  $t = Pedir-Crudo $puerto "GET /../../Iniciar-Paletizado.ps1 HTTP/1.1`r`nHost: x`r`n`r`n"
  Revisar 'No deja salir de la carpeta app (../)' ($t -match '^HTTP/1.1 403')
  $t = Pedir-Crudo $puerto "GET /..\..\configuracion.json HTTP/1.1`r`nHost: x`r`n`r`n"
  Revisar 'No deja salir de la carpeta app (..\)' ($t -match '^HTTP/1.1 (403|404)')
  $t = Pedir-Crudo $puerto "GET /C:%5cWindows%5cwin.ini HTTP/1.1`r`nHost: x`r`n`r`n"
  Revisar 'No entrega archivos de Windows' ($t -match '^HTTP/1.1 (403|404)')
  $t = Pedir-Crudo $puerto "GET /no-existe.js HTTP/1.1`r`nHost: x`r`n`r`n"
  Revisar 'Archivo inexistente da 404' ($t -match '^HTTP/1.1 404')
  $t = Pedir-Crudo $puerto "POST /index.html HTTP/1.1`r`nHost: x`r`nContent-Length: 0`r`n`r`n"
  Revisar 'Solo lectura: POST da 405' ($t -match '^HTTP/1.1 405')
  $t = Pedir-Crudo $puerto "HEAD /index.html HTTP/1.1`r`nHost: x`r`n`r`n"
  Revisar 'HEAD sin cuerpo' ($t -match '^HTTP/1.1 200' -and $t.TrimEnd().EndsWith('Connection: close'))
  # 30 pedidos seguidos (como al cargar la app)
  $bien = 0
  $reloj = [System.Diagnostics.Stopwatch]::StartNew()
  for ($i = 0; $i -lt 30; $i++) { if ((Pedir "$base/js/app.js").StatusCode -eq 200) { $bien++ } }
  $reloj.Stop()
  Revisar "30 pedidos seguidos ($($reloj.ElapsedMilliseconds) ms)" ($bien -eq 30)
  # Desde otra dirección del PC no debe verse (solo 127.0.0.1)
  $ipRed = $null
  try { $ipRed = [System.Net.Dns]::GetHostAddresses($env:COMPUTERNAME) | Where-Object { $_.AddressFamily -eq 'InterNetwork' -and -not [System.Net.IPAddress]::IsLoopback($_) } | Select-Object -First 1 } catch {}
  if ($ipRed) {
    $visto = $true
    try { $c = New-Object System.Net.Sockets.TcpClient; $iar = $c.BeginConnect($ipRed, $puerto, $null, $null); $visto = $iar.AsyncWaitHandle.WaitOne(1500) -and $c.Connected; $c.Close() } catch { $visto = $false }
    Revisar "No se ve desde la red ($ipRed)" (-not $visto)
  }
  # Segunda vez: detecta que ya está abierto y no abre otro servidor
  $reloj = [System.Diagnostics.Stopwatch]::StartNew()
  & $exePS -NoProfile -ExecutionPolicy Bypass -File $iniciar -Navegador ninguno -Puerto $puerto | Out-Null
  Revisar 'Segunda vez: reconoce el que ya está abierto' ($LASTEXITCODE -eq 0 -and $reloj.ElapsedMilliseconds -lt 15000) "salida $LASTEXITCODE"
} finally {
  Set-Content -LiteralPath $parar -Value 'parar'
  if (-not $proc.WaitForExit(10000)) { $proc.Kill() }
  Remove-Item -LiteralPath $parar -ErrorAction SilentlyContinue
}
Revisar 'Se detiene limpio' ($proc.ExitCode -eq 0) "salida $($proc.ExitCode)"

# 3) Puerto ocupado por otro programa: se corre al siguiente
$otro = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 18800)
$otro.Start()
$parar = Join-Path $env:TEMP 'parar-18800.txt'
Remove-Item -LiteralPath $parar -ErrorAction SilentlyContinue
$proc = Iniciar 18800 $parar
try {
  $ok = Esperar-Puerto 18801
  $r = $null; if ($ok) { $r = Pedir 'http://127.0.0.1:18801/__estado' }
  Revisar 'Puerto ocupado: usa el siguiente (18801)' ($ok -and $r.Content -match 'paletizado')
} finally {
  Set-Content -LiteralPath $parar -Value 'parar'
  if (-not $proc.WaitForExit(10000)) { $proc.Kill() }
  $otro.Stop()
  Remove-Item -LiteralPath $parar -ErrorAction SilentlyContinue
}

# 4) El modo restringido (AppLocker/WDAC) se prueba aparte en GitHub Actions: necesita una política de todo el equipo.

# 5) Un archivo cambiado se detecta
Add-Content -LiteralPath (Join-Path $tmp 'app\js\app.js') -Value '// cambio'
& $exePS -NoProfile -ExecutionPolicy Bypass -File $iniciar -SoloRevisar | Out-Null
Revisar 'Detecta un archivo cambiado' ($LASTEXITCODE -eq 4) "salida $LASTEXITCODE"

# 6) Revisión del PC corre sin errores
$salida = & $exePS -NoProfile -ExecutionPolicy Bypass -File (Join-Path $tmp 'nucleo\Revisar-PC.ps1') 2>&1 | Out-String
Revisar 'Revisar-PC genera el informe' ($salida -match 'Informe guardado')

Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ''
if ($fallas -eq 0) { Write-Host "RESULTADO: $total de $total pruebas bien" -ForegroundColor Green; exit 0 }
Write-Host "RESULTADO: $fallas de $total pruebas fallaron" -ForegroundColor Red
exit 1
