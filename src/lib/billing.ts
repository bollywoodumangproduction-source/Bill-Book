import type { Booking, BookingCustomItem, BookingDeliverables, LabExtraCharge, StudioLabOrder } from '@/lib/types';

const money = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

export interface BillingTotals {
  baseSubtotal: number;
  extraTotal: number;
  subtotal: number;
  previousBalance: number;
  balanceTransferredOut: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  grandTotal: number;
  totalPayments: number;
  balanceDue: number;
}

export function bookingExtraTotal(items: BookingCustomItem[] = []): number {
  return items.reduce((sum, item) => sum + money(item.amount || money(item.qty) * money(item.rate)), 0);
}

export function labExtraTotal(items: LabExtraCharge[] = []): number {
  return items.reduce((sum, item) => sum + money(item.line_amount || money(item.quantity) * money(item.unit_rate)), 0);
}

export function calculateBookingBilling(input: {
  baseSubtotal: number;
  extraItems?: BookingCustomItem[];
  taxRate?: number;
  taxAmount?: number;
  discountAmount?: number;
  totalPayments?: number;
}): BillingTotals {
  const baseSubtotal = money(input.baseSubtotal);
  const extraTotal = bookingExtraTotal(input.extraItems);
  const subtotal = baseSubtotal + extraTotal;
  const taxRate = money(input.taxRate);
  const taxAmount = input.taxAmount == null ? subtotal * taxRate / 100 : money(input.taxAmount);
  const discountAmount = money(input.discountAmount);
  const grandTotal = Math.max(0, subtotal + taxAmount - discountAmount);
  const totalPayments = money(input.totalPayments);
  return {
    baseSubtotal, extraTotal, subtotal, previousBalance: 0, balanceTransferredOut: 0, taxRate, taxAmount,
    discountAmount, grandTotal, totalPayments, balanceDue: Math.max(0, grandTotal - totalPayments),
  };
}

export function calculateLabOrderBilling(input: {
  baseSubtotal: number;
  extraItems?: LabExtraCharge[];
  previousBalance?: number;
  balanceTransferredOut?: number;
  taxRate?: number;
  taxAmount?: number;
  discountAmount?: number;
  totalPayments?: number;
}): BillingTotals {
  const baseSubtotal = money(input.baseSubtotal);
  const extraTotal = labExtraTotal(input.extraItems);
  const subtotal = baseSubtotal + extraTotal;
  const previousBalance = money(input.previousBalance);
  const balanceTransferredOut = money(input.balanceTransferredOut);
  const taxRate = money(input.taxRate);
  // Tax applies only to this order's subtotal, never to a carried previous balance.
  const taxAmount = input.taxAmount == null ? subtotal * taxRate / 100 : money(input.taxAmount);
  const discountAmount = money(input.discountAmount);
  const grandTotal = Math.max(0, subtotal + previousBalance + taxAmount - discountAmount);
  const totalPayments = money(input.totalPayments);
  return {
    baseSubtotal, extraTotal, subtotal, previousBalance, balanceTransferredOut, taxRate, taxAmount,
    discountAmount, grandTotal, totalPayments, balanceDue: Math.max(0, grandTotal - totalPayments - balanceTransferredOut),
  };
}

/**
 * Reads old saved bills without recalculating their historical totals. New
 * version-2 bills are recalculated from their item rows by the form helper.
 */
export function bookingBillingSnapshot(booking: Pick<Booking, 'base_amount' | 'total_amount' | 'discount' | 'advance_paid' | 'tax_rate' | 'tax_amount' | 'billing_version' | 'deliverables_data'>): BillingTotals {
  const items = (booking.deliverables_data as BookingDeliverables | undefined)?.custom_items ?? [];
  const extraTotal = bookingExtraTotal(items);
  const storedSubtotal = money(booking.total_amount);
  const baseSubtotal = Math.max(0, storedSubtotal - extraTotal);
  const taxRate = money(booking.tax_rate);
  const taxAmount = money(booking.tax_amount);
  const grandTotal = Math.max(0, storedSubtotal + taxAmount - money(booking.discount));
  return {
    baseSubtotal, extraTotal, subtotal: storedSubtotal, previousBalance: 0,
    taxRate, taxAmount, discountAmount: money(booking.discount), balanceTransferredOut: 0, grandTotal,
    totalPayments: money(booking.advance_paid),
    balanceDue: Math.max(0, grandTotal - money(booking.advance_paid)),
  };
}

export function labOrderBillingSnapshot(order: Pick<StudioLabOrder,
  'total_album_bill' | 'total_video_bill' | 'current_order_total' | 'previous_back_due' | 'master_total' |
  'advance_paid' | 'extra_items' | 'tax_rate' | 'tax_amount' | 'discount_amount' | 'billing_version' | 'balance_transferred_out'>,
  totalPayments = order.advance_paid,
): BillingTotals {
  const extraTotal = labExtraTotal(order.extra_items ?? []);
  const storedSubtotal = money(order.current_order_total);
  const legacy = !order.billing_version || order.billing_version < 2;
  const baseSubtotal = legacy
    ? Math.max(0, storedSubtotal - extraTotal)
    : money(order.total_album_bill) + money(order.total_video_bill);
  const subtotal = legacy ? storedSubtotal : baseSubtotal + extraTotal;
  const previousBalance = money(order.previous_back_due);
  const taxRate = money(order.tax_rate);
  const taxAmount = money(order.tax_amount);
  const discountAmount = money(order.discount_amount);
  const grandTotal = legacy
    ? (order.master_total == null ? subtotal + previousBalance : money(order.master_total))
    : Math.max(0, subtotal + previousBalance + taxAmount - discountAmount);
  const paid = money(totalPayments);
  const balanceTransferredOut = money(order.balance_transferred_out);
  return {
    baseSubtotal, extraTotal, subtotal, previousBalance, balanceTransferredOut, taxRate, taxAmount,
    discountAmount, grandTotal, totalPayments: paid, balanceDue: Math.max(0, grandTotal - paid - balanceTransferredOut),
  };
}

export function bookingBaseSubtotal(videoTotal: number, albumTotal: number): number {
  return money(videoTotal) + money(albumTotal);
}

export function labBaseSubtotal(videoTotal: number, albumTotal: number): number {
  return money(videoTotal) + money(albumTotal);
}
