import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY
  || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
)?.trim();

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Keep the app renderable when local environment variables are not configured,
// but never fall back to demo or localStorage data. Requests will fail clearly
// until the public project URL and anon/publishable key are supplied.
export const supabase = createClient(
  supabaseUrl || 'https://not-configured.supabase.co',
  supabaseAnonKey || 'not-configured-anon-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  },
);

export function getSupabaseConfigurationError(): string | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    return 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the local environment and Vercel project settings.';
  }
  return null;
}
