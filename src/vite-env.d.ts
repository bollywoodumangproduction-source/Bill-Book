/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_R2_UPLOAD_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'html2pdf.js' {
	const html2pdf: unknown;
	export default html2pdf;
}
