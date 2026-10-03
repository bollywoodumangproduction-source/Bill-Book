import type { StudioLabOrder } from '@/lib/types';

export function hasLabAlbumWork(order: Partial<StudioLabOrder>): boolean {
  return Number(order.total_album_bill ?? 0) > 0
    || Boolean(order.album_rows?.length)
    || Boolean(order.clients?.some((client) => client.album_rows?.length));
}

export function hasLabVideoWork(order: Partial<StudioLabOrder>): boolean {
  return Number(order.total_video_bill ?? 0) > 0
    || Boolean(order.video_rows?.length)
    || Boolean(order.clients?.some((client) => client.video_rows?.length));
}

export function labWorkStatusSummary(order: Partial<StudioLabOrder>): string[] {
  const statuses: string[] = [];
  if (hasLabAlbumWork(order)) statuses.push(`Album: ${order.album_status || 'Pending'}`);
  if (hasLabVideoWork(order)) statuses.push(`Video: ${order.video_status || 'Pending'}`);
  return statuses;
}

export function labOrderOverviewStatus(order: Partial<StudioLabOrder>): string {
  if (order.order_status === 'Delivered') return 'Delivered';
  const statuses = [
    ...(hasLabAlbumWork(order) ? [order.album_status || 'Pending'] : []),
    ...(hasLabVideoWork(order) ? [order.video_status || 'Pending'] : []),
  ];
  if (statuses.length === 0) return order.order_status || 'Pending';
  if (statuses.every((status) => status === 'Complete')) return 'Ready for Delivery';
  if (statuses.every((status) => status === 'Pending')) return 'Pending';
  return 'In Progress';
}

export function visibleLabOrderDates(order: Partial<StudioLabOrder>): Array<{ label: string; date: string }> {
  if (order.date_pending) return [];
  const dates: Array<{ label: string; date: string }> = [];
  if (order.promised_delivery_date) dates.push({ label: 'Promised Delivery', date: order.promised_delivery_date });
  if (hasLabAlbumWork(order) && order.album_required_date) dates.push({ label: 'Album Due', date: order.album_required_date });
  if (hasLabVideoWork(order) && order.video_delivery_date) dates.push({ label: 'Video Due', date: order.video_delivery_date });
  return dates;
}
