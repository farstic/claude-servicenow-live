<#
.SYNOPSIS
  Convert a Word-ready Markdown file to a styled, self-contained .docx (Open XML) — no Pandoc, no Python, no Word required to generate.

.DESCRIPTION
  House converter for ServiceNow deliverables (proposals, HLD/LLD, design specs). A .docx is a ZIP of XML parts; this builds them directly with .NET, so it runs on a clean Windows box with only PowerShell.

  Supported Markdown:
    # H1                -> cover title (navy, accent rule); the paragraph straight after it becomes the subtitle
    ## / ### / ####     -> Heading 1 / 2 / 3 (outline levels, so they populate the table of contents)
    ## Contents         -> replaced by a REAL Word table-of-contents field (see -NoToc). Any hand-written
                           bullet list under that heading is discarded — Word generates the entries with live
                           page numbers, and they update on open.
    | pipe | tables |   -> Word tables: navy header row, zebra body, horizontal rules only, repeating header
    - / * bullets, 1.   -> lists
    **bold**  *italic*  `code`   -> inline runs (code in monospace)
    > blockquote        -> shaded callout with a left accent bar
    ```fenced```        -> monospaced block
    ![alt](file.png)    -> embedded, centred image (PNG; sized to fit the text width)
    ---                 -> horizontal rule

  Page flow: the cover (title, subtitle, and any leading document-control table) sits on its own page, the
  table of contents follows on its own page, and the body starts on page 3. Page numbering counts from the cover.

  Images: PNG only (dimensions are read from the IHDR header, so System.Drawing is not needed). Put the PNG beside the .md (or use an absolute path) and reference it with standard image syntax; it is embedded into the .docx (the .docx stays portable).

.PARAMETER Src
  Path to the source .md file.

.PARAMETER Out
  Path to write the .docx.

.PARAMETER FooterText
  Optional left-hand footer text (e.g. "<Client> | Commercial in confidence"). Keep client names OUT of committed/shared markdown — pass them here per engagement instead. Page numbers ("Page X of Y") are always shown at the right. Default: none.

.PARAMETER NoToc
  Suppress table-of-contents generation. A "## Contents" heading is then rendered as an ordinary heading and any list under it is kept verbatim.

.PARAMETER Accent
  Six-digit hex accent colour for the title rule, headings and table headers. Default 1F3864 (house navy).

.EXAMPLE
  pwsh scripts/md-to-docx.ps1 -Src clients/acme/proposals/proposal.md -Out clients/acme/proposals/proposal.docx -FooterText "ACME | Commercial in confidence"

.NOTES
  The table of contents is a Word field. Word fills it in on open (updateFields is set); if a reader ever sees the
  placeholder text, Ctrl+A then F9 rebuilds it. Verify the result visually with scripts/render-pdf-pages.ps1.
  Windows / PowerShell. Author: ServiceNow Architecture Engine.
#>
param(
  [Parameter(Mandatory=$true)][string]$Src,
  [Parameter(Mandatory=$true)][string]$Out,
  [string]$FooterText = '',
  [switch]$NoToc,
  [switch]$LiveToc,
  [string]$Accent = '1F3864',
  [ValidateSet('house','classic')][string]$Style = 'house'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null

$srcDir = Split-Path -Parent (Resolve-Path -LiteralPath $Src)
$script:images = @()
$script:imgN = 0

# --- palette -------------------------------------------------------------
# 'house'   - the engine's own look: Segoe UI, navy header bands, horizontal rules only.
# 'classic' - a conservative Word look for revisions that must sit alongside an existing client document unchanged:
#             Arial, three-tone blue headings, full gridlines, pale blue header row.
#             Use it when a revision has to sit alongside an existing document unchanged.
$isClassic = ($Style -eq 'classic')

$cNavy   = $Accent      # titles, table headers
$cHead   = '2E5496'     # heading 1/2 text
$cHead3  = '44546A'     # heading 3 text
$cBody   = '1A1A1A'     # body text
$cMuted  = '5A6B7C'     # subtitle, footer
$cRule   = 'D6DEE8'     # table gridlines
$cZebra  = 'F5F8FC'     # zebra fill
$cCallout= 'EEF3F9'     # blockquote fill
$cCode   = 'C7254E'     # inline code
$fontMain = 'Segoe UI'
$tblHeadFill = $cNavy; $tblHeadColor = 'FFFFFF'; $tblFullGrid = $false; $useZebra = $true

if ($isClassic) {
  $fontMain = 'Arial'
  $cNavy = '1F3864'; $cHead = '2E4C7E'; $cHead3 = '1F4D78'
  $cBody = '000000'; $cMuted = '595959'
  $cRule = 'C8C8C8'; $cCallout = 'DCE6F1'
  $tblHeadFill = 'DCE6F1'; $tblHeadColor = '1F3864'
  $tblFullGrid = $true; $useZebra = $false
}

function Esc([string]$s) {
  if ($null -eq $s) { return '' }
  $s = $s -replace '&','&amp;'; $s = $s -replace '<','&lt;'; $s = $s -replace '>','&gt;'
  return $s
}

function Convert-Inline([string]$text) {
  if ([string]::IsNullOrEmpty($text)) { return '' }
  $sb = New-Object System.Text.StringBuilder
  $pattern = '(\*\*(?<b>.+?)\*\*)|(~~(?<s>.+?)~~)|(`(?<c>[^`]+?)`)|(\*(?<i>[^*]+?)\*)|(\[(?<lt>[^\]]+)\]\((?<lu>[^)]+)\))'
  $idx = 0
  foreach ($m in [regex]::Matches($text, $pattern)) {
    if ($m.Index -gt $idx) { [void]$sb.Append('<w:r><w:t xml:space="preserve">' + (Esc $text.Substring($idx, $m.Index - $idx)) + '</w:t></w:r>') }
    if ($m.Groups['b'].Success) { [void]$sb.Append('<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">' + (Esc $m.Groups['b'].Value) + '</w:t></w:r>') }
    elseif ($m.Groups['s'].Success) { [void]$sb.Append('<w:r><w:rPr><w:strike/><w:color w:val="' + $cMuted + '"/></w:rPr><w:t xml:space="preserve">' + (Esc $m.Groups['s'].Value) + '</w:t></w:r>') }
    elseif ($m.Groups['c'].Success) { [void]$sb.Append('<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:color w:val="' + $cCode + '"/><w:sz w:val="19"/></w:rPr><w:t xml:space="preserve">' + (Esc $m.Groups['c'].Value) + '</w:t></w:r>') }
    elseif ($m.Groups['i'].Success) { [void]$sb.Append('<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">' + (Esc $m.Groups['i'].Value) + '</w:t></w:r>') }
    elseif ($m.Groups['lt'].Success) { [void]$sb.Append('<w:r><w:t xml:space="preserve">' + (Esc $m.Groups['lt'].Value) + '</w:t></w:r>') }
    $idx = $m.Index + $m.Length
  }
  if ($idx -lt $text.Length) { [void]$sb.Append('<w:r><w:t xml:space="preserve">' + (Esc $text.Substring($idx)) + '</w:t></w:r>') }
  return $sb.ToString()
}

function Get-PngSize([string]$path) {
  # Read width/height from the PNG IHDR chunk (big-endian at byte offsets 16 and 20).
  $b = [System.IO.File]::ReadAllBytes($path)
  if ($b.Length -lt 24 -or $b[0] -ne 137 -or $b[1] -ne 80) { return $null }
  $w = ([int]$b[16] -shl 24) -bor ([int]$b[17] -shl 16) -bor ([int]$b[18] -shl 8) -bor [int]$b[19]
  $h = ([int]$b[20] -shl 24) -bor ([int]$b[21] -shl 16) -bor ([int]$b[22] -shl 8) -bor [int]$b[23]
  return @{ W = $w; H = $h }
}

function Image-Para([string]$alt, [string]$path) {
  $abs = $path
  if (-not [System.IO.Path]::IsPathRooted($abs)) { $abs = Join-Path $srcDir $path }
  $size = $null; if (Test-Path -LiteralPath $abs) { $size = Get-PngSize $abs }
  if (-not $size) { return '<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">[image not found or not PNG: ' + (Esc $path) + ']</w:t></w:r></w:p>' }
  $maxIn = 6.3
  $wIn = [math]::Min($size.W / 96.0, $maxIn)
  $hIn = ($size.H / 96.0) * ($wIn / ($size.W / 96.0))
  $cx = [int][math]::Round($wIn * 914400); $cy = [int][math]::Round($hIn * 914400)
  $script:imgN++
  $rel = "rIdImg$($script:imgN)"; $media = "image$($script:imgN).png"; $docPrId = 100 + $script:imgN
  $script:images += @{ Rel = $rel; Media = $media; File = $abs; Cx = $cx; Cy = $cy; Alt = $alt }
  $d = '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="140" w:after="60"/></w:pPr><w:r><w:drawing>'
  $d += '<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + $cx + '" cy="' + $cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>'
  $d += '<wp:docPr id="' + $docPrId + '" name="Picture ' + $docPrId + '" descr="' + (Esc $alt) + '"/>'
  $d += '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>'
  $d += '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>'
  $d += '<pic:nvPicPr><pic:cNvPr id="' + $docPrId + '" name="Picture ' + $docPrId + '" descr="' + (Esc $alt) + '"/><pic:cNvPicPr/></pic:nvPicPr>'
  $d += '<pic:blipFill><a:blip r:embed="' + $rel + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
  $d += '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + $cx + '" cy="' + $cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
  $d += '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
  # caption line under the figure, if the alt text carries one
  if ($alt) {
    $d += '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="160"/></w:pPr><w:r><w:rPr><w:i/><w:color w:val="' + $cMuted + '"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">' + (Esc $alt) + '</w:t></w:r></w:p>'
  }
  return $d
}

function Build-Row($cells, $ncol, [bool]$isHeader, [bool]$stripe, $widths) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append('<w:tr>')
  if ($isHeader) { [void]$sb.Append('<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>') }
  for ($c = 0; $c -lt $ncol; $c++) {
    $val = ''; if ($c -lt $cells.Count) { $val = $cells[$c] }
    $shd = ''; $runs = ''; $pPr = '<w:spacing w:before="50" w:after="50" w:line="240" w:lineRule="auto"/>'
    if ($isHeader) {
      $shd = '<w:shd w:val="clear" w:color="auto" w:fill="' + $tblHeadFill + '"/>'
      $runs = '<w:r><w:rPr><w:b/><w:color w:val="' + $tblHeadColor + '"/></w:rPr><w:t xml:space="preserve">' + (Esc $val) + '</w:t></w:r>'
    }
    else {
      if ($stripe -and $useZebra) { $shd = '<w:shd w:val="clear" w:color="auto" w:fill="' + $cZebra + '"/>' }
      $runs = Convert-Inline $val
    }
    $tcw = '<w:tcW w:w="' + $widths[$c] + '" w:type="dxa"/>'
    [void]$sb.Append('<w:tc><w:tcPr>' + $tcw + $shd + '<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr>' + $pPr + '<w:rPr><w:sz w:val="19"/></w:rPr></w:pPr>' + $runs + '</w:p></w:tc>')
  }
  [void]$sb.Append('</w:tr>')
  return $sb.ToString()
}

# Word's auto-fit gives every column the same pull, which starves a long prose column and
# makes rows needlessly tall. Allocate width in proportion to the text each column actually
# carries, with a floor so short columns stay readable and a cap so one column cannot run away.
function Get-ColumnWidths($rows, $ncol, [int]$total) {
  $chW = 105          # twips per character at the 9.5pt table size (Segoe UI / Consolas are close enough)
  $pad = 300          # cell margins plus breathing room
  $need = New-Object 'double[]' $ncol   # hard minimum: the longest unbreakable token must fit on one line
  $mass = New-Object 'double[]' $ncol   # how much prose the column carries overall
  foreach ($r in $rows) {
    for ($c = 0; $c -lt $ncol; $c++) {
      $v = ''; if ($c -lt $r.Count) { $v = $r[$c] }
      $plain = $v -replace '\*\*','' -replace '`','' -replace '\*',''
      $longest = 0
      foreach ($tok in ($plain -split '[\s/]+')) { if ($tok.Length -gt $longest) { $longest = $tok.Length } }
      $n = ($longest * $chW) + $pad
      if ($n -gt $need[$c]) { $need[$c] = $n }
      $mass[$c] += [math]::Max($plain.Length, 1)
    }
  }
  # a very long identifier may wrap rather than starve the prose columns beside it
  $capNeed = $total * 0.20
  $sumNeed = 0.0
  for ($c = 0; $c -lt $ncol; $c++) { if ($need[$c] -gt $capNeed) { $need[$c] = $capNeed }; $sumNeed += $need[$c] }
  $w = New-Object 'int[]' $ncol
  if ($sumNeed -ge $total) {
    # minimums alone overflow the page: scale them down proportionally
    for ($c = 0; $c -lt $ncol; $c++) { $w[$c] = [int][math]::Round($total * ($need[$c] / $sumNeed)) }
  }
  else {
    $spare = $total - $sumNeed
    $sumMass = 0.0; for ($c = 0; $c -lt $ncol; $c++) { $sumMass += $mass[$c] }
    if ($sumMass -le 0) { $sumMass = 1 }
    for ($c = 0; $c -lt $ncol; $c++) { $w[$c] = [int][math]::Round($need[$c] + ($spare * ($mass[$c] / $sumMass))) }
  }
  # normalise back to the exact table width so the right edge lands on the margin
  $acc = 0; for ($c = 0; $c -lt $ncol; $c++) { $acc += $w[$c] }
  if ($acc -ne $total -and $acc -gt 0) {
    $scale = $total / [double]$acc; $running = 0
    for ($c = 0; $c -lt $ncol - 1; $c++) { $w[$c] = [int][math]::Round($w[$c] * $scale); $running += $w[$c] }
    $w[$ncol - 1] = $total - $running
  }
  return $w
}

function Build-Table($tlines) {
  $rows = @()
  foreach ($tl in $tlines) {
    $t = $tl.Trim() -replace '^\|','' -replace '\|$',''
    $trimmed = @(); foreach ($cc in ($t -split '\|')) { $trimmed += $cc.Trim() }
    $rows += ,$trimmed
  }
  if ($rows.Count -lt 1) { return '' }
  $header = $rows[0]; $ncol = $header.Count
  $hasSep = $false
  if ($tlines.Count -ge 2 -and ($tlines[1].Trim() -match '^[\s:|\-]+$') -and ($tlines[1] -match '-')) { $hasSep = $true }
  $bodyStart = 1; if ($hasSep) { $bodyStart = 2 }
  $headerEmpty = $true; foreach ($h in $header) { if (-not [string]::IsNullOrWhiteSpace($h)) { $headerEmpty = $false; break } }
  $totalW = 9298   # text width in twips: A4 minus the 1304-twip side margins
  $bodyRows = @(); for ($r = $bodyStart; $r -lt $rows.Count; $r++) { $bodyRows += ,$rows[$r] }
  $measure = @(); if (-not $headerEmpty) { $measure += ,$header }; $measure += $bodyRows
  $colW = Get-ColumnWidths $measure $ncol $totalW
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append('<w:tbl><w:tblPr><w:tblStyle w:val="HouseTable"/><w:tblW w:w="' + $totalW + '" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>')
  # house style uses horizontal rules only; classic style keeps the full gridline box
  $sideBorder = if ($tblFullGrid) { '<w:{0} w:val="single" w:sz="4" w:space="0" w:color="' + $cRule + '"/>' } else { '<w:{0} w:val="none" w:sz="0" w:space="0" w:color="auto"/>' }
  [void]$sb.Append('<w:top w:val="single" w:sz="4" w:space="0" w:color="' + $cRule + '"/>')
  [void]$sb.Append([string]::Format($sideBorder,'left'))
  [void]$sb.Append('<w:bottom w:val="single" w:sz="4" w:space="0" w:color="' + $cRule + '"/>')
  [void]$sb.Append([string]::Format($sideBorder,'right'))
  [void]$sb.Append('<w:insideH w:val="single" w:sz="4" w:space="0" w:color="' + $cRule + '"/>')
  [void]$sb.Append([string]::Format($sideBorder,'insideV'))
  [void]$sb.Append('</w:tblBorders><w:tblCellMar><w:top w:w="70" w:type="dxa"/><w:left w:w="130" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/><w:right w:w="130" w:type="dxa"/></w:tblCellMar>')
  [void]$sb.Append('<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>')
  [void]$sb.Append('<w:tblGrid>'); for ($c = 0; $c -lt $ncol; $c++) { [void]$sb.Append('<w:gridCol w:w="' + $colW[$c] + '"/>') }; [void]$sb.Append('</w:tblGrid>')
  if (-not $headerEmpty) { [void]$sb.Append((Build-Row $header $ncol $true $false $colW)) }
  $bi = 0
  for ($r = $bodyStart; $r -lt $rows.Count; $r++) { [void]$sb.Append((Build-Row $rows[$r] $ncol $false (($bi % 2) -eq 1) $colW)); $bi++ }
  [void]$sb.Append('</w:tbl><w:p><w:pPr><w:spacing w:after="140"/><w:rPr><w:sz w:val="12"/></w:rPr></w:pPr></w:p>')
  return $sb.ToString()
}

function Page-Break() { return '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>' }

function Toc-Block([string]$heading, $entries) {
  # closing rule at the foot of the cover, mirroring the one above the title (house style only)
  $s = ''
  if (-not $isClassic) {
    $s = '<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="18" w:space="0" w:color="' + $cNavy + '"/></w:pBdr><w:spacing w:before="600" w:after="0" w:line="240" w:lineRule="auto"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>'
  }
  $s += Page-Break
  # TocHeading looks like Heading 1 but carries no outline level, so the contents page does not list itself
  $s += '<w:p><w:pPr><w:pStyle w:val="TocHeading"/></w:pPr>' + (Convert-Inline $heading) + '</w:p>'

  if ($LiveToc) {
    # Field-based contents. Word rebuilds it with page numbers, but it also prompts the reader on every
    # open ("this document contains fields that may refer to other files"), which is why it is opt-in.
    $s += '<w:p><w:pPr><w:spacing w:after="60"/></w:pPr>'
    $s += '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>'
    $s += '<w:r><w:instrText xml:space="preserve"> TOC \o "1-3" \h \z \u </w:instrText></w:r>'
    $s += '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
    $s += '<w:r><w:rPr><w:i/><w:color w:val="' + $cMuted + '"/></w:rPr><w:t xml:space="preserve">Press Ctrl+A then F9 to build the table of contents.</w:t></w:r>'
    $s += '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>'
  }
  else {
    # Default: a written-out contents list, hyperlinked to bookmarks on the headings. No fields, so Word
    # opens the document silently; the entries are generated from the actual headings, so they cannot drift.
    foreach ($e in $entries) {
      $style = 'TOC' + $e.Level
      $s += '<w:p><w:pPr><w:pStyle w:val="' + $style + '"/></w:pPr>'
      $s += '<w:hyperlink w:anchor="' + $e.Bm + '"><w:r><w:rPr><w:color w:val="' + $cBody + '"/></w:rPr><w:t xml:space="preserve">' + (Esc $e.Text) + '</w:t></w:r></w:hyperlink></w:p>'
    }
  }
  $s += Page-Break
  return $s
}

# ---- parse ----
$md = Get-Content -LiteralPath $Src -Raw -Encoding UTF8
$lines = [regex]::Split($md, '\r?\n'); $n = $lines.Count
$body = New-Object System.Text.StringBuilder
$i = 0; $bullet = [char]0x2022
$seenTitle = $false; $subtitleDone = $false; $tocEmitted = $false

# Pre-scan the headings so the contents list can be written out before they are reached.
# Generating it from the real headings means it can never drift from the document.
$script:tocEntries = @(); $script:hIdx = 0; $bmN = 0; $inFence = $false; $script:hasCover = $false
for ($p = 0; $p -lt $n; $p++) {
  $l = $lines[$p].TrimEnd()
  if ($l -match '^\s*```') { $inFence = -not $inFence; continue }
  if ($inFence) { continue }
  if ($l -match '^(#{2,6})\s+(.*)$') {
    $lv = $Matches[1].Length; $tx = $Matches[2]
    # a contents section means the document gets a full cover page; without one it opens straight into the text
    if (-not $NoToc -and $lv -le 3 -and ($tx -replace '[^A-Za-z ]','').Trim() -match '^(?i)(table of )?contents$') { $script:hasCover = $true; continue }
    $bmN++
    $tocLv = 1; if ($lv -eq 3) { $tocLv = 2 } elseif ($lv -ge 4) { $tocLv = 3 }
    $plain = ($tx -replace '\*\*','' -replace '`','' -replace '\*','')
    $script:tocEntries += @{ Level = $tocLv; Text = $plain; Bm = "_Toc_$bmN" }
  }
}

while ($i -lt $n) {
  $trim = $lines[$i].TrimEnd()
  if ($trim.Trim() -eq '') { $i++; continue }

  if ($trim -match '^\s*```') {
    $i++
    while ($i -lt $n -and ($lines[$i] -notmatch '^\s*```')) {
      [void]$body.Append('<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F4F6F8"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="160" w:right="160"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">' + (Esc $lines[$i]) + '</w:t></w:r></w:p>'); $i++
    }
    $i++; continue
  }

  if ($trim -match '^\s*!\[(?<alt>[^\]]*)\]\((?<path>[^)]+)\)\s*$') { [void]$body.Append((Image-Para $Matches['alt'] $Matches['path'])); $i++; $subtitleDone = $true; continue }

  if ($trim -match '^\s*\|' -and ($i+1) -lt $n -and ($lines[$i+1] -match '^\s*\|?[\s:|\-]+\|?\s*$') -and ($lines[$i+1] -match '-')) {
    $tbl = @(); while ($i -lt $n -and ($lines[$i] -match '^\s*\|')) { $tbl += $lines[$i]; $i++ }
    [void]$body.Append((Build-Table $tbl)); $subtitleDone = $true; continue
  }

  if ($trim -match '^\s*-{3,}\s*$' -or $trim -match '^\s*\*{3,}\s*$' -or $trim -match '^\s*_{3,}\s*$') {
    [void]$body.Append('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="' + $cRule + '"/></w:pBdr><w:spacing w:after="140"/></w:pPr></w:p>'); $i++; continue
  }

  if ($trim -match '^(#{1,6})\s+(.*)$') {
    $level = $Matches[1].Length; $txt = $Matches[2]

    # "## Contents" -> real Word TOC field; discard the hand-written list beneath it
    if (-not $NoToc -and -not $tocEmitted -and $level -le 3 -and ($txt -replace '[^A-Za-z ]','').Trim() -match '^(?i)(table of )?contents$') {
      [void]$body.Append((Toc-Block $txt $script:tocEntries))
      $tocEmitted = $true; $subtitleDone = $true
      $i++
      while ($i -lt $n) {
        $peek = $lines[$i].TrimEnd()
        if ($peek.Trim() -eq '') { $i++; continue }
        if ($peek -match '^\s*([-*]|\d+\.)\s+') { $i++; continue }
        break
      }
      continue
    }

    $paraStyle = 'Heading3'
    if ($level -eq 1) { $paraStyle = 'Title' }
    elseif ($level -eq 2) { $paraStyle = 'Heading1' } elseif ($level -eq 3) { $paraStyle = 'Heading2' }
    if ($level -ge 2) { $subtitleDone = $true }
    # A document with a contents section gets a full cover page: a heavy rule frames the title.
    # A short working document gets a plain masthead - no framing rule, tighter spacing, smaller type.
    $titleOverride = ''
    if ($level -eq 1 -and -not $seenTitle) {
      $seenTitle = $true
      if ($script:hasCover -and -not $isClassic) {
        [void]$body.Append('<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="36" w:space="0" w:color="' + $cNavy + '"/></w:pBdr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>')
      }
      else { $titleOverride = '<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>' }
    }
    # anchor levels 2+ so the contents entries can link to them
    $bmOpen = ''; $bmClose = ''
    if ($level -ge 2 -and $script:hIdx -lt $script:tocEntries.Count) {
      $bm = $script:tocEntries[$script:hIdx].Bm; $script:hIdx++
      $bmOpen = '<w:bookmarkStart w:id="' + (900 + $script:hIdx) + '" w:name="' + $bm + '"/>'
      $bmClose = '<w:bookmarkEnd w:id="' + (900 + $script:hIdx) + '"/>'
    }
    [void]$body.Append('<w:p><w:pPr><w:pStyle w:val="' + $paraStyle + '"/>' + $titleOverride + '</w:pPr>' + $bmOpen + (Convert-Inline $txt) + $bmClose + '</w:p>')
    $i++; continue
  }

  if ($trim -match '^\s*>\s?(.*)$') {
    [void]$body.Append('<w:p><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="10" w:color="' + $cHead + '"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="' + $cCallout + '"/><w:spacing w:before="80" w:after="80"/><w:ind w:left="260" w:right="120"/></w:pPr>' + (Convert-Inline $Matches[1]) + '</w:p>'); $i++; $subtitleDone = $true; continue
  }

  if ($trim -match '^(\s*)[-*]\s+(.*)$') {
    $left = 340 + ([math]::Floor($Matches[1].Length / 2) * 340)
    [void]$body.Append('<w:p><w:pPr><w:spacing w:after="60" w:line="264" w:lineRule="auto"/><w:ind w:left="' + $left + '" w:hanging="280"/></w:pPr><w:r><w:rPr><w:color w:val="' + $cHead + '"/></w:rPr><w:t xml:space="preserve">' + $bullet + '  </w:t></w:r>' + (Convert-Inline $Matches[2]) + '</w:p>'); $i++; $subtitleDone = $true; continue
  }

  if ($trim -match '^(\s*)(\d+)\.\s+(.*)$') {
    [void]$body.Append('<w:p><w:pPr><w:spacing w:after="60" w:line="264" w:lineRule="auto"/><w:ind w:left="340" w:hanging="280"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="' + $cHead + '"/></w:rPr><w:t xml:space="preserve">' + (Esc $Matches[2]) + '.  </w:t></w:r>' + (Convert-Inline $Matches[3]) + '</w:p>'); $i++; $subtitleDone = $true; continue
  }

  # first plain paragraph after the H1 becomes the cover subtitle; the deep space after it
  # drops the document-control block into the lower third, so the cover reads as a composition
  # rather than as a page that ran out of content
  if ($seenTitle -and -not $subtitleDone) {
    $subAfter = '2600'; $subSz = '26'; $subBefore = '120'
    if (-not $script:hasCover) { $subAfter = '200'; $subSz = '19'; $subBefore = '60' }
    [void]$body.Append('<w:p><w:pPr><w:spacing w:before="' + $subBefore + '" w:after="' + $subAfter + '" w:line="264" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:color w:val="' + $cMuted + '"/><w:sz w:val="' + $subSz + '"/></w:rPr><w:t xml:space="preserve">' + (Esc $trim) + '</w:t></w:r></w:p>')
    $subtitleDone = $true; $i++; continue
  }

  [void]$body.Append('<w:p><w:pPr><w:spacing w:after="140" w:line="264" w:lineRule="auto"/></w:pPr>' + (Convert-Inline $trim) + '</w:p>'); $i++
}

$nsW = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
$mgSide = '1304'; $mgTop = '1418'; $titlePgEl = '<w:footerReference w:type="first" r:id="rIdFooterFirst"/><w:titlePg/>'
if ($isClassic) { $mgSide = '1440'; $mgTop = '1440'; $titlePgEl = '' }   # classic: standard one-inch margins, footer on every page
$sectPr = '<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/>' + $titlePgEl + '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="' + $mgTop + '" w:right="' + $mgSide + '" w:bottom="' + $mgTop + '" w:left="' + $mgSide + '" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>'
$documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + $nsW + '><w:body>' + $body.ToString() + '<w:p/>' + $sectPr + '</w:body></w:document>'

$fp = '<w:rPr><w:color w:val="' + $cMuted + '"/><w:sz w:val="16"/></w:rPr>'
$pageField = '<w:r>' + $fp + '<w:fldChar w:fldCharType="begin"/></w:r><w:r>' + $fp + '<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r>' + $fp + '<w:fldChar w:fldCharType="end"/></w:r>'
$numField  = '<w:r>' + $fp + '<w:fldChar w:fldCharType="begin"/></w:r><w:r>' + $fp + '<w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r><w:r>' + $fp + '<w:fldChar w:fldCharType="end"/></w:r>'
$footLeft = ''
if ($FooterText) { $footLeft = '<w:r>' + $fp + '<w:t xml:space="preserve">' + (Esc $FooterText) + '</w:t></w:r>' }
$footerXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="7" w:color="' + $cRule + '"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="9298"/></w:tabs><w:spacing w:before="0" w:after="0"/>' + $fp + '</w:pPr>' +
  $footLeft + '<w:r>' + $fp + '<w:tab/><w:t xml:space="preserve">Page </w:t></w:r>' + $pageField + '<w:r>' + $fp + '<w:t xml:space="preserve"> of </w:t></w:r>' + $numField + '</w:p></w:ftr>'

# the cover carries no page number - a numbered title page reads as a draft
$footerFirstXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p></w:ftr>'

# updateFields is set ONLY for a live (field-based) contents list. It is what makes Word ask
# "this document contains fields that may refer to other files" on every single open, so the
# default written-out contents list deliberately leaves it off and the document opens silently.
$updateFieldsEl = ''; if ($LiveToc) { $updateFieldsEl = '<w:updateFields w:val="true"/>' }
$settingsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' + $updateFieldsEl + '<w:defaultTabStop w:val="720"/></w:settings>'

$tocStyle = {
  param($id, $name, $indent)
  '<w:style w:type="paragraph" w:styleId="' + $id + '"><w:name w:val="' + $name + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9298"/></w:tabs><w:spacing w:before="0" w:after="60" w:line="240" w:lineRule="auto"/><w:ind w:left="' + $indent + '" w:right="340"/></w:pPr><w:rPr><w:color w:val="' + $cBody + '"/></w:rPr></w:style>'
}

# A document with a contents section is a formal deliverable and gets display-sized headings.
# A short working document gets working-document type: small masthead, restrained hierarchy, tight spacing.
if ($script:hasCover) {
  $szTitle = '54'; $szH1 = '32'; $szH2 = '25'; $szH3 = '22'
  $titleBefore = '1600'; $titleRule = '18'; $h1Before = '380'; $h1After = '160'
  $h2Before = '260'; $h2After = '90'; $h3Before = '200'; $h3After = '70'
}
else {
  $szTitle = '28'; $szH1 = '23'; $szH2 = '21'; $szH3 = '20'
  $titleBefore = '0'; $titleRule = '8'; $h1Before = '220'; $h1After = '80'
  $h2Before = '180'; $h2After = '55'; $h3Before = '150'; $h3After = '45'
}
$szBody = '21'; if (-not $script:hasCover) { $szBody = '20' }

# classic preset: a conservative corporate Word look - Arial 11pt, three-tone
# blue headings at their original sizes, no framing rules, standard one-inch margins
if ($isClassic) {
  $szBody = '22'
  $szTitle = '40'; $szH1 = '30'; $szH2 = '25'; $szH3 = '24'
  $titleBefore = '200'; $titleRule = '0'
  $h1Before = '280'; $h1After = '140'; $h2Before = '200'; $h2After = '100'; $h3Before = '160'; $h3After = '60'
}

$stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="' + $fontMain + '" w:hAnsi="' + $fontMain + '" w:cs="' + $fontMain + '"/><w:color w:val="' + $cBody + '"/><w:sz w:val="' + $szBody + '"/><w:szCs w:val="' + $szBody + '"/></w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
  '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="70" w:type="dxa"/><w:left w:w="130" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/><w:right w:w="130" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
  '<w:style w:type="table" w:styleId="HouseTable"><w:name w:val="House Table"/><w:basedOn w:val="TableNormal"/></w:style>' +
  # cover title: navy text on white with a heavy accent rule beneath - reads as designed, not as a filled block
  $(if ($isClassic) {
      '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:before="' + $titleBefore + '" w:after="40" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="' + $szTitle + '"/><w:szCs w:val="' + $szTitle + '"/></w:rPr></w:style>'
    } else {
      '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="' + $titleRule + '" w:space="8" w:color="' + $cNavy + '"/></w:pBdr><w:spacing w:before="' + $titleBefore + '" w:after="0" w:line="228" w:lineRule="auto"/><w:contextualSpacing/></w:pPr><w:rPr><w:b/><w:color w:val="' + $cNavy + '"/><w:sz w:val="' + $szTitle + '"/><w:szCs w:val="' + $szTitle + '"/></w:rPr></w:style>'
    }) +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:keepLines/>' + $(if (-not $isClassic) { '<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="' + $cHead + '"/></w:pBdr>' }) + '<w:spacing w:before="' + $h1Before + '" w:after="' + $h1After + '" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="' + $cNavy + '"/><w:sz w:val="' + $szH1 + '"/><w:szCs w:val="' + $szH1 + '"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="' + $h2Before + '" w:after="' + $h2After + '" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="' + $cHead + '"/><w:sz w:val="' + $szH2 + '"/><w:szCs w:val="' + $szH2 + '"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="' + $h3Before + '" w:after="' + $h3After + '" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr>' + $(if (-not $isClassic) { '<w:b/>' }) + '<w:color w:val="' + $cHead3 + '"/><w:sz w:val="' + $szH3 + '"/><w:szCs w:val="' + $szH3 + '"/></w:rPr></w:style>' +
  $(if ($isClassic) {
      # matches the Heading 2 look the original document uses for its contents heading
      '<w:style w:type="paragraph" w:styleId="TocHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="' + $h2Before + '" w:after="' + $h2After + '" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="9"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="' + $cHead + '"/><w:sz w:val="' + $szH2 + '"/><w:szCs w:val="' + $szH2 + '"/></w:rPr></w:style>'
    } else {
      '<w:style w:type="paragraph" w:styleId="TocHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="' + $cHead + '"/></w:pBdr><w:spacing w:before="0" w:after="200" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="9"/></w:pPr><w:rPr><w:b/><w:color w:val="' + $cNavy + '"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>'
    }) +
  (& $tocStyle 'TOC1' 'toc 1' '0') +
  (& $tocStyle 'TOC2' 'toc 2' '280') +
  (& $tocStyle 'TOC3' 'toc 3' '560') +
  '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="' + $cHead + '"/></w:rPr></w:style>' +
  '</w:styles>'

$ctImg = ''; if ($script:images.Count -gt 0) { $ctImg = '<Default Extension="png" ContentType="image/png"/>' }
$contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' + $ctImg +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
  '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
  '<Override PartName="/word/footer2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>'
$relsRoot = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
$docRelsParts = '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
  '<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
  '<Relationship Id="rIdFooterFirst" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/>'
foreach ($img in $script:images) { $docRelsParts += '<Relationship Id="' + $img.Rel + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + $img.Media + '"/>' }
$docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + $docRelsParts + '</Relationships>'

if (Test-Path -LiteralPath $Out) { Remove-Item -LiteralPath $Out -Force }
$enc = New-Object System.Text.UTF8Encoding($false)
$fs = [System.IO.File]::Open($Out, [System.IO.FileMode]::Create)
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
function Add-Text($zip, $name, $content, $enc) { $e = $zip.CreateEntry($name, [System.IO.Compression.CompressionLevel]::Optimal); $s = $e.Open(); $b = $enc.GetBytes($content); $s.Write($b, 0, $b.Length); $s.Dispose() }
Add-Text $zip '[Content_Types].xml' $contentTypes $enc
Add-Text $zip '_rels/.rels' $relsRoot $enc
Add-Text $zip 'word/document.xml' $documentXml $enc
Add-Text $zip 'word/styles.xml' $stylesXml $enc
Add-Text $zip 'word/settings.xml' $settingsXml $enc
Add-Text $zip 'word/footer1.xml' $footerXml $enc
Add-Text $zip 'word/footer2.xml' $footerFirstXml $enc
Add-Text $zip 'word/_rels/document.xml.rels' $docRels $enc
foreach ($img in $script:images) { $e = $zip.CreateEntry('word/media/' + $img.Media, [System.IO.Compression.CompressionLevel]::Optimal); $s = $e.Open(); $bytes = [System.IO.File]::ReadAllBytes($img.File); $s.Write($bytes, 0, $bytes.Length); $s.Dispose() }
$zip.Dispose(); $fs.Close()
$tocNote = ''; if ($tocEmitted) { $tocNote = ', live TOC' }
Write-Output ("OK: wrote {0} ({1} bytes, {2} image(s){3})" -f $Out, (Get-Item -LiteralPath $Out).Length, $script:images.Count, $tocNote)
