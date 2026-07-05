# Google Drive sync experiment

This branch adds an experimental manual sync path that stores Poe Trade Plus backups in the user's Google Drive `appDataFolder`.

## Why this approach

- It uses the user's Google account.
- Poe Trade Plus does not store synchronized data on its own server.
- Google Drive `appDataFolder` keeps the file hidden from normal Drive browsing and scoped to this app.
- The same backup format used by file export/import is reused for Drive upload/restore.
- OAuth and Google Drive network calls run in the extension background context. The sidebar content script only generates/restores the local backup data and sends messages to the background.

## Required Google setup

1. Create or choose a Google Cloud project.
2. Enable the Google Drive API.
3. Configure the OAuth consent screen.
4. Create an OAuth client for the extension flow.
5. Add every redirect URL returned by the target browser's extension identity API.
6. Build the extension with a local OAuth client ID:

```powershell
$env:VITE_GOOGLE_DRIVE_SYNC_CLIENT_ID="your-google-oauth-client-id"
npm run build
```

There is also a versionable template at `docs/google-drive-sync.env.example`.

## Redirect URLs

The sync code calls `chrome.identity.getRedirectURL("google-drive-sync")`. The generated URL depends on the browser and extension ID. Load the extension in each browser, inspect that value if needed, and add the exact URL to the OAuth client.

For stable testing, keep the extension ID stable per browser. In Chrome and Chromium-based browsers this usually means loading the same packaged extension or setting a stable extension key. In Firefox, the existing Gecko ID is `poe-trade-plus@kroxilabs.com`.

You can inspect the redirect URL from the extension console with:

```js
chrome.identity.getRedirectURL("google-drive-sync")
```

The Settings > Bookmarks Google Drive Sync block also includes `Copy OAuth Redirect URL`, which asks the background context for the exact URL and copies it to the clipboard.

Add every URL you plan to test as an authorized redirect URI in Google Cloud. Chrome, Firefox, Edge, Brave, and other Chromium-based browsers can each produce different URLs if the extension ID changes.

## Google error: app request is invalid

If Google shows `Access blocked: This app's request is invalid` or the Spanish `Acceso bloqueado: La solicitud de esta app no es válida`, check these first:

1. In Settings > Bookmarks > Google Drive Sync, click `Copy OAuth Redirect URL`.
2. In Google Cloud Console, open APIs & Services > Credentials.
3. Open the OAuth 2.0 Client ID used by `VITE_GOOGLE_DRIVE_SYNC_CLIENT_ID`.
4. Make sure the client type is compatible with a browser redirect flow. A Web application client with PKCE is the expected setup for this experiment.
5. Paste the copied URL into Authorized redirect URIs exactly as copied.
6. Repeat this per browser if the extension ID differs.
7. Confirm the Google Drive API is enabled.
8. If the OAuth consent screen is in Testing, add your Google account as a test user.

Chrome's identity API generates redirect URLs matching `https://<extension-id>.chromiumapp.org/*`. Google requires the `redirect_uri` sent by the extension to exactly match one of the OAuth client's authorized redirect URIs.

## Google error: app has not completed verification

If Google shows `Access blocked: Poe Trade Plus has not completed the Google verification process` or the Spanish `Acceso bloqueado: Poe Trade Plus no completó el proceso de verificación de Google`, the OAuth consent screen is blocking the account.

For local testing:

1. In Google Cloud Console, open APIs & Services > OAuth consent screen.
2. Keep Publishing status as `Testing`.
3. Open Audience.
4. Under Test users, add the exact Google account you are using in the browser.
5. Save and retry the extension login.

For public release:

1. Complete the OAuth consent screen with production app details.
2. Submit the app for Google OAuth verification if Google requires it for the requested Drive scope.
3. Keep using the narrow `https://www.googleapis.com/auth/drive.appdata` scope unless the feature truly needs broader Drive access.

Google may show unverified-app warnings or block access for accounts that are not listed as test users while the consent screen is in testing. Drive scopes can also require OAuth app verification before public production use.

## Manual test flow

1. Build the extension with `VITE_GOOGLE_DRIVE_SYNC_CLIENT_ID`.
2. Load the extension in Chrome.
3. Create or edit a folder/search/settings value.
4. Open Settings, then Bookmarks.
5. Click `Upload to Google` and complete Google sign-in.
6. Load the extension in Firefox or another Chromium browser using the same Google OAuth setup.
7. Open Settings, then Bookmarks.
8. Click `Restore from Google`.
9. Confirm folders, saved searches, settings, and supported local preferences appear.

## Notes

- This is manual upload/restore, not automatic background sync.
- Restore replaces the managed Poe Trade Plus storage keys with the backup from Drive, matching the existing file restore behavior.
- The OAuth client ID is public by design. No client secret is embedded in the extension.
- The OAuth client ID is compiled into the extension as public configuration, so keep real values in local ignored env files when you do not want them committed.
