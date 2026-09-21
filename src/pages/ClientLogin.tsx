import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Sparkles, Lock } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase';
import type { Booking, StudioLabOrder } from '@/lib/types';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { formatPhone } from '@/lib/format';

const CLIENT_SESSION_KEY = 'buf_client_session';
const LEGACY_CLIENT_SESSION_KEY = 'bup_client_session';

export function setClientSession(record: Record<string, any>) {
  localStorage.setItem(CLIENT_SESSION_KEY, JSON.stringify(record));
}

export function setLabClientSession(order: Record<string, any>) {
  localStorage.setItem(CLIENT_SESSION_KEY, JSON.stringify(order));
}

export function getClientSession(): Record<string, any> | null {
  const raw = localStorage.getItem(CLIENT_SESSION_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // ignore malformed session data and fall through to migration logic
    }
  }

  const legacy = sessionStorage.getItem(LEGACY_CLIENT_SESSION_KEY);
  if (legacy) {
    const migrated = legacy.startsWith('lab:')
      ? { id: legacy.slice('lab:'.length), __lab_session: true }
      : { id: legacy };
    localStorage.setItem(CLIENT_SESSION_KEY, JSON.stringify(migrated));
    sessionStorage.removeItem(LEGACY_CLIENT_SESSION_KEY);
    return migrated;
  }

  return null;
}

export function isLabSession(session: Record<string, any> | null): boolean {
  return !!session && (Boolean((session as any).__lab_session) || Boolean((session as any).order_no) || Boolean((session as any).work_type));
}

export function getLabSessionId(session: Record<string, any> | null): string | null {
  if (!session || !isLabSession(session)) return null;
  return typeof (session as any).id === 'string' ? (session as any).id : null;
}

export function clearClientSession() {
  localStorage.removeItem(CLIENT_SESSION_KEY);
  sessionStorage.removeItem(LEGACY_CLIENT_SESSION_KEY);
}

export function ClientLogin() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!mobile.trim()) { toast('Enter your mobile number or booking reference', 'error'); return; }
    setLoading(true);
    const normalizedInput = mobile.trim().toLowerCase();
    const cleanMobile = formatPhone(mobile);

    // 1. Check bookings table (end-client bookings)
    const { data: bookingData } = await supabase.from('bookings').select('*');
    const bookingMatch = ((bookingData ?? []) as Booking[]).find(
      (b) =>
        formatPhone(b.client_mobile) === cleanMobile ||
        (b.booking_no ?? '').toLowerCase() === normalizedInput ||
        (b.id ?? '').toLowerCase() === normalizedInput,
    );

    if (bookingMatch) {
      if (!bookingMatch.is_login_allowed) {
        setLoading(false);
        toast('Login access is currently disabled for your account. Please contact studio admin.', 'error');
        return;
      }
      setClientSession(bookingMatch);
      setLoading(false);
      navigate('/client/dashboard');
      return;
    }

    // 2. Check studio_lab_orders table (lab partner orders)
    const { data: labData } = await supabase.from('studio_lab_orders').select('*');
    const labMatch = ((labData ?? []) as StudioLabOrder[]).find(
      (o) =>
        formatPhone(o.studio_mobile) === cleanMobile ||
        (o.order_no ?? '').toLowerCase() === normalizedInput ||
        (o.id ?? '').toLowerCase() === normalizedInput,
    );

    setLoading(false);

    if (!labMatch) {
      toast('No account found with that mobile number or booking reference', 'error');
      return;
    }
    if (!labMatch.is_login_allowed) {
      toast('Login access is currently disabled for your account. Please contact studio admin.', 'error');
      return;
    }
    setLabClientSession({ ...labMatch, __lab_session: true });
    navigate('/client/dashboard');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-amber-50 px-4 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md">
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
            <p className="text-sm text-slate-500 dark:text-slate-400">Sign in to view your booking or order details</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Mobile Number</label>
              <PhoneInput value={mobile} onChange={setMobile} />
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
