import { useCallback, useEffect, useState } from 'react';
import {
  Calendar,
  Camera,
  Clock,
  MapPin,
  Sparkles,
  User,
  LogOut,
  KeyRound,
  Eye,
  EyeOff,
  ArrowLeft,
  Lock,
  LogIn,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { EventFunction, Partner } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { inputClass } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { useToast } from '@/context/ToastContext';

const PARTNER_SESSION_KEY = 'bup_partner_session';

function setPartnerSession(partnerId: string) {
  sessionStorage.setItem(PARTNER_SESSION_KEY, partnerId);
}

function getPartnerSession(): string | null {
  return sessionStorage.getItem(PARTNER_SESSION_KEY);
}

function clearPartnerSession() {
  sessionStorage.removeItem(PARTNER_SESSION_KEY);
}

interface CrewBooking {
  id: string;
  client_name: string;
  client_mobile: string;
  event_function: string;
  shoot_date: string;
  shoot_time: string;
  venue: string;
  events: EventFunction[];
  assignments: Array<{ function_name: string; role: string; reporting_time: string }>;
}

export function PartnerDashboard() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [partner, setPartner] = useState<Partner | null>(null);
  const [bookings, setBookings] = useState<CrewBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const loadFromSession = useCallback(async () => {
    const sessionId = getPartnerSession();
    if (!sessionId) return;
    const { data: partnerData } = await supabase.from('partners').select('*').eq('id', sessionId).maybeSingle();
    if (!partnerData) { clearPartnerSession(); return; }
    const p = partnerData as Partner;
    if (!p.is_login_allowed) { clearPartnerSession(); return; }
    setPartner(p);
    await loadBookings(p.id);
  }, []);

  const loadBookings = async (partnerId: string) => {
    const { data: assignmentData } = await supabase.from('shoot_assignments').select('booking_id, function_name, role, reporting_time').eq('partner_id', partnerId);
    const ids = [...new Set((assignmentData ?? []).map((a: { booking_id: string }) => a.booking_id))];
    const { data: bookingData } = ids.length > 0
      ? await supabase.from('bookings').select('id, client_name, client_mobile, event_function, shoot_date, shoot_time, venue, events').in('id', ids).order('shoot_date')
      : { data: [] };
    const assignmentsByBooking = new Map<string, CrewBooking['assignments']>();
    (assignmentData ?? []).forEach((a: { booking_id: string; function_name: string; role: string; reporting_time: string }) => {
      const current = assignmentsByBooking.get(a.booking_id) ?? [];
      current.push({ function_name: a.function_name, role: a.role, reporting_time: a.reporting_time });
      assignmentsByBooking.set(a.booking_id, current);
    });
    setBookings(((bookingData ?? []) as Omit<CrewBooking, 'assignments'>[]).map((b) => ({ ...b, assignments: assignmentsByBooking.get(b.id) ?? [] })));
  };

  useEffect(() => { loadFromSession(); }, [loadFromSession]);

  const signIn = async () => {
    if (!mobile || !password) { toast('Enter both mobile number and password', 'error'); return; }
    setLoading(true);
    setError('');
    const { data: partnerData } = await supabase.from('partners').select('*').eq('mobile', mobile.trim()).maybeSingle();
    if (!partnerData) {
      setError('No staff profile found for this mobile number.');
      setLoading(false);
      return;
    }
    const p = partnerData as Partner;
    if (!p.is_login_allowed) {
      setError('Login access is currently disabled for your account. Please contact studio admin.');
      setLoading(false);
      return;
    }
    const storedPwd = p.portal_password ?? '';
    if (!storedPwd || password !== storedPwd) {
      setError('Incorrect password. Please try again or contact the studio.');
      setLoading(false);
      return;
    }
    setPartnerSession(p.id);
    setPartner(p);
    await loadBookings(p.id);
    setLoading(false);
  };

  const handleLogout = () => {
    clearPartnerSession();
    setPartner(null);
    setBookings([]);
    navigate('/');
  };

  if (!partner) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="w-full max-w-md rounded-xl border border-white/10 bg-slate-900 p-6">
          <Link to="/" className="mb-4 flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to home
          </Link>
          <div className="mb-5 flex items-center gap-2"><User className="h-5 w-5 text-amber-400" /><h1 className="text-lg font-semibold">Crew Portal</h1></div>
          <p className="mb-4 text-sm text-slate-400">Sign in with your registered mobile number and password to view operational duties.</p>
          <div className="space-y-3">
            <input value={mobile} onChange={(e) => setMobile(e.target.value)} className={inputClass} placeholder="Registered mobile number" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') signIn(); }} className={inputClass} placeholder="Password" />
            <p className="text-xs text-slate-500">First time? Your password is your registered mobile number.</p>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <button onClick={signIn} disabled={loading || !mobile.trim() || !password} className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">
              {loading ? <Sparkles className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {loading ? 'Loading...' : 'Sign In'}
            </button>
          </div>
          <div className="mt-5 flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <Lock className="h-3 w-3" /><span>Access is controlled by the studio admin</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-white">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs text-amber-400">Crew Portal</p>
            <h1 className="text-xl font-bold">Welcome, {partner.name}</h1>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </header>

        <div className="rounded-xl border border-white/10 bg-slate-900 p-4">
          <button
            onClick={() => setShowPasswordModal(true)}
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
          >
            <KeyRound className="h-3.5 w-3.5" /> Change Password
          </button>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-900 p-5">
          <h2 className="mb-3 text-sm font-semibold">Assigned Duties</h2>
          {bookings.length === 0 ? <p className="text-sm text-slate-400">No assigned duties yet.</p> : <div className="space-y-3">{bookings.map((booking) => { const events = booking.events ?? []; return <div key={booking.id} className="rounded-lg border border-white/10 bg-white/5 p-4"><p className="font-medium">{booking.client_name}</p><div className="mt-2 space-y-1 text-xs text-slate-300"><p className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-amber-400" /> {formatDate(booking.shoot_date)} · {booking.event_function}</p><p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-amber-400" /> {booking.venue || 'Venue to be confirmed'}</p></div><div className="mt-3 border-t border-white/10 pt-3 text-xs text-slate-400">{booking.assignments.map((assignment, index) => <p key={index} className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-amber-400" /> {assignment.function_name} · {assignment.role} · Report {assignment.reporting_time || 'time pending'}</p>)}{events.length > 0 && events.map((event, index) => <p key={`event-${index}`}>{event.name} · {event.date ? formatDate(event.date) : 'Date pending'} · {event.start_time ?? event.time ?? 'Time pending'}</p>)}</div></div>; })}</div>}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-slate-500"><Camera className="h-3.5 w-3.5" /> Operational schedule only. Billing and client package amounts are private.</p>
      </div>

      <PartnerChangePasswordModal
        open={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        partner={partner}
        onUpdated={(updated) => setPartner(updated)}
      />
    </div>
  );
}

function PartnerChangePasswordModal({ open, onClose, partner, onUpdated }: { open: boolean; onClose: () => void; partner: Partner; onUpdated: (p: Partner) => void }) {
  const { toast } = useToast();
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!currentPwd || !newPwd || !confirmPwd) { toast('Please fill all fields', 'error'); return; }
    const storedPwd = partner.portal_password ?? '';
    if (currentPwd !== storedPwd) { toast('Current password is incorrect', 'error'); return; }
    if (newPwd.length < 6) { toast('New password must be at least 6 characters', 'error'); return; }
    if (newPwd !== confirmPwd) { toast('New passwords do not match', 'error'); return; }
    setSaving(true);
    const { data, error } = await supabase.from('partners').update({ portal_password: newPwd, password_changed: true }).eq('id', partner.id).select().single();
    setSaving(false);
    if (error || !data) {
      toast('Failed to change password. Please try again.', 'error');
      return;
    }
    onUpdated(data as Partner);
    toast('Password updated successfully!', 'success');
    setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Change Password" size="sm" dismissible={false}>
      <div className="space-y-4">
        <Field label="Current Password">
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              className={inputClass}
              placeholder="Enter current password"
            />
            <button onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-500">
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <Field label="New Password">
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              className={inputClass}
              placeholder="Enter new password (min 6 characters)"
            />
            <button onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-500">
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <Field label="Confirm New Password">
          <input
            type={showNew ? 'text' : 'password'}
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            className={inputClass}
            placeholder="Re-enter new password"
          />
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:from-amber-400 hover:to-orange-400 disabled:opacity-50"
          >
            {saving ? <Sparkles className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {saving ? 'Saving...' : 'Update Password'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
