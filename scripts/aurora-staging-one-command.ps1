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
$sourceRef='80348e522e40df9d345820997a6a6ff3c4dc71b1'
$reviewedGsCommit='d0015d946d171f91f06507b2472aa39aef9c9be0'
$reviewedGsBlob='7656ab709f33847c5d9209986321ace75b3709b7'
$reviewedGeneratorBlob='07157abedb78901b94fa097d55e0722447719f42'
$reviewedRunnerBlob='eec699c2721cf249421ff5b61f7f45dfc51d3621'
$rawBase='https://raw.githubusercontent.com/sagarmia583/Aurora-s-Cake/'+$sourceRef
$editorUrl='https://script.google.com/d/'+$scriptId+'/edit'
$runner=Join-Path $repoRoot 'scripts\accept-staging-staff.mjs'
$marker=Join-Path $repoRoot '.aurora-staging-staff-acceptance-attempted.txt'

function Initialize-ExistingStagingLink {
  # An extracted GitHub ZIP never includes the private local .clasp.json.
  # Bind ONLY the known previously created staging Apps Script project.
  if(Test-Path -LiteralPath $claspConfig){return}
  if($Mode -ne 'All'){
    throw 'STOP: no local staging .clasp.json. Run the default All mode first.'
  }
  Write-Host ''
  Write-Host 'New GitHub ZIP detected: the existing staging Apps Script link is missing.'
  Write-Host ('Existing STAGING Apps Script editor: '+$editorUrl)
  Write-Host ('Expected existing STAGING Script ID: '+$scriptId)
  Write-Host 'This will NOT create an Apps Script project or change a spreadsheet.'
  $typed=Read-Host 'Copy the existing STAGING Script ID above to confirm the link'
  if(!$typed -or $typed.Trim() -cne $scriptId){
    throw 'STOP: staging project ID not confirmed. No Apps Script link created.'
  }
  if(!(Test-Path -LiteralPath $stagingRoot)){
    New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null
  }
  if(Test-Path -LiteralPath $claspConfig){
    throw 'STOP: staging configuration was concurrently created. Inspect it manually.'
  }
  # Write no-BOM UTF-8 so Node/clasp can parse the JSON reliably on WinPS 5.1.
  $json=(@{scriptId=$scriptId;rootDir='.'} | ConvertTo-Json -Compress)
  $utf8=New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($claspConfig,$json,$utf8)
  Write-Host 'Linked this ZIP to the EXISTING staging project only.'
}

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
function Resolve-Clasp {
  # Prefer an existing Google clasp command, including npm's Windows global
  # install directory when it has not been added to this shell's PATH.
  $candidate=Get-Command 'clasp.cmd' -ErrorAction SilentlyContinue
  if($candidate){return $candidate.Source}
  $npm=Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
  if(!$npm){throw 'npm.cmd is missing. Install Node.js 22+ and reopen PowerShell before continuing.'}
  $prefixLines=@(& $npm.Source config get prefix)
  if($LASTEXITCODE -ne 0 -or $prefixLines.Count -lt 1){
    throw 'Cannot discover the npm global executable directory. Nothing installed.'
  }
  $prefix=([string]$prefixLines[-1]).Trim()
  if(!$prefix -or !(Test-Path -LiteralPath $prefix)){
    throw 'Invalid npm global directory. Nothing installed.'
  }
  $claspPath=Join-Path $prefix 'clasp.cmd'
  if(Test-Path -LiteralPath $claspPath){
    $env:PATH=$prefix+';'+$env:PATH
    return $claspPath
  }
  $version=[string](& node.exe '--version')
  if($LASTEXITCODE -ne 0 -or $version -notmatch '^v([0-9]+)\.'){
    throw 'Cannot determine Node.js version. No package was installed.'
  }
  if([int]$Matches[1] -lt 22){
    throw ('Node.js '+$version+' detected. Current Google clasp requires Node.js 22 or newer. Upgrade Node.js and reopen PowerShell first.')
  }
  Write-Host 'Google Apps Script CLI (@google/clasp) is not installed.'
  Write-Host 'It can be installed globally with npm to manage your existing STAGING script.'
  Write-Host 'Source: https://github.com/google/clasp'
  Require-Confirmation 'Type INSTALL-CLASP to install the official @google/clasp CLI' 'INSTALL-CLASP'
  & $npm.Source install --global '@google/clasp'
  if($LASTEXITCODE -ne 0){throw 'npm could not install @google/clasp. No Apps Script code uploaded.'}
  $prefixLines=@(& $npm.Source config get prefix)
  if($LASTEXITCODE -ne 0 -or $prefixLines.Count -lt 1){
    throw 'Installed clasp but cannot find npm global directory.'
  }
  $prefix=([string]$prefixLines[-1]).Trim()
  $claspPath=Join-Path $prefix 'clasp.cmd'
  if(!(Test-Path -LiteralPath $claspPath)){
    throw 'clasp install did not provide clasp.cmd. Reopen PowerShell or inspect npm installation.'
  }
  $env:PATH=$prefix+';'+$env:PATH
  return $claspPath
}

function Get-GitBlobSha1([string]$path) {
  # Git object IDs hash "blob <byte length>\0" + the exact file bytes.
  $bytes=[System.IO.File]::ReadAllBytes($path)
  $prefix=[System.Text.Encoding]::ASCII.GetBytes('blob '+$bytes.Length+[char]0)
  $all=New-Object byte[] ($prefix.Length+$bytes.Length)
  [System.Array]::Copy($prefix,0,$all,0,$prefix.Length)
  [System.Array]::Copy($bytes,0,$all,$prefix.Length,$bytes.Length)
  $sha=[System.Security.Cryptography.SHA1]::Create()
  try {return ([System.BitConverter]::ToString($sha.ComputeHash($all))).Replace('-','').ToLowerInvariant()}
  finally {$sha.Dispose()}
}
function Save-ReviewedFile([string]$relative, [string]$backupRoot) {
  $destination=Join-Path $repoRoot $relative
  $parent=Split-Path -Parent $destination
  if(!(Test-Path -LiteralPath $parent)){throw ('Missing project directory: '+$parent)}
  $uri=$rawBase+'/'+$relative.Replace('\','/')
  $expectedBlob = switch ($relative) {
    'scripts/prepare-staging-apps-script.mjs' {$reviewedGeneratorBlob}
    'scripts/accept-staging-staff.mjs' {$reviewedRunnerBlob}
    'apps-script/Code.AllInOne.gs' {
      $uri='https://raw.githubusercontent.com/sagarmia583/Aurora-s-Cake/'+$reviewedGsCommit+'/apps-script/Code.AllInOne.gs'
      $reviewedGsBlob
    }
    default {throw ('Unapproved staging download path: '+$relative)}
  }
  $temporary=$destination+'.download-'+[guid]::NewGuid().ToString('N')
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $uri -OutFile $temporary -ErrorAction Stop
    if((Get-Item -LiteralPath $temporary).Length -lt 100){
      throw ('Downloaded file is unexpectedly short: '+$relative)
    }
    $actualBlob=Get-GitBlobSha1 $temporary
    if($actualBlob -cne $expectedBlob){
      throw ('SECURITY STOP: downloaded file differs from approved Git blob: '+$relative)
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
  if($kind -eq 'commit'){
    # Stream stage progress to the terminal, since the commit is non-atomic.
    & $nodePath @cliArgs
    if($LASTEXITCODE -ne 0){
      throw 'STAFF TEST STOPPED. Stages may have changed. DO NOT run the test again; inspect the private staging Sheet first.'
    }
    return
  }
  $lines=@(& $nodePath @cliArgs)
  $exitCode=$LASTEXITCODE
  foreach($line in $lines){Write-Host $line}
  if($exitCode -ne 0){
    throw ('STAGING '+$kind+' check failed. No Staff order stages were changed by this check.')
  }
  $record=@($lines | Where-Object {$_ -like 'STAGING STAFF ACCEPTANCE: *'} | Select-Object -Last 1)
  if($record.Count -ne 1){throw ('Staging '+$kind+' returned no verifiable result. STOP.')}
  $payload=($record[0] -replace '^STAGING STAFF ACCEPTANCE:\s*','') | ConvertFrom-Json
  if($payload.isolated_staging -ne $true -or $payload.hardened_staff_auth -ne $true){
    throw 'Staging response has invalid isolation or security markers. STOP.'
  }
  if($kind -eq 'preflight' -and $payload.mode -cne 'preflight'){
    throw 'Expected the read-only staging preflight. STOP.'
  }
  if($kind -eq 'preflight'){
    $health=Invoke-RestMethod -UseBasicParsing -Method Get -Uri ($stagingUrl+'?action=health') -TimeoutSec 30
    if([string]$health.staging_reviewed_commit -cne $reviewedGsCommit){
      throw 'STOP: staging /exec is still on an older version, not the pinned security-reviewed release.'
    }
  }
  if($kind -eq 'login' -and (
    $payload.mode -cne 'login_check' -or
    $payload.admin_verified -ne $true -or
    $payload.order_pending -ne $true -or
    $payload.no_staff_or_order_mutations -ne $true
  )){throw 'Admin login or pending-order check did not pass. STOP.'}
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
Initialize-ExistingStagingLink
Assert-StagingTarget
if($Mode -ne 'Check' -and (Test-Path -LiteralPath $marker)){
  throw 'STOP: a staged workflow was already attempted in this project. Read the private Sheet before resetting or repeating the test.'
}
$node=Get-Executable 'node.exe'

if($Mode -eq 'All'){
  $clasp=Resolve-Clasp
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
  $stageCodeFile=Join-Path $stagingRoot 'Code.gs'
  $code=Get-Content -LiteralPath $stageCodeFile -Raw
  $marker='staging_auth_hardened:true,'
  if(([regex]::Matches($code,[regex]::Escape($marker))).Count -ne 1){
    throw 'STOP: staging health marker cannot be uniquely located.'
  }
  $code=$code.Replace($marker,$marker+"staging_reviewed_commit:'"+$reviewedGsCommit+"',")
  [System.IO.File]::WriteAllText($stageCodeFile,$code,(New-Object System.Text.UTF8Encoding($false)))
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
  Write-Host 'IMPORTANT: clasp push changes editor HEAD, not the existing /exec deployment.'
  Write-Host 'In this STAGING editor, go to Deploy > Manage deployments, edit the existing STAGING web app,'
  Write-Host 'select New version and Deploy. Keep the same staging /exec URL; do not touch production.'
  Require-Confirmation 'After the existing STAGING deployment uses a NEW version, type STAGING-DEPLOYED' 'STAGING-DEPLOYED'
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
