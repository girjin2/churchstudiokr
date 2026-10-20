# ChurchStudio -> Google Drive source backup

This repository contains the **ChurchStudio website** (Next.js), not necessarily the Windows broadcast application.

Destination: existing Google Drive folder `ChurchStudio_Codex_Cloud_Backup` in the account explicitly selected during authorization.

The workflow `.github/workflows/drive-backup.yml` runs on each push to `main` or manually. It creates a versioned ZIP of committed source files, a SHA-256 checksum file, and a manifest. Files are uploaded directly to Drive; no GitHub Actions artifact retention is used. Upload verification downloads and compares against the source. It never deletes old Drive files.

## One-time authorization on a trusted Windows PC

1. Install rclone and GitHub CLI, if missing:

   ```powershell
   winget install --id Rclone.Rclone -e
   winget install --id GitHub.cli -e
   ```

   Open a fresh PowerShell after installation.

2. Run `scripts/setup-drive-backup.ps1` from this repository. If no remote named `gdrive` exists, the script starts `rclone config`. Choose new remote `gdrive`, storage `drive`, and authorize the intended Google account in your browser.
3. Review Google's requested access carefully. If that access is broader than desired, stop and use a dedicated backup-only Google account instead. The stored OAuth refresh token is sensitive.
4. The script asks you to confirm the Google account, completes GitHub CLI authentication if required, sends the local rclone config to the *encrypted* GitHub Actions secret `GDRIVE_RCLONE_CONFIG`, then dispatches a backup run.
5. Confirm the run succeeded in GitHub Actions and check the destination folder.

**Never** paste the rclone config or OAuth token into chat, issues, code, logs, screenshots or Google Docs. Do not commit `rclone.conf`.

If Google authorization expires, re-run the setup script to refresh the GitHub secret. Google Drive connector authorization for ChatGPT **cannot** automatically be reused by a GitHub Actions runner.

The versioned file names avoid overwriting previous backups. This workflow does not build a Windows EXE or back up the Windows broadcast application; that requires its actual source repository and a separate Windows build workflow.
