#Requires -Version 5.1
<#
  Safe upgrade of the EXISTING isolated staging Apps Script ONLY.
  Does not deploy a Web App, change production, create orders or store passwords.
  Verifies the .clasp.json Script ID chosen by the owner before upload.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)]
  [ValidatePattern('^[A-Za-z0-9_-]{25,150}$')]
  [string]$SheetId,
  [Parameter(Mandatory=$true)]
  [ValidatePattern('^[A-Za-z0-9_-]{25,150}$')]
  [string]$ExpectedScriptId
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$target=Join-Path $root '.aurora-staging-apps-script'
$configFile=Join-Path $target '.clasp.json'
if(-not(Test-Path $configFile)){throw 'STOP: existing staging .clasp.json missing. Never create/clone production project here.'}
$config=Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json
if([string]$config.scriptId -cne $ExpectedScriptId){
  throw 'STOP: linked Apps Script project ID does not match the staging project approved by the owner.'
}
$node=Get-Command 'node.exe' -ErrorAction SilentlyContinue
if(-not $node){$node=Get-Command 'node' -ErrorAction SilentlyContinue}
$clasp=Get-Command 'clasp.cmd' -ErrorAction SilentlyContinue
if(-not $clasp){$clasp=Get-Command 'clasp' -ErrorAction SilentlyContinue}
if(-not $node -or -not $clasp){throw 'Node.js and official Google clasp CLI are required.'}
$generator=Join-Path $root 'scripts\prepare-staging-apps-script.mjs'
if(-not(Test-Path $generator)){throw 'Missing staging generator script.'}
$source=Join-Path $root 'apps-script\Code.AllInOne.gs'
if(-not(Test-Path $source)){throw 'Missing Apps Script one-file bundle.'}
$bundle=Get-Content -LiteralPath $source -Raw
$production=[regex]::Match($bundle,"var AURORA_SPREADSHEET_ID = '([^']+)'")
if(-not $production.Success){throw 'Production binding missing; refusing to generate staging.'}
if($SheetId -ceq $production.Groups[1].Value){throw 'STOP: this is the production Sheet ID.'}
Write-Host 'Staging project link and isolated Sheet checks passed.'
& $node.Source $generator --sheet-id $SheetId
if($LASTEXITCODE -ne 0){throw 'Staging bundle generation failed. Nothing was uploaded.'}
$code=Get-Content -LiteralPath (Join-Path $target 'Code.gs') -Raw
foreach($anchor in @('staging_auth_hardened:true','setupAuroraStagingOwnerOnce','AURORA_STAGING_OWNER_PASSWORD')){
  if(-not $code.Contains($anchor)){throw "STOP: hardened staging marker absent: $anchor"}
}
if($code.Contains("if(kind==='staff' && accounts.rows.length===0 && name==='admin')")){
  throw 'STOP: public first-login super admin takeover code remains in generated staging source.'
}
Write-Host 'Hardened source verified. Production deployment is not targeted.'
$confirmation=Read-Host 'Type UPDATE-ONLY-STAGING to push into this existing staging project'
if($confirmation -cne 'UPDATE-ONLY-STAGING'){throw 'Cancelled before any Apps Script upload.'}
Push-Location $target
try{
  & $clasp.Source push
  if($LASTEXITCODE -ne 0){throw 'Staging code upload failed. Check the ONLY staging project and do not retry blindly.'}
}finally{Pop-Location}
Write-Host 'Staging source uploaded. Next: in the STAGING editor Deploy > Manage deployments > Edit > New version.'
Write-Host 'Then create the first admin in the editor using setupAuroraStagingOwnerOnce.'
