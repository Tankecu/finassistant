Add-Type -AssemblyName System.Drawing

function MakeIcon {
  param([int]$size, [string]$path)

  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  $bgColor = [System.Drawing.Color]::FromArgb(255, 11, 15, 20)
  $g.Clear($bgColor)

  $emerald = [System.Drawing.Color]::FromArgb(255, 52, 211, 153)
  $pen = New-Object System.Drawing.Pen($emerald, ($size * 0.085))
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  $w = [float]$size
  $p1 = New-Object System.Drawing.PointF ([float]($w*0.22)), ([float]($w*0.68))
  $p2 = New-Object System.Drawing.PointF ([float]($w*0.42)), ([float]($w*0.50))
  $p3 = New-Object System.Drawing.PointF ([float]($w*0.56)), ([float]($w*0.58))
  $p4 = New-Object System.Drawing.PointF ([float]($w*0.80)), ([float]($w*0.30))
  $pts = @($p1, $p2, $p3, $p4)
  $g.DrawLines($pen, $pts)

  $r = $size * 0.075
  $brush = New-Object System.Drawing.SolidBrush($emerald)
  $g.FillEllipse($brush, [float]($w*0.80 - $r), [float]($w*0.30 - $r), [float](2*$r), [float](2*$r))

  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

MakeIcon -size 192 -path 'public/icons/pwa-192.png'
MakeIcon -size 512 -path 'public/icons/pwa-512.png'
MakeIcon -size 512 -path 'public/icons/pwa-maskable-512.png'
Write-Output 'icons generated'
