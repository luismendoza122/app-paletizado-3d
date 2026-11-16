# Servidor local de Paletizado 3D para PCs corporativos.
# - Solo escucha en 127.0.0.1 (no se ve desde la red, Windows no pide permiso de firewall).
# - No usa http.sys ni reservas de URL: no necesita administrador.
# - Solo entrega archivos de la carpeta app (GET y HEAD). No escribe nada en la carpeta.
# Funciona en Windows PowerShell 5.1 y en PowerShell 7.

$script:TiposPaletizado = @{
  '.html' = 'text/html; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.svg' = 'image/svg+xml'
  '.png' = 'image/png'
  '.ico' = 'image/x-icon'
  '.txt' = 'text/plain; charset=utf-8'
  '.wasm' = 'application/wasm'
}

function Get-RutaSegura {
  # Convierte la ruta pedida en un archivo dentro de $Raiz; devuelve $null si intenta salirse.
  param([string]$Raiz, [string]$RutaUrl)
  $limpia = ($RutaUrl -split '\?')[0] -split '#' | Select-Object -First 1
  try { $limpia = [System.Uri]::UnescapeDataString($limpia) } catch { return $null }
  if ($limpia.IndexOf([char]0) -ge 0) { return $null }
  $relativa = $limpia.TrimStart('/').Replace('/', '\')
  $raizCompleta = [System.IO.Path]::GetFullPath($Raiz).TrimEnd('\')
  try { $completa = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($raizCompleta, $relativa)) } catch { return $null }
  if ($completa -ne $raizCompleta -and -not $completa.StartsWith($raizCompleta + '\', [System.StringComparison]::OrdinalIgnoreCase)) { return $null }
  if (Test-Path -LiteralPath $completa -PathType Container) { $completa = Join-Path $completa 'index.html' }
  return $completa
}

function Send-Respuesta {
  param($Flujo, [int]$Codigo, [string]$Texto, [string]$Tipo, [byte[]]$Cuerpo, [bool]$SoloCabecera)
  if ($null -eq $Cuerpo) { $Cuerpo = [byte[]]@() }
  $cab = "HTTP/1.1 $Codigo $Texto`r`n" +
    "Content-Type: $Tipo`r`n" +
    "Content-Length: $($Cuerpo.Length)`r`n" +
    "Cache-Control: no-cache`r`n" +
    "X-Content-Type-Options: nosniff`r`n" +
    "Referrer-Policy: no-referrer`r`n" +
    "Connection: close`r`n`r`n"
  $b = [System.Text.Encoding]::ASCII.GetBytes($cab)
  $Flujo.Write($b, 0, $b.Length)
  if (-not $SoloCabecera -and $Cuerpo.Length -gt 0) { $Flujo.Write($Cuerpo, 0, $Cuerpo.Length) }
  $Flujo.Flush()
}

function Invoke-Solicitud {
  # Atiende una conexión: lee la primera línea, responde y cierra.
  param($Cliente, [string]$Raiz, [string]$Version)
  $Cliente.ReceiveTimeout = 5000
  $Cliente.SendTimeout = 15000
  $flujo = $Cliente.GetStream()
  $lector = New-Object System.IO.StreamReader($flujo, [System.Text.Encoding]::ASCII, $false, 8192, $true)
  $resultado = $null
  try {
    $linea = $lector.ReadLine()
    if ([string]::IsNullOrWhiteSpace($linea)) { return $null }
    # Leer (y descartar) las cabeceras
    $n = 0
    while ($n -lt 100) { $c = $lector.ReadLine(); if ([string]::IsNullOrEmpty($c)) { break }; $n++ }
    $partes = $linea.Split(' ')
    $metodo = $partes[0].ToUpperInvariant()
    $ruta = if ($partes.Length -gt 1) { $partes[1] } else { '/' }
    $resultado = @{ metodo = $metodo; ruta = $ruta; codigo = 0 }
    if ($metodo -ne 'GET' -and $metodo -ne 'HEAD') {
      Send-Respuesta $flujo 405 'Method Not Allowed' 'text/plain; charset=utf-8' ([System.Text.Encoding]::UTF8.GetBytes('Solo lectura')) $false
      $resultado.codigo = 405; return $resultado
    }
    $soloCab = ($metodo -eq 'HEAD')
    if ($ruta -like '/__estado*') {
      $json = '{"app":"paletizado-3d-corporativo","version":"' + $Version + '"}'
      Send-Respuesta $flujo 200 'OK' 'application/json; charset=utf-8' ([System.Text.Encoding]::UTF8.GetBytes($json)) $soloCab
      $resultado.codigo = 200; return $resultado
    }
    $archivo = Get-RutaSegura -Raiz $Raiz -RutaUrl $ruta
    if ($null -eq $archivo) {
      Send-Respuesta $flujo 403 'Forbidden' 'text/plain; charset=utf-8' ([System.Text.Encoding]::UTF8.GetBytes('No permitido')) $soloCab
      $resultado.codigo = 403; return $resultado
    }
    if (-not (Test-Path -LiteralPath $archivo -PathType Leaf)) {
      Send-Respuesta $flujo 404 'Not Found' 'text/plain; charset=utf-8' ([System.Text.Encoding]::UTF8.GetBytes('No encontrado')) $soloCab
      $resultado.codigo = 404; return $resultado
    }
    $ext = [System.IO.Path]::GetExtension($archivo).ToLowerInvariant()
    $tipo = $script:TiposPaletizado[$ext]
    if (-not $tipo) { $tipo = 'application/octet-stream' }
    $datos = [System.IO.File]::ReadAllBytes($archivo)
    Send-Respuesta $flujo 200 'OK' $tipo $datos $soloCab
    $resultado.codigo = 200
    return $resultado
  } catch {
    return $resultado
  } finally {
    try { $lector.Dispose() } catch {}
    try { $Cliente.Close() } catch {}
  }
}

function New-Escucha {
  # Intenta abrir el puerto en 127.0.0.1. Devuelve el TcpListener o $null si está ocupado.
  param([int]$Puerto)
  try {
    $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Puerto)
    $l.Server.ExclusiveAddressUse = $true
    $l.Start()
    return $l
  } catch { return $null }
}

function Test-PaletizadoEnPuerto {
  # ¿Ya hay un Paletizado corporativo atendiendo en ese puerto?
  param([int]$Puerto)
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $iar = $c.BeginConnect('127.0.0.1', $Puerto, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne(800)) { $c.Close(); return $false }
    $c.EndConnect($iar)
    $c.ReceiveTimeout = 1500
    $s = $c.GetStream()
    $p = [System.Text.Encoding]::ASCII.GetBytes("GET /__estado HTTP/1.1`r`nHost: 127.0.0.1`r`nConnection: close`r`n`r`n")
    $s.Write($p, 0, $p.Length)
    $r = New-Object System.IO.StreamReader($s)
    $texto = $r.ReadToEnd()
    $c.Close()
    return ($texto -match 'paletizado-3d-corporativo')
  } catch { return $false }
}

function Start-BucleServidor {
  # Atiende solicitudes hasta que se cierre la ventana, se pulse Ctrl+C o aparezca el archivo $ArchivoParar.
  # Los navegadores abren conexiones "por si acaso" sin enviar nada: se atienden solo las que ya
  # trajeron datos, así una conexión callada no frena a las demás.
  param($Escucha, [string]$Raiz, [string]$Version, [string]$ArchivoParar, [scriptblock]$AlAtender)
  $espera = New-Object System.Collections.ArrayList
  $vuelta = 0
  while ($true) {
    $vuelta++
    if ($ArchivoParar -and ($vuelta % 20 -eq 0) -and (Test-Path -LiteralPath $ArchivoParar)) { break }
    while ($Escucha.Pending()) { [void]$espera.Add(@{ c = $Escucha.AcceptTcpClient(); t = [DateTime]::UtcNow }) }
    $hubo = $false
    for ($i = $espera.Count - 1; $i -ge 0; $i--) {
      $e = $espera[$i]
      $disponibles = 0
      try { $disponibles = $e.c.Available } catch { $disponibles = -1 }
      if ($disponibles -gt 0) {
        $espera.RemoveAt($i)
        $r = Invoke-Solicitud -Cliente $e.c -Raiz $Raiz -Version $Version
        if ($AlAtender -and $r) { & $AlAtender $r }
        $hubo = $true
      } elseif ($disponibles -lt 0 -or ([DateTime]::UtcNow - $e.t).TotalSeconds -gt 20) {
        $espera.RemoveAt($i)
        try { $e.c.Close() } catch {}
      }
    }
    if (-not $hubo) { Start-Sleep -Milliseconds 15 }
  }
  foreach ($e in $espera) { try { $e.c.Close() } catch {} }
}
