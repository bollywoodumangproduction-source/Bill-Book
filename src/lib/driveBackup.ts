import { loadDB, saveDB, type MockDB } from '@/lib/mockData';
import { getStoredToken, getStoredProfile } from '@/lib/googleAuth';

const DRIVE_FILE_NAME = 'Studio_Master_Backup.json';
const DRIVE_META_KEY = 'bumang_drive_backup_meta';
const DRIVE_FOLDER_ID_KEY = 'bumang_drive_folder_id';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export interface DriveBackupMeta {
  fileName: string;
  lastBackupAt: string | null;
  lastRestoreAt: string | null;
  sizeBytes: number;
  recordCount: number;
  connected: boolean;
  folderLink?: string;
  folderId?: string;
  accountEmail?: string;
  accountPicture?: string;
  accountName?: string;
}

export interface BackupPayload {
  meta: {
    app: 'Bollywood Umang Studio Manager';
    version: 1;
    exportedAt: string;
    recordCount: number;
    sizeBytes: number;
  };
  data: MockDB;
}

export interface DriveBackupFile {
  id: string;
  name: string;
  modifiedTime: string;
  size: string;
}

function emptyMeta(): DriveBackupMeta {
  return {
    fileName: DRIVE_FILE_NAME,
    lastBackupAt: null,
    lastRestoreAt: null,
    sizeBytes: 0,
    recordCount: 0,
    connected: false,
  };
}

export function readDriveMeta(): DriveBackupMeta {
  try {
    const raw = localStorage.getItem(DRIVE_META_KEY);
    if (raw) return { ...emptyMeta(), ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return emptyMeta();
}

function writeDriveMeta(meta: DriveBackupMeta): void {
  try {
    localStorage.setItem(DRIVE_META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

export function getStoredFolderId(): string {
  try {
    return localStorage.getItem(DRIVE_FOLDER_ID_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setStoredFolderId(id: string): void {
  try {
    localStorage.setItem(DRIVE_FOLDER_ID_KEY, id);
  } catch {
    /* ignore */
  }
}

function countRecords(db: MockDB): number {
  return (
    (db.bookings?.length ?? 0) +
    (db.studio_lab_orders?.length ?? 0) +
    (db.photographer_ledger?.length ?? 0) +
    (db.payments?.length ?? 0) +
    (db.partners?.length ?? 0) +
    (db.direct_transactions?.length ?? 0) +
    (db.studio_settings?.length ?? 0)
  );
}

function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  if (!token) throw new Error('Google account not connected. Sign in first.');
  return { Authorization: `Bearer ${token.access_token}` };
}

function refreshConnectedState(): { connected: boolean; email?: string; picture?: string; name?: string } {
  const token = getStoredToken();
  const profile = getStoredProfile();
  return {
    connected: token !== null,
    email: profile?.email,
    picture: profile?.picture,
    name: profile?.name,
  };
}

export function syncConnectionState(meta: DriveBackupMeta): DriveBackupMeta {
  const state = refreshConnectedState();
  return {
    ...meta,
    connected: state.connected,
    accountEmail: state.email ?? meta.accountEmail,
    accountPicture: state.picture ?? meta.accountPicture,
    accountName: state.name ?? meta.accountName,
  };
}

/**
 * Uploads the master backup JSON to Google Drive using the Drive REST API v3
 * resumable upload. If a file with the same name already exists in the target
 * folder, it is overwritten (patched) instead of creating a duplicate.
 * Falls back to localStorage if no Google token is available.
 */
export async function backupToDrive(): Promise<DriveBackupMeta> {
  const db = loadDB();
  const json = JSON.stringify(db);
  const sizeBytes = new Blob([json]).size;

  const payload: BackupPayload = {
    meta: {
      app: 'Bollywood Umang Studio Manager',
      version: 1,
      exportedAt: new Date().toISOString(),
      recordCount: countRecords(db),
      sizeBytes,
    },
    data: db,
  };

  const payloadJson = JSON.stringify(payload);
  const token = getStoredToken();

  if (token) {
    const folderId = getStoredFolderId();
    const existingFile = await findExistingFile(token.access_token, folderId);

    if (existingFile) {
      await patchFile(token.access_token, existingFile.id, payloadJson);
    } else {
      await createFile(token.access_token, payloadJson, folderId);
    }
  } else {
    await new Promise((r) => setTimeout(r, 800));
    try {
      localStorage.setItem(`drive_${DRIVE_FILE_NAME}`, payloadJson);
    } catch {
      /* ignore */
    }
  }

  const state = refreshConnectedState();
  const meta: DriveBackupMeta = {
    fileName: DRIVE_FILE_NAME,
    lastBackupAt: new Date().toISOString(),
    lastRestoreAt: readDriveMeta().lastRestoreAt,
    sizeBytes,
    recordCount: countRecords(db),
    connected: state.connected,
    folderId: getStoredFolderId() || undefined,
    accountEmail: state.email,
    accountPicture: state.picture,
    accountName: state.name,
  };
  writeDriveMeta(meta);
  return meta;
}

async function findExistingFile(accessToken: string, folderId: string): Promise<DriveBackupFile | null> {
  let q = `name='${DRIVE_FILE_NAME}' and trashed=false`;
  if (folderId) q += ` and '${folderId}' in parents`;
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime,size)&pageSize=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error('Failed to search Google Drive.');
  const data = await res.json();
  return data.files?.[0] ?? null;
}

async function createFile(accessToken: string, content: string, folderId: string): Promise<string> {
  const metadata: Record<string, string> = { name: DRIVE_FILE_NAME, mimeType: 'application/json' };
  if (folderId) metadata.parents = folderId;
  const boundary = 'studio_backup_boundary';
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    'Content-Type: application/json\r\n\r\n' +
    content +
    `\r\n--${boundary}--`;

  const res = await fetch(`${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Drive upload failed: ${errText}`);
  }
  const data = await res.json();
  return data.id;
}

async function patchFile(accessToken: string, fileId: string, content: string): Promise<void> {
  const res = await fetch(`${DRIVE_UPLOAD}/files/${fileId}?uploadType=media&fields=id`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: content,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Drive update failed: ${errText}`);
  }
}

/**
 * Lists existing backup files from the connected Google Drive.
 */
export async function listDriveBackups(): Promise<DriveBackupFile[]> {
  const token = getStoredToken();
  if (!token) return [];

  const folderId = getStoredFolderId();
  let q = `name='${DRIVE_FILE_NAME}' and trashed=false`;
  if (folderId) q += ` and '${folderId}' in parents`;
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime desc&pageSize=10`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!res.ok) throw new Error('Failed to list Drive backups.');
  const data = await res.json();
  return (data.files ?? []) as DriveBackupFile[];
}

/**
 * Reads the master backup file from Google Drive (or localStorage fallback)
 * and restores all core application data.
 */
export async function restoreFromDrive(): Promise<DriveBackupMeta> {
  const token = getStoredToken();
  let payload: BackupPayload | null = null;

  if (token) {
    const file = await findExistingFile(token.access_token, getStoredFolderId());
    if (!file) throw new Error('No backup file found on Google Drive. Run a backup first.');
    const res = await fetch(`${DRIVE_API}/files/${file.id}?alt=media`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!res.ok) throw new Error('Failed to download backup from Google Drive.');
    payload = (await res.json()) as BackupPayload;
  } else {
    await new Promise((r) => setTimeout(r, 800));
    try {
      const raw = localStorage.getItem(`drive_${DRIVE_FILE_NAME}`);
      if (raw) payload = JSON.parse(raw) as BackupPayload;
    } catch {
      /* ignore */
    }
  }

  if (!payload || !payload.data) {
    throw new Error('No master backup file found. Run a backup first.');
  }

  saveDB(payload.data);

  const state = refreshConnectedState();
  const meta: DriveBackupMeta = {
    fileName: DRIVE_FILE_NAME,
    lastBackupAt: readDriveMeta().lastBackupAt,
    lastRestoreAt: new Date().toISOString(),
    sizeBytes: payload.meta.sizeBytes,
    recordCount: countRecords(payload.data),
    connected: state.connected,
    folderId: getStoredFolderId() || undefined,
    accountEmail: state.email,
    accountPicture: state.picture,
    accountName: state.name,
  };
  writeDriveMeta(meta);
  return meta;
}

export function connectDrive(folderLink?: string, accountEmail?: string): DriveBackupMeta {
  const state = refreshConnectedState();
  const meta: DriveBackupMeta = {
    ...readDriveMeta(),
    connected: state.connected || !!accountEmail,
    accountEmail: state.email ?? accountEmail,
    accountPicture: state.picture,
    accountName: state.name,
  };
  if (folderLink !== undefined) meta.folderLink = folderLink;
  writeDriveMeta(meta);
  return meta;
}

export function disconnectDrive(): DriveBackupMeta {
  const meta = { ...readDriveMeta(), connected: false, accountEmail: undefined, accountPicture: undefined, accountName: undefined };
  writeDriveMeta(meta);
  return meta;
}
