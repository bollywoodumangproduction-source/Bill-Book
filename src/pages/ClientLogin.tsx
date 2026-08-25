import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, Sparkles, ArrowLeft, Lock } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase';
import type { Booking } from '@/lib/types';
import { inputClass } from '@/components/ui/Field';

const CLIENT_SESSION_KEY = 'bup_client_session';

export function setClientSession(bookingId: string) {
  sessionStorage.setItem(CLIENT_SESSION_KEY, bookingId);
}

export function getClientSession(): string | null {
  return sessionStorage.getItem(CLIENT_SESSION_KEY);
}

export function clearClientSession() {
  sessionStorage.removeItem(CLIENT_SESSION_KEY);
}

export function ClientLogin() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!mobile || !password) { toast('Enter both mobile number and password', 'error'); return; }
    setLoading(true);
    const cleanMobile = mobile.replace(/\D/g, '');
    const cleanPassword = password.replace(/\D/g, '');
    const { data } = await supabase.from('bookings').select('*');
    const match = ((data ?? []) as Booking[]).find(
      (b) => b.client_mobile.replace(/\D/g, '') === cleanMobile,
    );
    setLoading(false);
    if (!match) {
      toast('No account found with that mobile number', 'error');
      return;
    }
    if (!match.is_login_allowed) {
      toast('Login access is currently disabled for your account. Please contact studio admin.', 'error');
      return;
    }
    const storedPwd = (match.client_password ?? '').replace(/\D/g, '');
    if (!storedPwd || cleanPassword !== storedPwd) {
      toast('Incorrect password. Please try again or contact the studio.', 'error');
      return;
    }
    setClientSession(match.id);
    navigate('/client/dashboard');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-amber-50 px-4 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-white/10 dark:bg-slate-900">
          <div className="mb-6 flex flex-col items-center text-center">
            {settings?.films_logo_url ? (
              <img src={settings.films_logo_url} alt="logo" className="h-14 w-14 rounded-lg object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500">
                <Sparkles className="h-7 w-7 text-slate-900" />
              </div>
            )}
            <h1 className="mt-3 text-xl font-bold text-slate-900 dark:text-white">Client Portal</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Sign in to view your booking details</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Mobile Number</label>
              <input
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className={inputClass}
                placeholder="+91 ..."
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
                className={inputClass}
                placeholder="Default: your mobile number"
              />
              <p className="mt-1 text-xs text-slate-400">First time? Your password is your registered mobile number.</p>
            </div>
            <button
              onClick={handleLogin}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-medium text-slate-900 transition-colors hover:from-amber-400 hover:to-orange-400 disabled:opacity-50"
            >
              {loading ? <Sparkles className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </div>

          <div className="mt-5 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <Lock className="h-3 w-3" />
            <span>Access is controlled by the studio admin</span>
          </div>
        </div>
      </div>
    </div>
  );
}
