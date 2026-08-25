import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  MapPin,
  Phone,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Booking, EventFunction } from '@/lib/types';
import { formatDate, todayISO } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { inputClass, selectClass } from '@/components/ui/Field';

const CREW_ROLES = [
  'Lead Photographer',
  'Videographer',
  'Cinematographer',
  'Drone Pilot',
  'Helper',
  'Lab Partner',
] as const;

type Assignment = {
  id: string;
  booking_id: string;
  photographer_id: string | null;
  function_name: string;
  role: string;
};

type CrewMember = {
  id: string;
  name: string;
  phone: string;
  availability_status?: 'Active' | 'Busy' | 'On Leave';
};

type RosterEvent = {
  booking: Booking;
  event: EventFunction;
  assignments: Assignment[];
};

function eventList(booking: Booking): EventFunction[] {
  return booking.events?.length
    ? booking.events
    : [{ name: booking.event_function || 'Studio Shoot', date: booking.shoot_date, time: booking.shoot_time }];
}

function displayRole(role: string): string {
  return CREW_ROLES.includes(role as typeof CREW_ROLES[number]) ? role : role || 'Lead Photographer';
}

function statusColor(status: string): 'emerald' | 'amber' {
  return status === 'CONFIRMED' ? 'emerald' : 'amber';
}

export function DutyRoster({ bookings, bookingsLoading = false }: { bookings: Booking[]; bookingsLoading?: boolean }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [memberId, setMemberId] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadRoster = async () => {
      const [{ data: assignmentData }, { data: photographerData }] = await Promise.all([
        supabase.from('shoot_assignments').select('id, booking_id, photographer_id, function_name, role'),
        supabase.from('photographers').select('id, name, phone').eq('active', true).order('name'),
      ]);
      if (!active) return;
      setAssignments((assignmentData ?? []) as Assignment[]);
      setCrew((photographerData ?? []).filter((person: CrewMember) => (person.availability_status ?? 'Active') === 'Active') as CrewMember[]);
      setLoading(false);
    };
    loadRoster();
    return () => { active = false; };
  }, []);

  const crewById = useMemo(() => new Map(crew.map((person) => [person.id, person])), [crew]);
  const activeBookings = useMemo(() => bookings.filter((booking) => {
    if (booking.booking_status === 'COMPLETED') return false;
    return selectedDate
      ? eventList(booking).some((event) => event.date === selectedDate)
      : eventList(booking).some((event) => event.date >= todayISO());
  }), [bookings, selectedDate]);

  const rosterEvents = useMemo<RosterEvent[]>(() => {
    return activeBookings.flatMap((booking) => eventList(booking).map((event) => ({
      booking,
      event,
      assignments: assignments.filter((assignment) => {
        if (assignment.booking_id !== booking.id) return false;
        return !assignment.function_name || assignment.function_name === event.name;
      }),
    })));
  }, [activeBookings, assignments]);

  const memberEvents = useMemo(() => memberId === 'all'
    ? rosterEvents
    : rosterEvents.filter((item) => item.assignments.some((assignment) => assignment.photographer_id === memberId)), [memberId, rosterEvents]);

  const visibleEvents = useMemo(() => {
    const filtered = selectedDate ? memberEvents.filter((item) => item.event.date === selectedDate) : memberEvents;
    return [...filtered].sort((a, b) => `${a.event.date}${a.event.time}`.localeCompare(`${b.event.date}${b.event.time}`));
  }, [memberEvents, selectedDate]);

  const groupedEvents = useMemo(() => visibleEvents.reduce<Record<string, RosterEvent[]>>((groups, item) => {
    (groups[item.event.date] ??= []).push(item);
    return groups;
  }, {}), [visibleEvents]);

  const clashes = useMemo(() => {
    const bySlot = new Map<string, RosterEvent[]>();
    rosterEvents.forEach((item) => item.assignments.forEach((assignment) => {
      if (!assignment.photographer_id) return;
      const key = `${assignment.photographer_id}|${item.event.date}|${item.event.time}`;
      const entries = bySlot.get(key) ?? [];
      if (!entries.some((entry) => entry.booking.id === item.booking.id)) entries.push(item);
      bySlot.set(key, entries);
    }));
    return [...bySlot.entries()]
      .filter(([key, entries]) => entries.length > 1 && (memberId === 'all' || key.startsWith(`${memberId}|`)))
      .map(([key, entries]) => {
        const [personId, date, time] = key.split('|');
        return { person: crewById.get(personId)?.name ?? 'Unknown crew member', date, time, entries };
      });
  }, [crewById, memberId, rosterEvents]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto] dark:border-white/10 dark:bg-slate-900/50">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">View date</span>
          <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Crew member</span>
          <select value={memberId} onChange={(event) => setMemberId(event.target.value)} className={selectClass}>
            <option value="all">All crew members</option>
            {[...crew].sort((a, b) => a.name.localeCompare(b.name)).map((person) => <option key={person.id} value={person.id}>{person.name} · Active &amp; Available</option>)}
          </select>
        </label>
        <div className="flex items-end">
          <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            <CalendarDays className="h-4 w-4" />
            {selectedDate ? formatDate(selectedDate) : 'Upcoming shoots'}
          </div>
        </div>
      </div>

      {clashes.length > 0 && (
        <div className="flex gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200" role="alert">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold">Double-booking clash detected</p>
            {clashes.map((clash) => <p key={`${clash.person}-${clash.date}-${clash.time}`}>
              {clash.person} is assigned to {clash.entries.map((entry) => entry.booking.client_name).join(' and ')} on {formatDate(clash.date)} at {clash.time || 'unspecified time'}.
            </p>)}
          </div>
        </div>
      )}

      {loading || bookingsLoading ? (
        <div className="flex justify-center py-16"><Users className="h-6 w-6 animate-pulse text-amber-500" /></div>
      ) : visibleEvents.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No active shoots found" subtitle={selectedDate ? 'Try another date or clear the date filter' : 'Upcoming bookings will appear here'} />
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedEvents).map(([date, events]) => (
            <section key={date}>
              <div className="mb-2 flex items-center gap-2"><h2 className="text-sm font-semibold text-slate-900 dark:text-white">{formatDate(date)}</h2><span className="text-xs text-slate-400">{events.length} {events.length === 1 ? 'event' : 'events'}</span></div>
              <div className="grid gap-3 xl:grid-cols-2">
                {events.map(({ booking, event, assignments: eventAssignments }) => (
                  <article key={`${booking.id}-${event.date}-${event.time}-${event.name}`} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="truncate font-semibold text-slate-900 dark:text-white">{booking.client_name}</p><p className="mt-0.5 text-xs text-slate-500">{booking.client_mobile}</p></div>
                      <Badge color={statusColor(booking.booking_status)}>{booking.booking_status === 'CONFIRMED' ? 'Confirmed' : 'Pending Approval'}</Badge>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                      <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-amber-500" />{event.name}</p>
                      <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-amber-500" />Reporting {event.time || booking.shoot_time || 'TBD'}</p>
                      <p className="flex items-start gap-2 sm:col-span-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />{booking.venue || booking.client_address || 'Venue not specified'}</p>
                      <p className="flex items-center gap-2 sm:col-span-2"><Phone className="h-4 w-4 text-amber-500" />{booking.client_mobile || 'Contact not specified'}</p>
                    </div>
                    <div className="mt-4 border-t border-slate-100 pt-3 dark:border-white/10"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Assigned team</p>
                      {eventAssignments.length === 0 ? <p className="text-sm text-slate-400">No crew assigned yet</p> : <div className="space-y-2">{eventAssignments.map((assignment) => { const person = assignment.photographer_id ? crewById.get(assignment.photographer_id) : undefined; return <div key={assignment.id} className="flex items-center justify-between gap-3 text-sm"><span className="font-medium text-slate-700 dark:text-slate-200">{person?.name ?? 'Unassigned'}</span><span className="text-xs text-slate-500">{displayRole(assignment.role)}{person?.phone ? ` · ${person.phone}` : ''}</span></div>; })}</div>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
