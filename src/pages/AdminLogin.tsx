import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, Sparkles, ArrowLeft, Lock, Mail, KeyRound, ShieldCheck } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { inputClass } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';

const ADMIN_SESSION_KEY = 'bup_admin_session';
const ADMIN_MASTER_PASSWORD = 'admin123';

export function setAdminSession() {
  sessionStorage.setItem(ADMIN_SESSION_KEY, 'true');
}

export function getAdminSession(): boolean {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true';
}

export function clearAdminSession() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
}

export function AdminLogin() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);

  const handleLogin = () => {
    if (!password) { toast('Enter the admin password', 'error'); return; }
    setLoading(true);
    setTimeout(() => {
      if (password === ADMIN_MASTER_PASSWORD) {
        setAdminSession();
        setLoading(false);
        navigate('/');
      } else {
        setLoading(false);
        toast('Incorrect admin password', 'error');
      }
    }, 400);
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
            <p className="text-sm text-slate-400">Enter your master password to access the dashboard</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Master Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
                className={`${inputClass} border-white/10 bg-slate-800 text-white placeholder-slate-500`}
                placeholder="••••••••"
              />
            </div>
            <button
              onClick={handleLogin}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-medium text-slate-900 transition-colors hover:from-amber-400 hover:to-orange-400 disabled:opacity-50"
            >
              {loading ? <Sparkles className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {loading ? 'Authenticating...' : 'Sign In to Dashboard'}
            </button>
          </div>

          <div className="mt-5 flex items-center justify-center">
            <button
              onClick={() => setShowRecovery(true)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-400"
            >
              <KeyRound className="h-3 w-3" /> Forgot password? Recover access
            </button>
          </div>
        </div>
      </div>

      <RecoveryModal open={showRecovery} onClose={() => setShowRecovery(false)} settings={settings} />
    </div>
  );
}

function RecoveryModal({ open, onClose, settings }: { open: boolean; onClose: () => void; settings: any }) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [sent, setSent] = useState(false);

  const handleRecover = () => {
    if (!email && !mobile) { toast('Enter your registered email or mobile number', 'error'); return; }
    const studioEmail = settings?.email ?? '';
    const studioPhone = settings?.phone ?? '';
    const emailMatch = email && studioEmail && email.toLowerCase() === studioEmail.toLowerCase();
    const mobileMatch = mobile && studioPhone && mobile.replace(/\D/g, '') === studioPhone.replace(/\D/g, '');
    if (!emailMatch && !mobileMatch) {
      toast('The details do not match our records. Please contact support.', 'error');
      return;
    }
    setSent(true);
    toast('Recovery instructions sent to your registered contact', 'success');
  };

  return (
    <Modal open={open} onClose={onClose} title="Recover Admin Access" size="sm">
      {sent ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/10">
            <Mail className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Recovery instructions have been sent to your registered email and mobile number.
            Please check your inbox and follow the steps to reset your master password.
          </p>
          <button onClick={onClose} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-amber-400">
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Enter your registered studio email or mobile number to receive password recovery instructions.
          </p>
          <Field label="Registered Email">
            <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="studio@example.com" />
          </Field>
          <Field label="Registered Mobile">
            <input value={mobile} onChange={(e) => setMobile(e.target.value)} className={inputClass} placeholder="+91 ..." />
          </Field>
          <button
            onClick={handleRecover}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:from-amber-400 hover:to-orange-400"
          >
            <Mail className="h-4 w-4" /> Send Recovery Instructions
          </button>
        </div>
      )}
    </Modal>
  );
}
