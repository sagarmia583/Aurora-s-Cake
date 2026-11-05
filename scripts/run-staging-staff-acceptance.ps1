#Requires -Version 5.1
<#
  Staging-only workflow: GET-only by default, -Commit mutates ONE previously
  verified staging COD order. No passwords appear in arguments or logs.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Url,
  [Parameter(Mandatory=$true)][string]$SheetId,
  [Parameter(Mandatory=$true)][string]$OrderId,
  [Parameter(Mandatory=$true)][decimal]$ExpectedTotal,
  [switch]$Commit
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$script=Join-Path $root 'scripts\accept-staging-staff.mjs'
if(-not(Test-Path $script)){throw 'Staging staff runner not found. Update this GitHub PR checkout.'}
$node=Get-Command 'node.exe' -ErrorAction SilentlyContinue
if(-not $node){$node=Get-Command 'node' -ErrorAction SilentlyContinue}
if(-not $node){throw 'Node.js is required.'}
$arguments=@($script,'--url',$Url,'--sheet-id',$SheetId,'--order-id',$OrderId,'--expect-total',[string]$ExpectedTotal)
if($Commit){
  Write-Host 'This will mutate only the previously verified isolated staging COD order.'
  Write-Host 'It creates five temporary role accounts, transitions the order to Delivered,'
  Write-Host 'records simulated cash acknowledgement and disables test staff accounts.'
  Write-Host 'It does NOT create an independent cash deposit or physical payment.'
  $answer=Read-Host 'Type RUN-STAGING-STAFF to authorize this one-time test'
  if($answer -cne 'RUN-STAGING-STAFF'){throw 'Cancelled without writing.'}
  $secure=Read-Host 'Staging admin password (hidden)' -AsSecureString
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {$env:AURORA_STAGING_ADMIN_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
  finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
  $arguments+='--commit'
}
try{
  & $node.Source @arguments
  if($LASTEXITCODE -ne 0){throw 'Staging staff acceptance did not complete. DO NOT repeat -Commit until the Sheet is inspected.'}
}finally{
  Remove-Item 'Env:\AURORA_STAGING_ADMIN_PASSWORD' -ErrorAction SilentlyContinue
}
