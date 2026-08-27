import { useState } from 'react';
import { Calendar, Camera, Clock, MapPin, Sparkles, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { EventFunction, Partner } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { inputClass } from '@/components/ui/Field';

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
  const [mobile, setMobile] = useState('');
  const [partner, setPartner] = useState<Partner | null>(null);
  const [bookings, setBookings] = useState<CrewBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const signIn = async () => {
    setLoading(true);
    setError('');
    const { data: partnerData } = await supabase.from('partners').select('*').eq('mobile', mobile.trim()).maybeSingle();
    if (!partnerData) {
      setError('No staff profile found for this mobile number.');
      setLoading(false);
      return;
    }
    const staff = partnerData as Partner;
    const { data: assignmentData } = await supabase.from('shoot_assignments').select('booking_id, function_name, role, reporting_time').eq('partner_id', staff.id);
    const ids = [...new Set((assignmentData ?? []).map((assignment: { booking_id: string }) => assignment.booking_id))];
    const { data: bookingData } = ids.length > 0
      ? await supabase.from('bookings').select('id, client_name, client_mobile, event_function, shoot_date, shoot_time, venue, events').in('id', ids).order('shoot_date')
      : { data: [] };
    const assignmentsByBooking = new Map<string, CrewBooking['assignments']>();
    (assignmentData ?? []).forEach((assignment: { booking_id: string; function_name: string; role: string; reporting_time: string }) => {
      const current = assignmentsByBooking.get(assignment.booking_id) ?? [];
      current.push({ function_name: assignment.function_name, role: assignment.role, reporting_time: assignment.reporting_time });
      assignmentsByBooking.set(assignment.booking_id, current);
    });
    setPartner(staff);
    setBookings(((bookingData ?? []) as Omit<CrewBooking, 'assignments'>[]).map((booking) => ({ ...booking, assignments: assignmentsByBooking.get(booking.id) ?? [] })));
    setLoading(false);
  };

  if (!partner) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="w-full max-w-md rounded-xl border border-white/10 bg-slate-900 p-6">
          <div className="mb-5 flex items-center gap-2"><User className="h-5 w-5 text-amber-400" /><h1 className="text-lg font-semibold">Crew Portal</h1></div>
          <p className="mb-4 text-sm text-slate-400">Sign in with your registered mobile number to view operational duties.</p>
          <input value={mobile} onChange={(event) => setMobile(event.target.value)} className={inputClass} placeholder="Registered mobile number" />
          {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
          <button onClick={signIn} disabled={loading || !mobile.trim()} className="mt-4 w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{loading ? 'Loading...' : 'View Duties'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-white">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-center justify-between"><div><p className="text-xs text-amber-400">Crew Portal</p><h1 className="text-xl font-bold">Welcome, {partner.name}</h1></div><button onClick={() => { setPartner(null); setBookings([]); }} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300">Sign out</button></header>
        <div className="rounded-xl border border-white/10 bg-slate-900 p-5">
          <h2 className="mb-3 text-sm font-semibold">Assigned Duties</h2>
          {bookings.length === 0 ? <p className="text-sm text-slate-400">No assigned duties yet.</p> : <div className="space-y-3">{bookings.map((booking) => { const events = booking.events ?? []; return <div key={booking.id} className="rounded-lg border border-white/10 bg-white/5 p-4"><p className="font-medium">{booking.client_name}</p><div className="mt-2 space-y-1 text-xs text-slate-300"><p className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-amber-400" /> {formatDate(booking.shoot_date)} · {booking.event_function}</p><p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-amber-400" /> {booking.venue || 'Venue to be confirmed'}</p></div><div className="mt-3 border-t border-white/10 pt-3 text-xs text-slate-400">{booking.assignments.map((assignment, index) => <p key={index} className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-amber-400" /> {assignment.function_name} · {assignment.role} · Report {assignment.reporting_time || 'time pending'}</p>)}{events.length > 0 && events.map((event, index) => <p key={`event-${index}`}>{event.name} · {event.date ? formatDate(event.date) : 'Date pending'} · {event.start_time ?? event.time ?? 'Time pending'}</p>)}</div></div>; })}</div>}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-slate-500"><Camera className="h-3.5 w-3.5" /> Operational schedule only. Billing and client package amounts are private.</p>
      </div>
    </div>
  );
}
