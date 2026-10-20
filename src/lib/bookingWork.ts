import type { Booking, BookingDeliverables, BookingWorkItemStatus, BookingWorkProgress, BookingWorkType, WorkStatus } from '@/lib/types';
import { supabase } from '@/lib/supabase';

export function bookingWorkTypes(deliverables: BookingDeliverables | null | undefined): BookingWorkType[] {
  const data = deliverables ?? {};
  const types: BookingWorkType[] = [];
  if ((data.album_rows?.length ?? 0) > 0) types.push('album');
  if ((data.video_rows?.length ?? 0) > 0 || data.raw_video) types.push('video');
  return types;
}

function legacyItemStatus(workStatus: WorkStatus | null | undefined, type: BookingWorkType): BookingWorkItemStatus {
  if (workStatus === 'ready_for_delivery' || workStatus === 'delivered' || workStatus === 'both_data_ready') return 'ready_for_delivery';
  if (type === 'album' && workStatus === 'album_design_ready') return 'ready_for_delivery';
  if (type === 'video' && workStatus === 'video_complete') return 'ready_for_delivery';
  if (workStatus === 'editing_in_progress') return 'editing_in_progress';
  return 'pending';
}

export function bookingWorkItemStatus(
  booking: Pick<Booking, 'work_status' | 'deliverables_data'>,
  type: BookingWorkType,
  progress: BookingWorkProgress | undefined = booking.deliverables_data?.work_progress,
): BookingWorkItemStatus {
  return progress?.[type]?.status ?? legacyItemStatus(booking.work_status, type);
}

export function bookingWorkItemTypes(booking: Pick<Booking, 'work_status' | 'deliverables_data'>): Array<{ type: BookingWorkType; status: BookingWorkItemStatus }> {
  return bookingWorkTypes(booking.deliverables_data).map((type) => ({ type, status: bookingWorkItemStatus(booking, type) }));
}

export function bookingHasLiveWork(booking: Pick<Booking, 'work_status' | 'deliverables_data'>): boolean {
  const types = bookingWorkTypes(booking.deliverables_data);
  return types.length > 0
    ? types.some((type) => bookingWorkItemStatus(booking, type) === 'editing_in_progress')
    : booking.work_status === 'editing_in_progress';
}

export function bookingAllMediaReady(booking: Pick<Booking, 'work_status' | 'deliverables_data'>): boolean {
  const types = bookingWorkTypes(booking.deliverables_data);
  return types.length > 0
    ? types.every((type) => bookingWorkItemStatus(booking, type) === 'ready_for_delivery')
    : booking.work_status === 'ready_for_delivery' || booking.work_status === 'delivered';
}

export function deliveryItemWorkType(item: string): BookingWorkType | null {
  if (/^Album:/i.test(item)) return 'album';
  if (/^Video:/i.test(item) || /^Raw Video$/i.test(item)) return 'video';
  return null;
}

export function bookingDeliveryItemIsReady(
  booking: Pick<Booking, 'work_status' | 'deliverables_data'>,
  item: string,
): boolean {
  const type = deliveryItemWorkType(item);
  return type
    ? bookingWorkItemStatus(booking, type) === 'ready_for_delivery'
    : booking.work_status === 'ready_for_delivery' || booking.work_status === 'delivered';
}

export function aggregateBookingWorkStatus(
  booking: Pick<Booking, 'work_status' | 'deliverables_data'>,
  progress: BookingWorkProgress,
): WorkStatus {
  if (booking.work_status === 'delivered') return 'delivered';
  const types = bookingWorkTypes(booking.deliverables_data);
  if (types.length === 0) return booking.work_status ?? 'pending';
  const statuses = types.map((type) => bookingWorkItemStatus(booking, type, progress));
  if (statuses.every((status) => status === 'ready_for_delivery')) return 'ready_for_delivery';
  if (statuses.some((status) => status === 'editing_in_progress')) return 'editing_in_progress';
  if (booking.work_status === 'pending' || booking.work_status === 'processing' || booking.work_status === 'shoot_completed') return booking.work_status;
  return statuses.some((status) => status === 'pending') ? 'pending' : 'editing_in_progress';
}


export async function saveBookingMediaStatus(booking: Booking, type: BookingWorkType, status: BookingWorkItemStatus): Promise<Booking> {
  const { data, error } = await supabase.rpc('update_booking_media_work_status', {
    p_booking_id: booking.id,
    p_work_type: type,
    p_status: status,
    p_expected_deliverables: booking.deliverables_data ?? {},
  });
  if (error) throw error;
  const result = data as { booking?: Booking } | null;
  if (!result?.booking) throw new Error('Booking status was not returned. Refresh and check the booking before retrying.');
  return result.booking;
}
