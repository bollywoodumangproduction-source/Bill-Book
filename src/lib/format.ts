export function formatINR(amount: number): string {
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  const parts = rounded.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `₹${parts}`;
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return formatDate(dateStr);
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatTime12Hour(timeStr: string | null | undefined): string {
  if (!timeStr) return '—';
  const value = timeStr.trim();
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return value;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return value;

  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${String(hour12).padStart(2, '0')}:${match[2]} ${suffix}`;
}

export function todayISO(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return dateStr === todayISO();
}

export function isUpcoming(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return dateStr > todayISO();
}

export function formatPhone(raw: string): string {
  return (raw ?? '').replace(/\D/g, '').slice(-10);
}

export function defaultPinFromPhone(raw: string): string {
  return formatPhone(raw).slice(-4);
}
