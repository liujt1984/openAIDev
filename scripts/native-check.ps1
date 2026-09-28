$ErrorActionPreference = 'Stop'
$compilerDir = if ($env:WECHAT_COMPILER_DIR) { $env:WECHAT_COMPILER_DIR } else { 'C:\Program Files (x86)\Tencent\微信web开发者工具\resources\app.asar.unpacked\node_modules\wcc-exec' }
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location (Join-Path $projectRoot 'miniprogram')
try {
  $pages = (Get-Content -LiteralPath 'app.json' -Raw -Encoding UTF8 | ConvertFrom-Json).pages | ForEach-Object { "${_}.wxml" }
  & (Join-Path $compilerDir 'wcc.exe') @pages -o (Join-Path $env:TEMP 'wuming-wxml.js')
  if ($LASTEXITCODE -ne 0) { throw 'WXML compilation failed' }
  & (Join-Path $compilerDir 'wcsc.exe') app.wxss -o (Join-Path $env:TEMP 'wuming-wxss.js')
  if ($LASTEXITCODE -ne 0) { throw 'WXSS compilation failed' }
  Write-Output 'PASS: native WXML and WXSS compilation.'
} finally { Pop-Location }
