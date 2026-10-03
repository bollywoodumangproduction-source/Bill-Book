import type { LabClientRow, LabExtraCharge, LabPaymentInstallment, StudioLabOrder } from '@/lib/types';

const amount = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function clientWorkTotal(client: LabClientRow, extras: LabExtraCharge[] = [], clients: LabClientRow[] = []): number {
  const video = (client.video_rows ?? []).reduce((sum, row) => sum + amount(row.total ?? amount(row.qty) * amount(row.rate)), 0);
  const album = (client.album_rows ?? []).reduce((sum, row) => sum + amount(row.total ?? (
    amount(row.packaging_total) + amount(row.mini_total) + (row.papers ?? []).reduce((paperSum, paper) => paperSum + amount(paper.total), 0)
  )), 0);
  const sameNameMatches = clients.filter((entry) => entry.client_name.trim().toLocaleLowerCase() === client.client_name.trim().toLocaleLowerCase());
  const clientExtras = extras.filter((item) => item.client_id
    ? item.client_id === client.id
    : !!item.client_name && sameNameMatches.length === 1 && item.client_name.trim().toLocaleLowerCase() === client.client_name.trim().toLocaleLowerCase());
  return video + album + clientExtras.reduce((sum, item) => sum + amount(item.line_amount ?? amount(item.quantity) * amount(item.unit_rate)), 0);
}

export function clientPaidTotal(client: LabClientRow, payments: LabPaymentInstallment[], clients: LabClientRow[] = []): number {
  const sameNameMatches = clients.filter((entry) => entry.client_name.trim().toLocaleLowerCase() === client.client_name.trim().toLocaleLowerCase());
  return payments.filter((payment) => payment.client_id
    ? payment.client_id === client.id
    : clients.length === 1 && clients[0].id === client.id
      ? true
      : !!payment.client_name && sameNameMatches.length === 1 && payment.client_name.trim().toLocaleLowerCase() === client.client_name.trim().toLocaleLowerCase()
  ).reduce((sum, payment) => sum + amount(payment.amount), 0);
}

export function labOrderPayments(order: StudioLabOrder): LabPaymentInstallment[] {
  const history = order.payment_history ?? [];
  const recorded = history.reduce((sum, payment) => sum + amount(payment.amount), 0);
  const unitemizedAdvance = Math.max(0, amount(order.advance_paid) - recorded);
  if (unitemizedAdvance <= 0) return history;
  const soleClient = order.clients?.length === 1 ? order.clients[0] : undefined;
  return [...history, {
    id: `legacy-advance-${order.id}`,
    amount: unitemizedAdvance,
    payment_date: order.payment_date || '',
    payment_mode: order.payment_mode || '—',
    note: order.payment_note || 'Previously recorded advance',
    created_at: order.created_at,
    ...(soleClient ? { client_id: soleClient.id, client_name: soleClient.client_name } : {}),
  }];
}

export function unallocatedPaidTotal(payments: LabPaymentInstallment[]): number {
  return payments.filter((payment) => !payment.client_id && !payment.client_name).reduce((sum, payment) => sum + amount(payment.amount), 0);
}
