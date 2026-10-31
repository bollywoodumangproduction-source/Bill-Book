# Photo Selection R2 upload signer

This Worker is only for Photo Selection originals and proof sheets. It checks a Supabase Auth JWT, requires the `admin` app-metadata role, verifies that the Photo Selection session exists, and issues a five-minute signed PUT URL into the `photo-selection` bucket. Application records remain in Supabase.

## Before deploying

1. Replace `SUPABASE_URL` in `wrangler.toml` with this app's Supabase project URL.
2. Create a Cloudflare R2 API token with **Object Read & Write** scoped to only the `photo-selection` bucket. Add its Access Key ID and Secret as Worker secrets named `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.
3. Add the Supabase anon/publishable key as the Worker secret `SUPABASE_ANON_KEY`.
4. Set the same exact app origins in the Worker `ALLOWED_ORIGINS` variable and the R2 bucket CORS policy. The current production origin is `https://bollywood-umang.vercel.app`; add localhost only for local development.
5. Deploy with Wrangler, then set the deployed endpoint in Vercel as `VITE_R2_UPLOAD_API_URL` and redeploy the app.

Do not expose R2 credentials through `VITE_*` variables or commit them. The bucket's existing Public Development URL is used only for reading gallery images; it is not the signed upload endpoint and is rate-limited for production use.

## Local deployment

```sh
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npx wrangler deploy
```

Do not run `wrangler deploy` until the placeholder Supabase project URL is replaced and the exact R2 origins and credentials have been configured.
