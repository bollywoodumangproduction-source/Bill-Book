import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { StudioSettings } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';
import { Field, inputClass } from '@/components/ui/Field';

export function MasterPinDialog({ open, settings, onClose, onVerified }: { open: boolean; settings: StudioSettings | null; onClose: () => void; onVerified: () => void }) {
  const [pin, setPin] = useState('');
  const [recovery, setRecovery] = useState('');
  const [error, setError] = useState('');

  const verify = () => {
    if (settings?.master_pin && pin === settings.master_pin) {
      setPin(''); setRecovery(''); setError(''); onVerified(); return;
    }
    const registered = [settings?.email, settings?.phone, settings?.whatsapp_number].filter(Boolean).map((value) => value!.replace(/\s/g, '').toLowerCase());
    if (recovery && registered.includes(recovery.replace(/\s/g, '').toLowerCase())) {
      setPin(''); setRecovery(''); setError(''); onVerified(); return;
    }
    setError(settings?.master_pin ? 'Incorrect PIN or recovery credential.' : 'Set a Master PIN in Settings before using sensitive actions.');
  };

  return <Modal open={open} onClose={onClose} title="Master PIN Verification" size="sm" dismissible={false}>
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200"><ShieldCheck className="h-4 w-4 shrink-0" /> This action requires administrator verification.</div>
      <Field label="Master PIN"><input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} className={inputClass} placeholder="4 to 6 digits" /></Field>
      <Field label="Emergency Recovery: registered email or mobile"><input value={recovery} onChange={(event) => setRecovery(event.target.value)} className={inputClass} placeholder="Admin email or mobile" /></Field>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <div className="flex justify-end gap-3"><button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-white/10 dark:text-slate-300">Cancel</button><button onClick={verify} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950">Verify</button></div>
    </div>
  </Modal>;
}
