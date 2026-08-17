# 生成微信分享卡片图（800x800）
# 设计：品牌深蓝紫渐变 + 证书双线框 + 红印章"非正式" + 主标题"你是什么东西？"
# 输出 assets/share-card.png / share-card.jpg
Add-Type -AssemblyName System.Drawing

$S = 800
$bmp = New-Object System.Drawing.Bitmap($S, $S, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb))
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::FromArgb(255, 19, 28, 51))

function New-C {
  param([int]$R, [int]$G, [int]$B, [int]$A = 255)
  return [System.Drawing.Color]::FromArgb($A, $R, $G, $B)
}

# ---------- 1. 背景：对角三色渐变 ----------
$p0 = New-Object System.Drawing.Point(0, 0)
$p1 = New-Object System.Drawing.Point($S, $S)
$lg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($p0, $p1, (New-C 19 28 51), (New-C 59 46 99))
$blend = New-Object System.Drawing.Drawing2D.ColorBlend
$blend.Positions = [single[]](0.0, 0.5, 1.0)
$blend.Colors = [System.Drawing.Color[]]@((New-C 19 28 51), (New-C 30 43 78), (New-C 59 46 99))
$lg.InterpolationColors = $blend
$g.FillRectangle($lg, 0, 0, $S, $S)
$lg.Dispose()

# ---------- 2. 光斑 ----------
function Add-Glow {
  param([int]$CX, [int]$CY, [int]$R, [System.Drawing.Color]$Core)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse($CX - $R, $CY - $R, $R * 2, $R * 2)
  $pg = New-Object System.Drawing.Drawing2D.PathGradientBrush($path)
  $pg.CenterColor = $Core
  $pg.SurroundColors = [System.Drawing.Color[]]@([System.Drawing.Color]::Transparent)
  $g.FillPath($pg, $path)
  $pg.Dispose()
  $path.Dispose()
}
Add-Glow 110 70 330 (New-C 37 129 196 110)
Add-Glow 700 740 350 (New-C 123 95 192 110)

# ---------- 3. 证书双线框 ----------
function RoundedRectPath {
  param([int]$X, [int]$Y, [int]$W, [int]$H, [int]$R)
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc($X, $Y, $R * 2, $R * 2, 180, 90)
  $p.AddArc($X + $W - $R * 2, $Y, $R * 2, $R * 2, 270, 90)
  $p.AddArc($X + $W - $R * 2, $Y + $H - $R * 2, $R * 2, $R * 2, 0, 90)
  $p.AddArc($X, $Y + $H - $R * 2, $R * 2, $R * 2, 90, 90)
  $p.CloseFigure()
  return $p
}
$pOut = RoundedRectPath 22 22 756 756 20
$pIn = RoundedRectPath 38 38 724 724 14
$penOut = New-Object System.Drawing.Pen((New-C 255 255 255 64), 3)
$penIn = New-Object System.Drawing.Pen((New-C 255 255 255 42), 1)
$g.DrawPath($penOut, $pOut)
$g.DrawPath($penIn, $pIn)
$pOut.Dispose(); $pIn.Dispose(); $penOut.Dispose(); $penIn.Dispose()

# ---------- 4. 居中文字辅助 ----------
$fmtC = New-Object System.Drawing.StringFormat
$fmtC.Alignment = [System.Drawing.StringAlignment]::Center
$fmtC.LineAlignment = [System.Drawing.StringAlignment]::Center

function Draw-Center {
  param([string]$Text, [System.Drawing.Font]$Font, [System.Drawing.Color]$Color, [single]$Y, [single]$H)
  $brush = New-Object System.Drawing.SolidBrush($Color)
  $rect = New-Object System.Drawing.RectangleF(40, $Y, 720, $H)
  $g.DrawString($Text, $Font, $brush, $rect, $fmtC)
  $brush.Dispose()
}

# ---------- 5. 顶部小字 + 红印章 ----------
$fTop = New-Object System.Drawing.Font('Microsoft YaHei', 17)
Draw-Center '非官方人格备案 · 档案编号 No.2025-001' $fTop (New-C 127 178 229) 58 30
$fTop.Dispose()

$state = $g.Save()
$g.TranslateTransform(700, 92)
$g.RotateTransform(-15)
$penStamp = New-Object System.Drawing.Pen((New-C 232 113 106), 3)
$penStamp2 = New-Object System.Drawing.Pen((New-C 232 113 106 140), 1)
$g.DrawEllipse($penStamp, -46, -46, 92, 92)
$g.DrawEllipse($penStamp2, -40, -40, 80, 80)
$fmtS = New-Object System.Drawing.StringFormat
$fmtS.Alignment = [System.Drawing.StringAlignment]::Center
$fmtS.LineAlignment = [System.Drawing.StringAlignment]::Center
$brushStamp = New-Object System.Drawing.SolidBrush((New-C 232 113 106))
$fontStamp = New-Object System.Drawing.Font('Microsoft YaHei', 21, [System.Drawing.FontStyle]::Bold)
$rectStamp = New-Object System.Drawing.RectangleF(-52, -52, 104, 104)
$g.DrawString('非正式', $fontStamp, $brushStamp, $rectStamp, $fmtS)
$g.Restore($state)
$penStamp.Dispose(); $penStamp2.Dispose(); $brushStamp.Dispose(); $fontStamp.Dispose(); $fmtS.Dispose()

# ---------- 6. 中心文案（空格实现字间距） ----------
$fKicker = New-Object System.Drawing.Font('Microsoft YaHei', 20, [System.Drawing.FontStyle]::Bold)
Draw-Center '《 你 是 什 么 东 西 》' $fKicker (New-C 159 184 216) 264 36
$fKicker.Dispose()

$fTitle = New-Object System.Drawing.Font('Microsoft YaHei', 104, [System.Drawing.FontStyle]::Bold)
Draw-Center '你 是 什 么 东 西 ？' $fTitle (New-C 255 255 255) 344 150
$fTitle.Dispose()

$fSub = New-Object System.Drawing.Font('Microsoft YaHei', 26)
Draw-Center '30 道二选一 · 16 种地狱人格代号 · 约 3 分钟' $fSub (New-C 220 228 240) 502 44
$fSub.Dispose()

$penDiv = New-Object System.Drawing.Pen((New-C 255 255 255 70), 2)
$g.DrawLine($penDiv, 300, 570, 500, 570)
$penDiv.Dispose()

$fLine = New-Object System.Drawing.Font('Microsoft YaHei', 32, [System.Drawing.FontStyle]::Bold)
Draw-Center '测 完 别 删 ， 留 着 自 己 哭' $fLine (New-C 244 190 184) 604 56
$fLine.Dispose()

$fTiny = New-Object System.Drawing.Font('Microsoft YaHei', 17)
Draw-Center '本测试不具有任何科学依据，请放心相信' $fTiny (New-C 255 255 255 115) 700 30
$fTiny.Dispose()

$fmtC.Dispose()

# ---------- 7. 输出 ----------
$root = Split-Path $PSScriptRoot -Parent
$outPng = Join-Path $root 'assets\share-card.png'
$outJpg = Join-Path $root 'assets\share-card.jpg'
$bmp.Save($outPng, [System.Drawing.Imaging.ImageFormat]::Png)

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]90)
$bmp.Save($outJpg, $jpegCodec, $ep)

$g.Dispose()
$bmp.Dispose()
$pngSize = (Get-Item $outPng).Length / 1KB
$jpgSize = (Get-Item $outJpg).Length / 1KB
Write-Output ("PNG: " + [math]::Round($pngSize, 1) + " KB")
Write-Output ("JPG: " + [math]::Round($jpgSize, 1) + " KB")
