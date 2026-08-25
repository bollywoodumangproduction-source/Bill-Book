const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const TOKEN_KEY = 'bumang_google_token';
const PROFILE_KEY = 'bumang_google_profile';
const CLIENT_ID_KEY = 'bumang_google_client_id';

const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.file';

export interface GoogleProfile {
  email: string;
  name: string;
  picture: string;
}

export interface GoogleToken {
  access_token: string;
  expires_in: number;
  obtained_at: number;
  scope: string;
}

let scriptPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('No window'));
    const existing = document.getElementById('gis-script');
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = 'gis-script';
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity script'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function getStoredClientId(): string {
  try {
    return localStorage.getItem(CLIENT_ID_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setStoredClientId(id: string): void {
  try {
    localStorage.setItem(CLIENT_ID_KEY, id);
  } catch {
    /* ignore */
  }
}

export function getStoredToken(): GoogleToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const token = JSON.parse(raw) as GoogleToken;
    const elapsed = (Date.now() - token.obtained_at) / 1000;
    if (elapsed >= token.expires_in - 60) return null;
    return token;
  } catch {
    return null;
  }
}

export function getStoredProfile(): GoogleProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GoogleProfile;
  } catch {
    return null;
  }
}

function storeToken(token: GoogleToken): void {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  } catch {
    /* ignore */
  }
}

function storeProfile(profile: GoogleProfile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* ignore */
  }
}

export function isGoogleConnected(): boolean {
  return getStoredToken() !== null;
}

export function disconnectGoogle(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROFILE_KEY);
  } catch {
    /* ignore */
  }
}

export async function signInWithGoogle(clientId: string): Promise<{ token: GoogleToken; profile: GoogleProfile }> {
  if (!clientId || !clientId.trim()) {
    throw new Error('Please enter your Google Client ID first.');
  }
  const trimmedId = clientId.trim();
  setStoredClientId(trimmedId);
  await loadGisScript();

  const google = (window as any).google;
  if (!google?.accounts?.oauth2) {
    throw new Error('Google Identity Services not available.');
  }

  const token: GoogleToken = await new Promise<GoogleToken>((resolve, reject) => {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: trimmedId,
      scope: SCOPES,
      callback: (response: any) => {
        if (response.error) {
          reject(new Error(response.error_description ?? response.error));
          return;
        }
        resolve({
          access_token: response.access_token,
          expires_in: Number(response.expires_in) || 3600,
          obtained_at: Date.now(),
          scope: response.scope ?? SCOPES,
        });
      },
      error_callback: (err: any) => {
        reject(new Error(err?.message ?? 'Google sign-in failed.'));
      },
    });
    tokenClient.requestAccessToken();
  });

  storeToken(token);

  const profile = await fetchUserProfile(token.access_token);
  storeProfile(profile);

  return { token, profile };
}

async function fetchUserProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch Google profile.');
  const data = await res.json();
  return {
    email: data.email ?? '',
    name: data.name ?? data.email ?? '',
    picture: data.picture ?? '',
  };
}
