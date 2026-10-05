# Cloudflare R2 upload API contract

The browser upload adapter posts this JSON to `VITE_R2_UPLOAD_API_URL`:

```json
{
  "fileName": "photo.jpg",
  "contentType": "image/jpeg",
  "fileSize": 1834920,
  "purpose": "photo-selection",
  "sessionId": "45e0128a-3b91-4ea7-b0d2-382478b80105",
  "folder": "Ceremony"
}
```

The browser sends the current Supabase Auth access token as `Authorization: Bearer <token>`. The trusted API must validate that JWT against this Supabase project, require `app_metadata.role = admin`, allow only `photo-selection` and `photo-selection-proof` purposes, require a valid existing `sessionId`, sanitize the optional folder, validate that `fileSize` is positive and below the configured upload limit, allow-list image MIME types, generate a unique object key under that session, and return a short-lived presigned PUT URL. Never trust a user ID or role supplied in the JSON body. The current UI uploads from the admin Photo Selection screen, so the signer should reject requests without a valid admin session.

```json
{
  "uploadUrl": "https://...short-lived-signed-put-url...",
  "publicUrl": "https://...the-image-url...",
  "previewUrl": "https://...thumbnail-or-resized-image-url...",
  "method": "PUT",
  "headers": { "Content-Type": "image/jpeg" }
}
```

The web app uploads photo-selection originals to `uploadUrl`; it stores photo URLs and selection metadata in Supabase, not photo bytes. Gallery records keep `publicUrl` as the original and `previewUrl` as the grid thumbnail. For fast scrolling, have the signer return a resized WebP/JPEG thumbnail URL (Cloudflare Images or a Worker-generated thumbnail) and serve the original only when the client opens a photo. The gallery lazy-loads images and appends 120 items as the user scrolls; uploads run with at most four concurrent files.

Studio logo and stamp files are a separate case: they upload to the public Supabase Storage bucket `studio-branding` created by the security migration. The bucket permits JPG, PNG, WebP, and GIF up to 2 MB; only an admin Auth session can upload, replace, or delete branding images. Do not send these files to R2.

Configure the signer API's CORS to allow the app origins, `POST`, and the `Authorization` and `Content-Type` request headers. Separately configure R2 bucket CORS for the app origins and signed `PUT` uploads with `Content-Type`. Keep R2 account identifiers and access keys in the trusted signer environment, never in a `VITE_` variable. Without this API the app intentionally reports that uploads are not configured; it does not fall back to browser localStorage or base64 data URLs.
