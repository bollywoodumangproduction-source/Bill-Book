import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, Sparkles, ArrowLeft, ShieldCheck, Mail } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { inputClass } from '@/components/ui/Field';
import { supabase, supabaseConfigured, getSupabaseConfigurationError } from '@/lib/supabase';

const ADMIN_SESSION_KEY = 'bup_admin_session';

export function setAdminSession() {
  sessionStorage.setItem(ADMIN_SESSION_KEY, 'true');
}

export function getAdminSession(): boolean {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true';
}

export function clearAdminSession() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  void supabase.auth.signOut();
}

export function AdminLogin() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingRecovery, setSendingRecovery] = useState(false);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (alive && data.user?.app_metadata?.role === 'admin') navigate('/', { replace: true });
    });
    return () => { alive = false; };
  }, [navigate]);

  const handleLogin = async () => {
    if (!email.trim() || !password) { toast('Enter your admin email and password.', 'error'); return; }
    const configError = getSupabaseConfigurationError();
    if (configError) { toast(configError, 'error'); return; }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user || data.user.app_metadata?.role !== 'admin') {
      await supabase.auth.signOut();
      setLoading(false);
      toast(error ? 'Sign-in failed. Check your email and password.' : 'This Supabase account is not set up as an administrator.', 'error');
      return;
    }
    setAdminSession();
    setLoading(false);
    navigate('/', { replace: true });
  };

  const sendPasswordRecovery = async () => {
    if (!email.trim()) { toast('Pehle admin email likhein.', 'error'); return; }
    const configError = getSupabaseConfigurationError();
    if (configError) { toast(configError, 'error'); return; }
    setSendingRecovery(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/admin/reset-password`,
    });
    setSendingRecovery(false);
    if (error) { toast(error.message || 'Recovery email nahi bheja ja saka.', 'error'); return; }
    toast('Agar is email par admin account hai, password reset link bhej diya gaya hai.', 'success');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        <div className="rounded-2xl border border-white/10 bg-slate-900 p-8 shadow-xl">
          <div className="mb-6 flex flex-col items-center text-center">
            {settings?.films_logo_url ? (
              <img src={settings.films_logo_url} alt="logo" className="h-14 w-14 rounded-lg object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500">
                <ShieldCheck className="h-7 w-7 text-slate-900" />
              </div>
            )}
            <h1 className="mt-3 text-xl font-bold text-white">Admin Login</h1>
            <p className="text-sm text-slate-400">Sign in with the admin account configured in Supabase</p>
          </div>

          <form onSubmit={(event) => { event.preventDefault(); void handleLogin(); }} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Admin Email</label>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={`${inputClass} border-white/10 bg-slate-800 text-white placeholder-slate-500`}
                placeholder="admin@example.com"
              />
              <button
                type="button"
                onClick={() => void sendPasswordRecovery()}
                disabled={sendingRecovery || !supabaseConfigured}
                className="mt-2 text-xs font-medium text-amber-400 hover:text-amber-300 disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{sendingRecovery ? 'Sending reset link…' : 'Forgot password? Email me a reset link'}</span>
              </button>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${inputClass} border-white/10 bg-slate-800 text-white placeholder-slate-500`}
                placeholder="Enter admin password"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !supabaseConfigured}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-medium text-slate-900 transition-colors hover:from-amber-400 hover:to-orange-400 disabled:opacity-50"
            >
              {loading ? <Sparkles className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {loading ? 'Authenticating…' : 'Sign In to Dashboard'}
            </button>
          </form>
          <p className="mt-5 text-center text-xs text-slate-500">Admin access is verified by Supabase Auth and database RLS.</p>
        </div>
      </div>
    </div>
  );
}
