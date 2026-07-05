import { hasValidExtensionContext, isExtensionContextInvalidatedError } from "../utilities/extension-context";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_DRIVE_SYNC_CLIENT_ID as string | undefined;
const DRIVE_APP_DATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const SYNC_FILE_NAME = "poe-trade-plus-sync.json";
const REDIRECT_PATH = "google-drive-sync";

interface DriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

export interface GoogleDriveSyncResult {
  success: boolean;
  reason?: "not-configured" | "auth-unavailable" | "auth-cancelled" | "network" | "invalid-backup";
  modifiedTime?: string;
  dataString?: string;
  redirectUrl?: string;
}

type GoogleDriveSyncRequest =
  | { query: "google-drive-sync-upload"; dataString: string }
  | { query: "google-drive-sync-download" }
  | { query: "google-drive-sync-redirect-url" };

const isGoogleDriveSyncRequest = (request: unknown): request is GoogleDriveSyncRequest => {
  if (!request || typeof request !== "object") return false;

  const candidate = request as Partial<GoogleDriveSyncRequest>;
  if (candidate.query === "google-drive-sync-download") return true;
  if (candidate.query === "google-drive-sync-redirect-url") return true;
  return candidate.query === "google-drive-sync-upload"
    && typeof (candidate as { dataString?: unknown }).dataString === "string";
};

const sendGoogleDriveSyncMessage = (request: GoogleDriveSyncRequest) =>
  new Promise<GoogleDriveSyncResult>((resolve) => {
    if (!hasValidExtensionContext() || !chrome.runtime?.sendMessage) {
      resolve({ success: false, reason: "auth-unavailable" });
      return;
    }

    chrome.runtime.sendMessage(request, (response?: GoogleDriveSyncResult) => {
      const runtimeError = chrome.runtime?.lastError;
      if (runtimeError) {
        console.warn("[Poe Trade Plus] Google Drive sync message failed", runtimeError);
        resolve({ success: false, reason: "network" });
        return;
      }

      resolve(response ?? { success: false, reason: "network" });
    });
  });

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const createRandomVerifier = () => {
  const values = new Uint8Array(32);
  crypto.getRandomValues(values);
  return toBase64Url(values);
};

const createCodeChallenge = async (verifier: string) => {
  const bytes = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toBase64Url(new Uint8Array(digest));
};

const launchWebAuthFlow = (url: string) =>
  new Promise<string>((resolve, reject) => {
    if (!hasValidExtensionContext() || !chrome.identity?.launchWebAuthFlow) {
      reject(new Error("identity-unavailable"));
      return;
    }

    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (redirectUrl) => {
      const runtimeError = chrome.runtime?.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      if (!redirectUrl) {
        reject(new Error("auth-cancelled"));
        return;
      }

      resolve(redirectUrl);
    });
  });

const authenticate = async () => {
  if (!CLIENT_ID) return null;
  if (!hasValidExtensionContext() || !chrome.identity?.getRedirectURL) {
    throw new Error("identity-unavailable");
  }

  const redirectUri = chrome.identity.getRedirectURL(REDIRECT_PATH);
  const verifier = createRandomVerifier();
  const challenge = await createCodeChallenge(verifier);
  const state = createRandomVerifier();
  const authUrl = new URL(AUTH_URL);
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", DRIVE_APP_DATA_SCOPE);
  authUrl.searchParams.set("access_type", "online");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);

  const redirectUrl = await launchWebAuthFlow(authUrl.toString());
  const redirected = new URL(redirectUrl);
  if (redirected.searchParams.get("state") !== state) {
    throw new Error("invalid-state");
  }

  const code = redirected.searchParams.get("code");
  if (!code) {
    throw new Error(redirected.searchParams.get("error") || "auth-cancelled");
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri
    })
  });

  const token = await response.json() as TokenResponse;
  if (!response.ok || !token.access_token) {
    throw new Error(token.error_description || token.error || "token-failed");
  }

  return token.access_token;
};

const requestDrive = async (accessToken: string, url: string, init: RequestInit = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...init.headers
    }
  });

  if (!response.ok) {
    throw new Error(`drive-${response.status}`);
  }

  return response;
};

const findSyncFile = async (accessToken: string): Promise<DriveFile | null> => {
  const url = new URL(DRIVE_FILES_URL);
  url.searchParams.set("spaces", "appDataFolder");
  url.searchParams.set("fields", "files(id,name,modifiedTime)");
  url.searchParams.set(
    "q",
    `name = '${SYNC_FILE_NAME.replace(/'/g, "\\'")}' and 'appDataFolder' in parents and trashed = false`
  );

  const response = await requestDrive(accessToken, url.toString());
  const result = await response.json() as { files?: DriveFile[] };
  return result.files?.[0] ?? null;
};

const createSyncFile = async (accessToken: string, dataString: string) => {
  const boundary = `poe-trade-plus-${Date.now()}`;
  const metadata = {
    name: SYNC_FILE_NAME,
    mimeType: "application/json",
    parents: ["appDataFolder"]
  };
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    dataString,
    `--${boundary}--`
  ].join("\r\n");

  const url = `${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,modifiedTime`;
  const response = await requestDrive(accessToken, url, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body
  });
  return await response.json() as DriveFile;
};

const updateSyncFile = async (accessToken: string, fileId: string, dataString: string) => {
  const url = `${DRIVE_UPLOAD_URL}/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,modifiedTime`;
  const response = await requestDrive(accessToken, url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: dataString
  });
  return await response.json() as DriveFile;
};

const mapError = (error: unknown): GoogleDriveSyncResult["reason"] => {
  const message = error instanceof Error ? error.message : "";
  if (message === "identity-unavailable") return "auth-unavailable";
  if (message.includes("cancel") || message.includes("denied")) return "auth-cancelled";
  return "network";
};

export const googleDriveSyncService = {
  isConfigured() {
    return Boolean(CLIENT_ID);
  },

  uploadBackup(dataString: string): Promise<GoogleDriveSyncResult> {
    return sendGoogleDriveSyncMessage({ query: "google-drive-sync-upload", dataString });
  },

  downloadBackup(): Promise<GoogleDriveSyncResult> {
    return sendGoogleDriveSyncMessage({ query: "google-drive-sync-download" });
  },

  getRedirectUrl(): Promise<GoogleDriveSyncResult> {
    return sendGoogleDriveSyncMessage({ query: "google-drive-sync-redirect-url" });
  }
};

const uploadBackupToDrive = async (dataString: string): Promise<GoogleDriveSyncResult> => {
  if (!CLIENT_ID) return { success: false, reason: "not-configured" };

  try {
    const accessToken = await authenticate();
    if (!accessToken) return { success: false, reason: "not-configured" };

    const existing = await findSyncFile(accessToken);
    const file = existing
      ? await updateSyncFile(accessToken, existing.id, dataString)
      : await createSyncFile(accessToken, dataString);

    return { success: true, modifiedTime: file.modifiedTime };
  } catch (error) {
    if (!isExtensionContextInvalidatedError(error)) {
      console.warn("[Poe Trade Plus] Google Drive sync upload failed", error);
    }
    return { success: false, reason: mapError(error) };
  }
};

const downloadBackupFromDrive = async (): Promise<GoogleDriveSyncResult> => {
  if (!CLIENT_ID) return { success: false, reason: "not-configured" };

  try {
    const accessToken = await authenticate();
    if (!accessToken) return { success: false, reason: "not-configured" };

    const file = await findSyncFile(accessToken);
    if (!file) return { success: false, reason: "invalid-backup" };

    const response = await requestDrive(
      accessToken,
      `${DRIVE_FILES_URL}/${encodeURIComponent(file.id)}?alt=media`
    );
    const dataString = await response.text();
    return { success: true, modifiedTime: file.modifiedTime, dataString };
  } catch (error) {
    if (!isExtensionContextInvalidatedError(error)) {
      console.warn("[Poe Trade Plus] Google Drive sync download failed", error);
    }
    return { success: false, reason: mapError(error) };
  }
};

const getGoogleDriveSyncRedirectUrl = (): GoogleDriveSyncResult => {
  if (!hasValidExtensionContext() || !chrome.identity?.getRedirectURL) {
    return { success: false, reason: "auth-unavailable" };
  }

  return {
    success: true,
    redirectUrl: chrome.identity.getRedirectURL(REDIRECT_PATH)
  };
};

export const registerGoogleDriveSyncHandlers = () => {
  if (!hasValidExtensionContext() || !chrome.runtime?.onMessage) return;

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (!isGoogleDriveSyncRequest(request)) return false;

    const task = request.query === "google-drive-sync-upload"
      ? uploadBackupToDrive(request.dataString)
      : request.query === "google-drive-sync-download"
        ? downloadBackupFromDrive()
        : Promise.resolve(getGoogleDriveSyncRedirectUrl());

    task.then(sendResponse).catch((error) => {
      console.warn("[Poe Trade Plus] Google Drive sync background handler failed", error);
      sendResponse({ success: false, reason: "network" } satisfies GoogleDriveSyncResult);
    });

    return true;
  });
};
