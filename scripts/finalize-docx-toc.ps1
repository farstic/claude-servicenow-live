<#
.SYNOPSIS
  Resolve a live table-of-contents field once, then remove the setting that makes Word ask about it on every open.

.DESCRIPTION
  Companion to scripts/md-to-docx.ps1. There are two ways to give a .docx a table of contents, and each has a flaw:

    md-to-docx.ps1 (default)  - a written-out contents list. Opens silently, but carries no page numbers.
    md-to-docx.ps1 -LiveToc   - a real TOC field. Carries page numbers, but sets updateFields, which makes Word
                                prompt "this document contains fields that may refer to other files" on EVERY open.

  This script gives you both. Generate with -LiveToc, then run this once: it opens the document in Word, lets Word
  paginate and resolve the field, saves the resolved result back into the file, and then strips the updateFields
  setting out of word/settings.xml. The delivered document then opens silently AND shows real page numbers,
  because the entries are cached in the file rather than rebuilt on open.

  The reader can still refresh the contents at any time with Ctrl+A then F9 - that is ordinary Word behaviour and
  only becomes necessary if the document is edited afterwards.

.PARAMETER Path
  One or more .docx paths to finalize.

.EXAMPLE
  pwsh scripts/md-to-docx.ps1 -Src doc.md -Out doc.docx -LiveToc
  pwsh scripts/finalize-docx-toc.ps1 -Path doc.docx

.NOTES
  Requires Word to be installed (it is used only to paginate and resolve the field, and is closed again).
  Windows / PowerShell. Author: ServiceNow Architecture Engine.
#>
param([Parameter(Mandatory=$true)][string[]]$Path)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null

$resolved = @()
foreach ($p in $Path) { $resolved += (Resolve-Path -LiteralPath $p).Path }

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  foreach ($doc in $resolved) {
    $d = $word.Documents.Open($doc, $false, $false)   # not read-only: the resolved field must be saved back
    try {
      # let Word lay the document out, then resolve every field against that layout
      $d.Repaginate() | Out-Null
      $d.Fields.Update() | Out-Null
      for ($t = 1; $t -le $d.TablesOfContents.Count; $t++) { $d.TablesOfContents.Item($t).Update() | Out-Null }
      $d.Repaginate() | Out-Null
      $d.Fields.Update() | Out-Null          # second pass: pagination can shift once the contents list has its final length
      $pages = $d.ComputeStatistics(2)
      $d.Save()
      Write-Output ("resolved: {0} ({1} pages, {2} TOC)" -f (Split-Path $doc -Leaf), $pages, $d.TablesOfContents.Count)
    }
    finally { $d.Close($true) }
  }
}
finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}

# Strip the setting that triggers the "fields that may refer to other files" prompt. The field results Word
# just wrote stay in the file, so the contents list still shows its page numbers - it simply stops rebuilding.
foreach ($doc in $resolved) {
  $zip = [System.IO.Compression.ZipFile]::Open($doc, 'Update')
  try {
    $entry = $zip.Entries | Where-Object { $_.FullName -eq 'word/settings.xml' }
    if ($entry) {
      $sr = New-Object System.IO.StreamReader($entry.Open())
      $xml = $sr.ReadToEnd(); $sr.Close()
      if ($xml -match 'updateFields') {
        $xml = [regex]::Replace($xml, '<w:updateFields[^/]*/>', '')
        $xml = [regex]::Replace($xml, '<w:updateFields.*?</w:updateFields>', '')
        $entry.Delete()
        $new = $zip.CreateEntry('word/settings.xml')
        $sw = New-Object System.IO.StreamWriter($new.Open(), (New-Object System.Text.UTF8Encoding($false)))
        $sw.Write($xml); $sw.Flush(); $sw.Close()
        Write-Output ("silenced: {0}" -f (Split-Path $doc -Leaf))
      }
      else { Write-Output ("already silent: {0}" -f (Split-Path $doc -Leaf)) }
    }
  }
  finally { $zip.Dispose() }
}
