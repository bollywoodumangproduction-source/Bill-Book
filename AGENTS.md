# Project-specific boundaries

## Cloudflare R2 and Photo Selection

- Cloudflare R2 is reserved exclusively for Photo Selection image files (gallery and proofing images).
- Do not route any other feature's files, media, or application data to Cloudflare R2.
- Preserve the Photo Selection upload/storage flow and its R2 configuration. Do not modify, refactor, replace, or remove them unless the user explicitly requests that specific change.
- Keep application records and metadata in Supabase; R2 holds only the Photo Selection image binaries.
- Before changes that could affect Photo Selection or R2 indirectly, inspect the affected code and keep the existing boundary intact.
