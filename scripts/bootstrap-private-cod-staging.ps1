#Requires -Version 5.1
<#
.SYNOPSIS
  Create a NEW Aurora's Cake Apps Script staging project for a private sanitized Sheet.
.DESCRIPTION
  Never touches the production Sheet, Apps Script project, or Netlify site.
  Uses Google's official clasp CLI; Google OAuth is completed interactively
  by the staging account owner. This script does NOT deploy to production.
.EXAMPLE
  .\scripts\bootstrap-private-cod-staging.ps1 -SheetId <SANITIZED_STAGING_SHEET_ID>
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)]
  [ValidatePattern('^[A-Za-z0-9_-]{25,150}$')]
  [string]$SheetId
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$target=Join-Path $root '.aurora-staging-apps-script'
$source=Join-Path $root 'apps-script\Code.AllInOne.gs'
if(-not (Test-Path $source)){throw 'Missing Apps Script bundle. Check out the approved audit branch.'}
$node=Get-Command 'node.exe' -ErrorAction SilentlyContinue
if(-not $node){$node=Get-Command 'node' -ErrorAction SilentlyContinue}
if(-not $node){throw 'Install Node.js 20+ before proceeding.'}
$clasp=Get-Command 'clasp.cmd' -ErrorAction SilentlyContinue
if(-not $clasp){$clasp=Get-Command 'clasp' -ErrorAction SilentlyContinue}
if(-not $clasp){throw 'Install official Google clasp: npm install -g @google/clasp'}
$bundle=[System.IO.File]::ReadAllText($source)
$match=[regex]::Match($bundle,"var AURORA_SPREADSHEET_ID = '([A-Za-z0-9_-]+)'")
if(-not $match.Success){throw 'Cannot identify original Sheet binding; refusing to create project.'}
if($SheetId -eq $match.Groups[1].Value){throw 'STOP: the supplied ID is the original production Google Sheet.'}
if(Test-Path (Join-Path $target '.clasp.json')){
  throw 'STOP: an Apps Script project is already linked here. Refusing to reuse or overwrite it.'
}
if(Test-Path $target){
  $existing=@(Get-ChildItem -LiteralPath $target -Force)
  if($existing.Count -gt 0){throw 'STOP: staging directory is not empty. Review it manually before running this script.'}
}
Push-Location $root
try{
  & $node.Source 'scripts/build-apps-script.mjs' '--check'
  if($LASTEXITCODE -ne 0){throw 'Apps Script source check failed; no project was created.'}
  Write-Host 'Target: a NEW isolated staging Apps Script project.'
  Write-Host 'No customer or financial data is written by this setup.'
  Write-Host 'Use the Google account that has EDITOR access to the sanitized staging Sheet.'
  $confirm=Read-Host 'Type CREATE-STAGING to continue'
  if($confirm -cne 'CREATE-STAGING'){throw 'Cancelled: no project created.'}

  & $clasp.Source login
  if($LASTEXITCODE -ne 0){throw 'Google clasp login was not completed.'}
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Push-Location $target
  try{
    & $clasp.Source create --type standalone --title 'Aurora Cake - ISOLATED COD STAGING'
    if($LASTEXITCODE -ne 0){throw 'Could not create a new Apps Script project.'}
  }finally{Pop-Location}

  if(-not(Test-Path (Join-Path $target '.clasp.json'))){
    throw 'New Apps Script project was not confirmed; refusing to upload.'
  }
  & $node.Source 'scripts/prepare-staging-apps-script.mjs' '--sheet-id' $SheetId
  if($LASTEXITCODE -ne 0){throw 'Staging safety generator rejected the selected Google Sheet.'}
  Push-Location $target
  try{
    & $clasp.Source push
    if($LASTEXITCODE -ne 0){throw 'Upload was not completed. Inspect the NEW staging project only.'}
    Write-Host ''
    Write-Host 'Code was uploaded to a new isolated staging Apps Script project.'
    Write-Host 'Opening Google Apps Script; approve scopes and create a NEW Web app deployment:'
    & $clasp.Source open-script
    Write-Host 'Deploy > New deployment > Web app; Execute as: Me; Access: Anyone.'
    Write-Host 'Copy the new staging /exec URL and use the read-only COD preflight first.'
  }finally{Pop-Location}
}finally{Pop-Location}
