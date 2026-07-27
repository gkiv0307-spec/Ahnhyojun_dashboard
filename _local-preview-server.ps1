param(
  [string]$RootPath = $PSScriptRoot,
  [int]$Port = 8080
)

$mimeMap = @{
  ".html" = "text/html; charset=utf-8"
  ".htm"  = "text/html; charset=utf-8"
  ".css"  = "text/css"
  ".js"   = "application/javascript"
  ".json" = "application/json"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
}

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)
$listener.Start()
Write-Output "STARTED $RootPath on port $Port (raw TCP)"

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII)
    $requestLine = $reader.ReadLine()
    while (-not [string]::IsNullOrEmpty($reader.ReadLine())) {} # skip headers

    $relPath = "index.html"
    if ($requestLine -match '^\w+\s+([^\s]+)\s+HTTP') {
      $relPath = [Uri]::UnescapeDataString($matches[1].TrimStart('/').Split('?')[0])
      if ([string]::IsNullOrWhiteSpace($relPath)) { $relPath = "index.html" }
    }
    $filePath = Join-Path $RootPath $relPath
    if (Test-Path $filePath -PathType Container) { $filePath = Join-Path $filePath "index.html" }

    $writer = New-Object System.IO.StreamWriter($stream, [System.Text.Encoding]::ASCII)
    $writer.AutoFlush = $true

    if (Test-Path $filePath -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
      $mime = $mimeMap[$ext]
      if (-not $mime) { $mime = "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($filePath)
      $writer.Write("HTTP/1.1 200 OK`r`n")
      $writer.Write("Content-Type: $mime`r`n")
      $writer.Write("Content-Length: $($bytes.Length)`r`n")
      $writer.Write("Connection: close`r`n`r`n")
      $writer.Flush()
      $stream.Write($bytes, 0, $bytes.Length)
    } else {
      $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $relPath")
      $writer.Write("HTTP/1.1 404 Not Found`r`n")
      $writer.Write("Content-Type: text/plain; charset=utf-8`r`n")
      $writer.Write("Content-Length: $($body.Length)`r`n")
      $writer.Write("Connection: close`r`n`r`n")
      $writer.Flush()
      $stream.Write($body, 0, $body.Length)
    }
    $stream.Flush()
  } catch {
  } finally {
    $client.Close()
  }
}
