# ============================================================
# TruckOpti - Update Supabase Email Templates
# ============================================================
# This script uploads branded OTP email templates to the hosted
# Supabase project via the Management API.
#
# PREREQUISITES:
#   1. Get your Supabase Personal Access Token (PAT):
#      https://supabase.com/dashboard/account/tokens
#   2. Run:  $env:SUPABASE_ACCESS_TOKEN = "sbp_xxxxxxxxxxxx"
#      Then:  .\scripts\update-email-templates.ps1
# ============================================================

param(
    [string]$AccessToken = $env:SUPABASE_ACCESS_TOKEN
)

$ProjectRef = "jbxncejtcbpcronndqlx"
$ApiBase    = "https://api.supabase.com"

if (-not $AccessToken) {
    Write-Host ""
    Write-Host "ERROR: Supabase access token not provided." -ForegroundColor Red
    Write-Host ""
    Write-Host "Get your token from: https://supabase.com/dashboard/account/tokens" -ForegroundColor Yellow
    Write-Host "Then run:"
    Write-Host '  $env:SUPABASE_ACCESS_TOKEN = "sbp_your_token_here"'
    Write-Host '  .\scripts\update-email-templates.ps1'
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  TruckOpti Email Template Updater" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# ---- Load template files ----
$ScriptDir      = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot    = Split-Path -Parent $ScriptDir
$MagicLinkFile  = Join-Path $ProjectRoot "supabase\templates\magic_link.html"
$ConfirmFile    = Join-Path $ProjectRoot "supabase\templates\confirmation.html"

if (-not (Test-Path $MagicLinkFile)) {
    Write-Host "ERROR: Template not found: $MagicLinkFile" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $ConfirmFile)) {
    Write-Host "ERROR: Template not found: $ConfirmFile" -ForegroundColor Red
    exit 1
}

$MagicLinkHtml = Get-Content $MagicLinkFile -Raw
$ConfirmHtml   = Get-Content $ConfirmFile   -Raw

Write-Host "Templates loaded:" -ForegroundColor Green
Write-Host "  magic_link.html  ($([Math]::Round($MagicLinkHtml.Length/1024, 1)) KB)"
Write-Host "  confirmation.html ($([Math]::Round($ConfirmHtml.Length/1024, 1)) KB)"
Write-Host ""

# ---- Build the payload ----
$Payload = @{
    # Subjects
    mailer_subjects_magic_link  = "Your TruckOpti Login Code"
    mailer_subjects_confirmation = "Verify your TruckOpti account"
    mailer_subjects_recovery    = "Reset your TruckOpti password"

    # Templates
    mailer_templates_magic_link_content   = $MagicLinkHtml
    mailer_templates_confirmation_content = $ConfirmHtml
} | ConvertTo-Json -Depth 5

# ---- PATCH auth config ----
Write-Host "Uploading templates to Supabase project $ProjectRef ..." -ForegroundColor Yellow

try {
    $Response = Invoke-RestMethod `
        -Method  Patch `
        -Uri     "$ApiBase/v1/projects/$ProjectRef/config/auth" `
        -Headers @{
            "Authorization" = "Bearer $AccessToken"
            "Content-Type"  = "application/json"
        } `
        -Body $Payload

    Write-Host ""
    Write-Host "SUCCESS! Email templates updated." -ForegroundColor Green
    Write-Host ""
    Write-Host "Changes applied:" -ForegroundColor Cyan
    Write-Host "  Subject (login):  'Your TruckOpti Login Code'"
    Write-Host "  Subject (signup): 'Verify your TruckOpti account'"
    Write-Host "  Template:         Branded OTP code displayed prominently"
    Write-Host "  Magic link:       Still available as fallback button"
    Write-Host ""
    Write-Host "Test by requesting a magic link at: https://www.truckopti.in/login" -ForegroundColor Cyan
    Write-Host ""
}
catch {
    $StatusCode = $_.Exception.Response.StatusCode.Value__
    $ErrorBody  = $_.ErrorDetails.Message
    Write-Host ""
    Write-Host "ERROR: API call failed (HTTP $StatusCode)" -ForegroundColor Red
    if ($ErrorBody) {
        Write-Host $ErrorBody -ForegroundColor Red
    }
    Write-Host ""

    if ($StatusCode -eq 401) {
        Write-Host "Hint: Access token is invalid or expired." -ForegroundColor Yellow
        Write-Host "Generate a new one at: https://supabase.com/dashboard/account/tokens"
    }
    elseif ($StatusCode -eq 403) {
        Write-Host "Hint: You don't have permission to update this project." -ForegroundColor Yellow
        Write-Host "Make sure you are the project owner."
    }
    exit 1
}
