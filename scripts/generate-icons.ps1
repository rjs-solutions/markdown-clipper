$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$iconDir = Join-Path $root "assets\icons"
New-Item -ItemType Directory -Force -Path $iconDir | Out-Null

function Convert-Point {
  param(
    [single] $X,
    [single] $Y,
    [single] $Scale
  )

  return [System.Drawing.PointF]::new($X * $Scale, $Y * $Scale)
}

function New-MarkPath {
  param([single] $Scale)

  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddPolygon([System.Drawing.PointF[]] @(
    (Convert-Point 9 102 $Scale),
    (Convert-Point 9 25 $Scale),
    (Convert-Point 29 25 $Scale),
    (Convert-Point 52 63 $Scale),
    (Convert-Point 75 25 $Scale),
    (Convert-Point 95 25 $Scale),
    (Convert-Point 95 102 $Scale),
    (Convert-Point 75 102 $Scale),
    (Convert-Point 75 61 $Scale),
    (Convert-Point 52 96 $Scale),
    (Convert-Point 29 61 $Scale),
    (Convert-Point 29 102 $Scale)
  ))

  $path.AddPolygon([System.Drawing.PointF[]] @(
    (Convert-Point 102 24 $Scale),
    (Convert-Point 91 35 $Scale),
    (Convert-Point 91 73 $Scale),
    (Convert-Point 81 73 $Scale),
    (Convert-Point 102 103 $Scale),
    (Convert-Point 123 73 $Scale),
    (Convert-Point 113 73 $Scale),
    (Convert-Point 113 35 $Scale)
  ))

  return $path
}

function New-Icon {
  param([int] $Size)

  $scale = $Size / 128.0
  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $markPath = New-MarkPath -Scale $scale
    $bounds = [System.Drawing.RectangleF]::new(8 * $scale, 24 * $scale, 116 * $scale, 80 * $scale)
    $brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
      $bounds,
      [System.Drawing.Color]::FromArgb(255, 24, 182, 164),
      [System.Drawing.Color]::FromArgb(255, 11, 104, 114),
      90
    )
    $outline = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(80, 7, 70, 76), [Math]::Max(1.0, 2.5 * $scale))
    $outline.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    $graphics.DrawPath($outline, $markPath)
    $graphics.FillPath($brush, $markPath)

    $output = Join-Path $iconDir "icon-$Size.png"
    $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    if ($graphics) {
      $graphics.Dispose()
    }
    if ($bitmap) {
      $bitmap.Dispose()
    }
  }
}

16, 32, 48, 128 | ForEach-Object {
  New-Icon -Size $_
}

Write-Output "Generated simplified icon PNGs in $iconDir"
