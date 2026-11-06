#Requires -Version 5.1
<#
  Aurora's Cake — ONE PowerShell file for the existing isolated staging project.
  Purpose: safely refresh the staging-only Apps Script, reset its private admin
  password in the owner editor, then verify and optionally complete exactly one
  synthetic Staff > Kitchen > Rider > COD order workflow.

  This script NEVER changes the production Sheet, creates a new Apps Script
  project, deploys a Web App, or records a real physical cash deposit.
  Do not put passwords in arguments, screenshots, command history or GitHub.
#>
[CmdletBinding()]
param(
  [ValidateSet('All','Continue','Check')]
  [string]$Mode='All'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'

$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stagingRoot=Join-Path $repoRoot '.aurora-staging-apps-script'
$claspConfig=Join-Path $stagingRoot '.clasp.json'
$scriptId='1Dqg2BH7t2ZAnM_Y1cCvraDpvkLCdxZY4e1kif6ptjWjLjKbK1QAmUdTI'
$stagingSheetId='1juEUytJCmnzwuoec3k5wsOa7xRy8N-rNqCAquZcNJPg'
$productionSheetId='18B0chk742grOCG4Wdx3w8Cn_sZFBCxc3WHbCtZBshY4'
$orderId='ord_8e42ea25-120e-4e48-a0f3-9ed18ecf7e9f'
$stagingUrl='https://script.google.com/macros/s/AKfycbwT3J7RLlJ2Uy0NwziRCex2XIJgJhryGC8x3NcvwRBkc6sQsYCOvRGropefvgAFA5N0/exec'
$sourceRef='fix/staging-one-command-20261106'
$rawBase='https://raw.githubusercontent.com/sagarmia583/Aurora-s-Cake/'+$sourceRef
$editorUrl='https://script.google.com/d/'+$scriptId+'/edit'
$runner=Join-Path $repoRoot 'scripts\accept-staging-staff.mjs'
$marker=Join-Path $repoRoot '.aurora-staging-staff-acceptance-attempted.txt'

function Assert-StagingTarget {
  if(!(Test-Path -LiteralPath $claspConfig)){
    throw 'STOP: existing isolated staging .clasp.json is missing. No project will be created.'
  }
  $config=Get-Content -LiteralPath $claspConfig -Raw | ConvertFrom-Json
  if([string]$config.scriptId -cne $scriptId){
    throw 'STOP: clasp links a different Apps Script project. No code was uploaded.'
  }
  if($stagingSheetId -ceq $productionSheetId){
    throw 'STOP: staging and production sheet IDs cannot match.'
  }
}
function Get-Executable([string]$name) {
  $cmd=Get-Command $name -ErrorAction SilentlyContinue
  if(!$cmd){throw ('Required program is missing: '+$name)}
  return $cmd.Source
}
function Save-ReviewedFile([string]$relative, [string]$backupRoot) {
  $destination=Join-Path $repoRoot $relative
  $parent=Split-Path -Parent $destination
  if(!(Test-Path -LiteralPath $parent)){throw ('Missing project directory: '+$parent)}
  $uri=$rawBase+'/'+$relative.Replace('\','/')
  $temporary=$destination+'.download-'+[guid]::NewGuid().ToString('N')
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $uri -OutFile $temporary -ErrorAction Stop
    if((Get-Item -LiteralPath $temporary).Length -lt 100){
      throw ('Downloaded file is unexpectedly short: '+$relative)
    }
    if(Test-Path -LiteralPath $destination){
      $backup=Join-Path $backupRoot $relative
      $backupParent=Split-Path -Parent $backup
      if(!(Test-Path $backupParent)){
        New-Item -ItemType Directory -Path $backupParent -Force | Out-Null
      }
      Copy-Item -LiteralPath $destination -Destination $backup -Force
    }
    Move-Item -LiteralPath $temporary -Destination $destination -Force
  }finally{
    if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary -Force}
  }
}
function Invoke-StaffRunner([string]$kind, [string]$nodePath) {
  $cliArgs=@(
    $runner,'--url',$stagingUrl,'--sheet-id',$stagingSheetId,
    '--order-id',$orderId,'--expect-total','360'
  )
  if($kind -eq 'login'){$cliArgs+='--login-only'}
  if($kind -eq 'commit'){$cliArgs+='--commit'}
  & $nodePath @cliArgs
  if($LASTEXITCODE -ne 0){
    if($kind -eq 'commit'){
      throw 'STAFF TEST STOPPED. Stages may have changed. DO NOT run the test again; inspect the private staging Sheet first.'
    }
    throw ('STAGING '+$kind+' check failed. No Staff order stages were changed by this check.')
  }
}
function Require-Confirmation([string]$message, [string]$phrase){
  $answer=Read-Host $message
  if(!$answer -or $answer.Trim() -cne $phrase){
    throw 'Cancelled. Nothing further was submitted.'
  }
}
function Create-OneTimeMarker {
  # Atomic CreateNew prevents starting this irreversible staged test twice
  # from the same local project, even if the first run crashes.
  $file=[System.IO.File]::Open($marker,[System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
  try {
    $writer=New-Object System.IO.StreamWriter($file)
    try{
      $writer.WriteLine('STAGING ONLY; DO NOT DELETE WITHOUT SHEET REVIEW')
      $writer.WriteLine('order_id='+$orderId)
      $writer.WriteLine('attempted_utc='+[DateTime]::UtcNow.ToString('o'))
      $writer.Flush()
    }finally{$writer.Dispose()}
  }finally{$file.Dispose()}
}

Write-Host ''
Write-Host 'AURORA STAGING: isolated Google Sheets only; production is NOT targeted.'
Assert-StagingTarget
$node=Get-Executable 'node.exe'

if($Mode -eq 'All'){
  $clasp=Get-Executable 'clasp.cmd'
  $backup=Join-Path $repoRoot ('.aurora-staging-local-backup-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
  Write-Host 'Step 1: backing up locally and downloading all compatible reviewed sources...'
  foreach($relative in @(
    'scripts/prepare-staging-apps-script.mjs',
    'scripts/accept-staging-staff.mjs',
    'apps-script/Code.AllInOne.gs'
  )){
    Save-ReviewedFile $relative $backup
  }
  Write-Host 'Step 2: generating a strictly isolated staged Code.gs...'
  $generator=Join-Path $repoRoot 'scripts\prepare-staging-apps-script.mjs'
  $bundle=Get-Content -LiteralPath (Join-Path $repoRoot 'apps-script\Code.AllInOne.gs') -Raw
  if(!$bundle.Contains($productionSheetId)){
    throw 'STOP: unrecognized source bundle. Refusing upload.'
  }
  & $node $generator '--sheet-id' $stagingSheetId
  if($LASTEXITCODE -ne 0){throw 'STAGING SOURCE GENERATION FAILED. Nothing uploaded.'}

  Assert-StagingTarget
  $code=Get-Content -LiteralPath (Join-Path $stagingRoot 'Code.gs') -Raw
  foreach($guard in @(
    'staging_auth_hardened:true',
    'staging_sheet_fingerprint',
    'function auroraStagingGuard_',
    'function resetAuroraStagingOwnerPasswordOnce()',
    'AURORA_STAGING_OWNER_RESET_PASSWORD'
  )){
    if(!$code.Contains($guard)){throw ('STOP: staging guard missing: '+$guard)}
  }
  if($code.Contains($productionSheetId)){
    throw 'STOP: production spreadsheet ID found in generated staging code.'
  }

  Write-Host 'Step 3: validated the existing STAGING project and code markers.'
  Require-Confirmation 'Type UPDATE-STAGING to push only to the existing staging project' 'UPDATE-STAGING'
  Push-Location $stagingRoot
  try {
    & $clasp 'push'
    if($LASTEXITCODE -ne 0){throw 'STAGING clasp push failed. No live deployment was triggered.'}
  }finally{Pop-Location}
  Write-Host ''
  Write-Host 'Step 4: manually reset the STAGING admin password in your Google account.'
  Write-Host ('Apps Script editor: '+$editorUrl)
  Write-Host 'In Project Settings > Script properties, create:'
  Write-Host 'AURORA_STAGING_OWNER_RESET_PASSWORD'
  Write-Host 'Choose a NEW unique password 16+ characters, with upper/lowercase, number and symbol.'
  Write-Host 'Save, return to the editor, run: resetAuroraStagingOwnerPasswordOnce'
  Write-Host 'Expected result: ok=true, reset=true, secret_deleted=true.'
  Write-Host 'DO NOT send or paste your password here. DO NOT run the old owner setup again.'
  Require-Confirmation 'When reset has succeeded in the editor, type RESET-DONE' 'RESET-DONE'
}
if($Mode -eq 'Continue'){
  Write-Host 'Continuing after the owner-only staging admin password reset.'
  if(!(Test-Path -LiteralPath $runner)){
    throw 'Missing reviewed staff runner; run -Mode All from this folder first.'
  }
}
Write-Host ''
Write-Host 'Step 5: strict read-only staging health preflight...'
Invoke-StaffRunner 'preflight' $node
if($Mode -eq 'Check'){
  Write-Host 'Health preflight complete. No login or workflow mutation was attempted.'
  exit 0
}
if(!(Test-Path -LiteralPath $runner)){throw 'The reviewed staged staff runner is missing.'}
Write-Host ''
Write-Host 'Step 6: checking the Admin password and the original PENDING COD order.'
Write-Host 'Password input is hidden; it is never saved to a file.'
$secret=Read-Host 'STAGING admin password (hidden)' -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  $env:AURORA_STAGING_ADMIN_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
}finally{
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
try {
  Invoke-StaffRunner 'login' $node
  if(Test-Path -LiteralPath $marker){
    throw 'STOP: one-time staff test already attempted locally. Inspect the private staging Sheet before considering another attempt.'
  }
  Write-Host ''
  Write-Host 'Step 7: one STAGING order will become Delivered and Paid (simulation only).'
  Write-Host 'This does NOT prove any real cash changed hands or independently approved cash deposit.'
  Require-Confirmation 'Type RUN-STAGING-STAFF to authorize the one-time workflow' 'RUN-STAGING-STAFF'
  Create-OneTimeMarker
  Invoke-StaffRunner 'commit' $node
  Write-Host ''
  Write-Host 'Staged Staff workflow command finished. Independently verify the Sheet before production.'
}finally{
  Remove-Item Env:\AURORA_STAGING_ADMIN_PASSWORD -ErrorAction SilentlyContinue
}
