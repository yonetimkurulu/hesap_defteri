Add-Type -AssemblyName System.Drawing

function Create-RoundedRectanglePath {
    param(
        [System.Drawing.Rectangle]$rect,
        [int]$radius
    )
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $radius * 2

    $arc = [System.Drawing.Rectangle]::new($rect.X, $rect.Y, $diameter, $diameter)
    $path.AddArc($arc, 180, 90)

    $arc.X = $rect.Right - $diameter
    $path.AddArc($arc, 270, 90)

    $arc.Y = $rect.Bottom - $diameter
    $path.AddArc($arc, 0, 90)

    $arc.X = $rect.X
    $path.AddArc($arc, 90, 90)

    $path.CloseFigure()
    return $path
}

function Generate-BaseBitmap {
    $bmp = New-Object System.Drawing.Bitmap 256, 256
    $g = [System.Drawing.Graphics]::FromImage($bmp)

    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    # 1. Ana Zemin Squircle (Koyu Zümrüt Yeşili Gradyan)
    $outerRect = [System.Drawing.Rectangle]::new(14, 14, 228, 228)
    $outerPath = Create-RoundedRectanglePath $outerRect 54

    $colorTop = [System.Drawing.Color]::FromArgb(255, 18, 76, 49)
    $colorBottom = [System.Drawing.Color]::FromArgb(255, 8, 38, 24)
    $gradBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $outerRect, $colorTop, $colorBottom, 45
    $g.FillPath($gradBrush, $outerPath)

    # İnce Altın Yaldız Çerçeve
    $goldPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(230, 245, 196, 68)), 5
    $g.DrawPath($goldPen, $outerPath)

    # 2. Defter Gövdesi (Beyaz & Ferah)
    $bookRect = [System.Drawing.Rectangle]::new(56, 46, 144, 164)
    $bookPath = Create-RoundedRectanglePath $bookRect 16

    # Defter gölgesi
    $shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(80, 0, 0, 0))
    $shadowRect = [System.Drawing.Rectangle]::new(58, 50, 144, 164)
    $shadowPath = Create-RoundedRectanglePath $shadowRect 16
    $g.FillPath($shadowBrush, $shadowPath)

    # Defter ana kartı
    $bookBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
    $g.FillPath($bookBrush, $bookPath)

    # Defter sırtı (Sol şerit)
    $spineRect = [System.Drawing.Rectangle]::new(56, 46, 26, 164)
    $spineBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 22, 101, 65))
    $g.FillRectangle($spineBrush, $spineRect)

    # Defter cilt dikiş noktaları
    $stitchBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 245, 196, 68))
    $g.FillEllipse($stitchBrush, 65, 68, 8, 8)
    $g.FillEllipse($stitchBrush, 65, 124, 8, 8)
    $g.FillEllipse($stitchBrush, 65, 180, 8, 8)

    # 3. Kırmızı / Altın Defter Ayracı (Üstten sarkan kurdele)
    $ribbonBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 234, 88, 12))
    $ribbonPoints = @(
        [System.Drawing.Point]::new(154, 46),
        [System.Drawing.Point]::new(176, 46),
        [System.Drawing.Point]::new(176, 110),
        [System.Drawing.Point]::new(165, 98),
        [System.Drawing.Point]::new(154, 110)
    )
    $g.FillPolygon($ribbonBrush, $ribbonPoints)

    # 4. Defter Satırları (Açık gri/yeşil muhasebe çizgileri)
    $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 215, 230, 220)), 4
    $g.DrawLine($linePen, 96, 76, 142, 76)
    $g.DrawLine($linePen, 96, 96, 138, 96)
    $linePen2 = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 215, 230, 220)), 4
    $g.DrawLine($linePen2, 96, 172, 180, 172)
    $g.DrawLine($linePen2, 96, 190, 160, 190)

    # 5. Ortada Parlayan Altın Para ve TL Simgesi
    $coinRect = [System.Drawing.Rectangle]::new(102, 110, 54, 54)
    $coinGrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush $coinRect, ([System.Drawing.Color]::FromArgb(255, 252, 211, 77)), ([System.Drawing.Color]::FromArgb(255, 217, 119, 6)), 45
    $g.FillEllipse($coinGrad, $coinRect)
    $coinBorder = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 180, 83, 9)), 2.5
    $g.DrawEllipse($coinBorder, $coinRect)

    # Türk Lirası '₺' yazısı
    $font = [System.Drawing.Font]::new("Arial", [float]24, [System.Drawing.FontStyle]::Bold)
    $fontBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 120, 53, 15))
    $stringFormat = New-Object System.Drawing.StringFormat
    $stringFormat.Alignment = [System.Drawing.StringAlignment]::Center
    $stringFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString("₺", $font, $fontBrush, [System.Drawing.RectangleF]::new(102, 111, 54, 54), $stringFormat)

    $g.Dispose()
    return $bmp
}

function Save-IcoFile {
    param(
        [System.Drawing.Bitmap]$baseBmp,
        [string]$outputPath
    )

    $sizes = @(256, 128, 64, 48, 32, 16)
    $pngStreams = @()

    foreach ($size in $sizes) {
        $resized = New-Object System.Drawing.Bitmap $size, $size
        $g = [System.Drawing.Graphics]::FromImage($resized)
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.Clear([System.Drawing.Color]::Transparent)
        $g.DrawImage($baseBmp, 0, 0, $size, $size)
        $g.Dispose()

        $ms = New-Object System.IO.MemoryStream
        $resized.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $pngStreams += ,@($size, $ms.ToArray())
        $resized.Dispose()
    }

    $fs = [System.IO.File]::Create($outputPath)
    $bw = New-Object System.IO.BinaryWriter $fs

    # ICONDIR
    $bw.Write([uint16]0) # Reserved
    $bw.Write([uint16]1) # Type (1 = ICO)
    $bw.Write([uint16]$pngStreams.Count) # Image Count

    # Calculate offset
    $headerSize = 6 + ($pngStreams.Count * 16)
    $currentOffset = $headerSize

    # ICONDIRENTRY for each
    foreach ($item in $pngStreams) {
        $size = $item[0]
        $bytes = $item[1]

        $widthByte = if ($size -ge 256) { [byte]0 } else { [byte]$size }
        $heightByte = if ($size -ge 256) { [byte]0 } else { [byte]$size }

        $bw.Write($widthByte)     # Width
        $bw.Write($heightByte)    # Height
        $bw.Write([byte]0)        # Color count
        $bw.Write([byte]0)        # Reserved
        $bw.Write([uint16]1)      # Planes
        $bw.Write([uint16]32)     # BitCount
        $bw.Write([uint32]$bytes.Length) # BytesInRes
        $bw.Write([uint32]$currentOffset) # ImageOffset

        $currentOffset += $bytes.Length
    }

    # Image Data (PNG)
    foreach ($item in $pngStreams) {
        $bytes = $item[1]
        $bw.Write($bytes)
    }

    $bw.Flush()
    $bw.Close()
    $fs.Close()
    Write-Host "ICO başarıyla kaydedildi: $outputPath"
}

$bmp = Generate-BaseBitmap
$bmp.Save("public/icon-512.png", [System.Drawing.Imaging.ImageFormat]::Png)
Save-IcoFile $bmp "build/icon.ico"
Save-IcoFile $bmp "public/icon.ico"
$bmp.Dispose()
