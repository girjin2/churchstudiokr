# One-time Windows setup for the ChurchStudio GitHub -> Google Drive backup.
# Run from a trusted PowerShell session. Never paste OAuth tokens into ChatGPT.
$ErrorActionPreference = "Stop"
$repo = "girjin2/churchstudiokr"
$secretName = "GDRIVE_RCLONE_CONFIG"

foreach ($tool in @("rclone", "gh")) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        if ($tool -eq "rclone") {
            Write-Host "Install rclone first: winget install --id Rclone.Rclone -e"
        } else {
            Write-Host "Install GitHub CLI first: winget install --id GitHub.cli -e"
        }
        throw "$tool is not available. Install it, open a new PowerShell window, and retry."
    }
}

Write-Host "Google Drive authorization: make sure you select the Google account specified for the ChurchStudio backup."
$configLines = @(& rclone config file)
if ($LASTEXITCODE -ne 0 -or $configLines.Count -eq 0) { throw "Cannot locate rclone config." }
$configPath = ($configLines | Where-Object { $_.Trim() -ne "" } | Select-Object -Last 1).Trim()
$needsRemote = (-not (Test-Path -LiteralPath $configPath))
if (-not $needsRemote) {
    $needsRemote = -not [regex]::IsMatch([IO.File]::ReadAllText($configPath), '(?m)^\[gdrive\]\s*$')
}
if ($needsRemote) {
    Write-Host "In rclone config, choose n (new remote), name gdrive, storage drive, and authorize in your browser."
    & rclone config
    if ($LASTEXITCODE -ne 0) { throw "Google Drive authorization failed." }
}
if (-not (Test-Path -LiteralPath $configPath)) { throw "rclone configuration was not created." }
$configText = [IO.File]::ReadAllText($configPath)
if (-not [regex]::IsMatch($configText, '(?m)^\[gdrive\]\s*$')) {
    throw "Missing [gdrive] remote in rclone configuration."
}
if (-not [regex]::IsMatch($configText, '(?m)^\s*token\s*=')) {
    throw "Missing OAuth token in rclone configuration. Complete Google authorization."
}
Write-Host "Verify that gdrive is authorized for the intended account. If in doubt, cancel and reconfigure it before proceeding."
$answer = Read-Host "Confirm correct Google account (type YES to proceed)"
if ($answer -cne "YES") { throw "Cancelled before saving any secret." }

& gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Sign in to the GitHub account that owns $repo."
    & gh auth login --web --git-protocol https
    if ($LASTEXITCODE -ne 0) { throw "GitHub authorization failed." }
}
$login = (& gh api user --jq '.login').Trim()
if ($LASTEXITCODE -ne 0 -or $login -ne "girjin2") { throw "Signed-in GitHub account is not girjin2. Stopped for safety." }

# The OAuth secret goes from the local config directly to GitHub Secrets via GitHub CLI.
# Neither the config nor its token is printed to the console, logged or committed.
$configText | & gh secret set $secretName --repo $repo
$status = $LASTEXITCODE
Remove-Variable configText -ErrorAction SilentlyContinue
if ($status -ne 0) { throw "GitHub secret setup failed." }

& gh workflow run drive-backup.yml --repo $repo --ref main
if ($LASTEXITCODE -ne 0) { throw "Secret saved, but starting the first backup failed." }
Write-Host "Backup requested. Review its result in https://github.com/girjin2/churchstudiokr/actions"
Write-Host "Only a successful upload-and-check job proves that the backup reached Google Drive."
