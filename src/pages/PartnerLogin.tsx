import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Sparkles, Lock } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase';
import type { Partner } from '@/lib/types';
import { inputClass } from '@/components/ui/Field';
import { cleanPartnerPhone, setPartnerSession } from '@/pages/PartnerDashboard';

export function PartnerLogin() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const signIn = async () => {
    if (!mobile.trim()) {
      setError('Enter your registered mobile number');
      return;
    }

    setLoading(true);
    setError('');
    const registeredPartners = (settings as any)?.partners || [];
    const clean = (num: string) => (num || '').replace(/\D/g, '').slice(-10);
    const enteredPhoneClean = clean(mobile);
    let matchedPartner = registeredPartners.find((candidate: any) =>
      clean(candidate.phone || candidate.mobile) === enteredPhoneClean,
    ) as Partner | undefined;

    if (!matchedPartner) {
      const { data: partnerData } = await supabase.from('partners').select('*');
      matchedPartner = ((partnerData ?? []) as Partner[]).find((candidate) => enteredPhoneClean === cleanPartnerPhone(candidate.mobile));
    }

    if (!matchedPartner) {
      setError('No staff profile found for this mobile number.');
      setLoading(false);
      return;
    }

    const partner = matchedPartner;
    if (partner.status && partner.status !== 'Active') {
      setError('Login access is currently disabled for this partner. Please contact studio admin.');
      setLoading(false);
      return;
    }

    setPartnerSession(partner);
    localStorage.setItem('partnerAuth', JSON.stringify(matchedPartner));
    localStorage.setItem('partnerPhone', (matchedPartner as Partner & { phone?: string }).phone || matchedPartner.mobile);
    setLoading(false);
    navigate('/partner/dashboard');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 px-4 text-white">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-cyan-500/20 bg-slate-900 p-8 shadow-2xl shadow-cyan-950/30">
          <div className="mb-6 flex flex-col items-center text-center">
            {settings?.films_logo_url ? (
              <img src={settings.films_logo_url} alt="logo" className="h-14 w-14 rounded-lg object-cover ring-1 ring-cyan-400/30" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-sky-600">
                <Sparkles className="h-7 w-7 text-white" />
              </div>
            )}
            <h1 className="mt-3 text-xl font-bold text-white">Partner / Lab Portal</h1>
            <p className="text-sm text-slate-400">Sign in to view crew assignments, lab orders, and partner operations</p>
          </div>

          <form onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void signIn(); }} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Registered Mobile Number</label>
              <input
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void signIn(); }}
                className={`${inputClass} border-cyan-500/20 bg-slate-800 text-white placeholder-slate-500`}
                placeholder="+91 98765 43210"
              />
            </div>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <button
              type="submit"
              disabled={loading || !mobile.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-sky-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:from-cyan-400 hover:to-sky-400 disabled:opacity-50"
            >
              {loading ? <Sparkles className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-5 flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <Lock className="h-3 w-3" />
            <span>Partner and Lab access is controlled by the studio admin</span>
          </div>
        </div>
      </div>
    </div>
  );
}
