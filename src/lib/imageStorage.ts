import { supabase } from '@/lib/supabase';

/**
 * Cloudflare R2 upload adapter. The browser only receives a short-lived
 * signed upload URL from the trusted API; bucket credentials must never be
 * added to VITE_* variables or shipped to the browser.
 *
 * Expected API contract:
 * POST {fileName, contentType, purpose} ->
 *   { uploadUrl, publicUrl, method?: "PUT", headers?: Record<string,string> }
 */
export interface UploadedImageAsset {
  publicUrl: string;
  previewUrl: string;
}

export interface ImageUploadContext {
  sessionId?: string;
  folder?: string;
}

export async function uploadImageAsset(file: File, purpose: string, context: ImageUploadContext = {}): Promise<UploadedImageAsset> {
  const endpoint = import.meta.env.VITE_R2_UPLOAD_API_URL?.trim();
  if (!endpoint) {
    throw new Error('Cloudflare R2 upload API is not configured yet. The image was not uploaded.');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file.');
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token || session.user.app_metadata?.role !== 'admin') {
    throw new Error('Administrator sign-in is required to upload images.');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size, purpose, ...context }),
  });
  if (!response.ok) {
    throw new Error('Could not prepare the secure image upload. Try again later.');
  }

  const signed = await response.json() as {
    uploadUrl?: string;
    publicUrl?: string;
    previewUrl?: string;
    method?: string;
    headers?: Record<string, string>;
  };
  if (!signed.uploadUrl || !signed.publicUrl) {
    throw new Error('The upload API returned an invalid response.');
  }

  const upload = await fetch(signed.uploadUrl, {
    method: signed.method || 'PUT',
    headers: { 'Content-Type': file.type, ...(signed.headers || {}) },
    body: file,
  });
  if (!upload.ok) {
    throw new Error('Cloudflare R2 did not accept the image. Try again.');
  }
  return { publicUrl: signed.publicUrl, previewUrl: signed.previewUrl || signed.publicUrl };
}

export async function uploadImage(file: File, purpose: string, context: ImageUploadContext = {}): Promise<string> {
  const uploaded = await uploadImageAsset(file, purpose, context);
  return uploaded.publicUrl;
}

/** Studio logos and stamps live in the Supabase Storage branding bucket. */
export async function uploadBrandingImage(file: File): Promise<string> {
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  if (!allowedTypes.has(file.type)) throw new Error('Choose a JPG, PNG, WebP, or GIF image.');
  if (file.size > 2 * 1024 * 1024) throw new Error('Branding images must be 2 MB or smaller.');
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
  const path = `${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from('studio-branding').upload(path, file, {
    cacheControl: '31536000',
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message || 'Could not upload the studio image to Supabase Storage.');
  const { data } = supabase.storage.from('studio-branding').getPublicUrl(path);
  return data.publicUrl;
}
