import { supabase } from '@/lib/supabase';
import type { BookingNotification, NotificationType, WorkStatus, WORK_STATUSES } from '@/lib/types';
import { formatINR } from '@/lib/format';

function uid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function logNotification(
  bookingId: string,
  type: NotificationType,
  title: string,
  message: string,
): Promise<void> {
  const notification: BookingNotification = {
    id: uid(),
    booking_id: bookingId,
    type,
    title,
    message,
    is_read: false,
    created_at: new Date().toISOString(),
  };
  await supabase.from('booking_notifications').insert(notification);
}

export async function logPaymentNotification(
  bookingId: string,
  amountPaid: number,
  remainingBalance: number,
): Promise<void> {
  const msg =
    remainingBalance > 0
      ? `Payment of ${formatINR(amountPaid)} received successfully. Remaining balance: ${formatINR(remainingBalance)}.`
      : `Payment of ${formatINR(amountPaid)} received successfully. Full balance cleared.`;
  await logNotification(bookingId, 'payment', 'Payment Received', msg);
}

export async function logWorkStatusNotification(
  bookingId: string,
  newStatus: WorkStatus,
): Promise<void> {
  const labels: Record<WorkStatus, string> = {
    pending: 'Work status set to Pending',
    shoot_completed: 'Shoot Completed — your event has been successfully photographed.',
    editing_in_progress: 'Editing in Progress — your photos and videos are being edited.',
    album_design_ready: 'Album Design Ready for Review — please check your album design.',
    delivered: 'Delivered — all deliverables are ready for pickup.',
  };
  const titles: Record<WorkStatus, string> = {
    pending: 'Work Status Updated',
    shoot_completed: 'Shoot Completed',
    editing_in_progress: 'Editing in Progress',
    album_design_ready: 'Album Design Ready',
    delivered: 'Delivered',
  };
  await logNotification(bookingId, 'work_status', titles[newStatus], labels[newStatus]);
}

export async function logReminderNotification(
  bookingId: string,
  eventDate: string,
): Promise<void> {
  await logNotification(
    bookingId,
    'reminder',
    'Shoot Reminder',
    `Your event is scheduled for tomorrow (${eventDate}). Please ensure you arrive on time at the venue.`,
  );
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase.from('booking_notifications').update({ is_read: true }).eq('id', id);
}

export async function markAllNotificationsRead(bookingId: string): Promise<void> {
  await supabase.from('booking_notifications').update({ is_read: true }).eq('booking_id', bookingId);
}

export async function fetchNotifications(bookingId: string): Promise<BookingNotification[]> {
  const { data } = await supabase
    .from('booking_notifications')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false });
  return (data ?? []) as BookingNotification[];
}

export function shouldShowShootReminder(shootDate: string): boolean {
  const shoot = new Date(shootDate);
  const now = new Date();
  const diffMs = shoot.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours > 0 && diffHours <= 24;
}
