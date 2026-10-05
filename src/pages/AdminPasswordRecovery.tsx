import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, ShieldCheck, Sparkles } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { useToast } from '@/context/ToastContext';
import { inputClass } from '@/components/ui/Field';
import { supabase } from '@/lib/supabase';

export function AdminPasswordRecovery() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const checkAdmin = (session: Session | null) => {
      const isAdmin = session?.user.app_metadata?.role === 'admin';
      if (active && isAdmin) {
        setAuthorized(true);
        setChecking(false);
      } else if (active) {
        setAuthorized(false);
        setChecking(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        checkAdmin(session);
      }
    });
    void supabase.auth.getSession().then(({ data }) => checkAdmin(data.session));
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const updatePassword = async () => {
    if (password.length < 8) { toast('Password kam se kam 8 characters ka rakhein.', 'error'); return; }
    if (password !== confirmPassword) { toast('Dono password match nahi kar rahe.', 'error'); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) { toast(error.message || 'Password update nahi ho saka.', 'error'); return; }
    await supabase.auth.signOut();
    toast('Admin password update ho gaya. Ab naye password se login karein.', 'success');
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 px-4">
      <div className="w-full max-w-md">
        <Link to="/admin/login" className="mb-6 flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-4 w-4" /> Back to admin login
        </Link>
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-8 text-white shadow-xl">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500">
              <ShieldCheck className="h-7 w-7 text-slate-900" />
            </div>
            <h1 className="mt-3 text-xl font-bold">Reset Admin Password</h1>
            <p className="text-sm text-slate-400">Email link se verify karke naya password set karein.</p>
          </div>
          {checking ? (
            <p className="py-4 text-center text-sm text-slate-400">Recovery link check ho raha hai…</p>
          ) : !authorized ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-rose-300">Valid admin recovery link nahi mila. Login page se naya reset link mangayein.</p>
              <Link to="/admin/login" className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950">
                <ArrowLeft className="h-4 w-4" /> Admin Login
              </Link>
            </div>
          ) : (
            <form onSubmit={(event) => { event.preventDefault(); void updatePassword(); }} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">New password</label>
                <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className={`${inputClass} border-white/10 bg-slate-800 text-white placeholder-slate-500`} placeholder="At least 8 characters" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Confirm new password</label>
                <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={`${inputClass} border-white/10 bg-slate-800 text-white placeholder-slate-500`} placeholder="Enter it again" />
              </div>
              <button type="submit" disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-medium text-slate-900 disabled:opacity-50">
                {saving ? <Sparkles className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                {saving ? 'Updating…' : 'Save new password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
