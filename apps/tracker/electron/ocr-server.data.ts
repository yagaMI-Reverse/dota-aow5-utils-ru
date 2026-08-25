/**
 * The OCR half of the Exchange watcher, as a PowerShell source string.
 *
 * Windows ships an OCR engine (`Windows.Media.Ocr`) that costs nothing, needs
 * no download and already speaks Russian — but it lives behind WinRT, which
 * Node cannot call without a native module. PowerShell can, and starting one
 * process that stays up turns a ~1s WinRT cold start into a ~90ms warm call:
 * the script below reads one PNG path per stdin line and answers with one JSON
 * line of positioned text.
 *
 * Written to a temp file at startup rather than shipped as an asset: a string
 * in the bundle cannot be missing, and `extraResources` is one more thing to
 * get wrong in a packaged build.
 *
 * The protocol is deliberately dumb — path in, JSON out, one line each — so a
 * wedged request cannot desync the stream: main matches answers to questions
 * by order, and anything unparseable is dropped there.
 */
export const OCR_SERVER_PS1 = String.raw`
$ErrorActionPreference = 'Stop'
# UTF-8 on the pipe, or every Cyrillic glyph the engine reads arrives in Node
# as mojibake: a child console defaults to the OEM codepage, and item names
# were coming through as solid replacement characters.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation' + [char]0x60 + '1' })[0]
function Await($op, $type) {
  $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
  $t.Result
}
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime] | Out-Null

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('ru'))
if ($null -eq $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
if ($null -eq $engine) { [Console]::Out.WriteLine('{"fatal":"no-ocr-language"}'); exit 1 }

# Says "ready" once so the Node side can tell a slow start from a dead one.
[Console]::Out.WriteLine('{"ready":true}')

while ($true) {
  $path = [Console]::In.ReadLine()
  if ($null -eq $path) { break }
  $path = $path.Trim()
  if ($path -eq '') { continue }
  try {
    # Read-all-bytes releases the file the moment it returns, where a WinRT
    # StorageFile held it long enough for the next capture's write to collide.
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $ms = [System.IO.MemoryStream]::new($bytes, $false)
    $stream = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($ms)
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    $stream.Dispose(); $ms.Dispose()

    $lines = New-Object System.Collections.Generic.List[object]
    foreach ($line in $result.Lines) {
      $minX = [double]::MaxValue; $minY = [double]::MaxValue
      $maxX = 0.0; $maxY = 0.0
      foreach ($word in $line.Words) {
        $r = $word.BoundingRect
        if ($r.X -lt $minX) { $minX = $r.X }
        if ($r.Y -lt $minY) { $minY = $r.Y }
        if ($r.X + $r.Width -gt $maxX) { $maxX = $r.X + $r.Width }
        if ($r.Y + $r.Height -gt $maxY) { $maxY = $r.Y + $r.Height }
      }
      $lines.Add(@{
        x = [int]$minX; y = [int]$minY
        w = [int]($maxX - $minX); h = [int]($maxY - $minY)
        text = $line.Text
      })
    }
    $json = ConvertTo-Json @{ lines = $lines } -Compress -Depth 4
    [Console]::Out.WriteLine($json)
  } catch {
    [Console]::Out.WriteLine('{"error":"' + $_.Exception.GetType().Name + '"}')
  }
}
`;
