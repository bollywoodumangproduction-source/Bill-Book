import type { DirectTransaction, Partner, PhotographerLedgerEntry, StudioLabOrder } from '@/lib/types';

export interface PartnerBalance {
  partner: Partner;
  totalCredit: number;
  totalDebit: number;
  totalSettled: number;
  directGiven: number;
  directReceived: number;
  labCredit: number;
  labDebit: number;
  balance: number;
}

function belongsToPartner(order: StudioLabOrder, partner: Partner): boolean {
  if (order.partner_id === partner.id) return true;
  const orderPartner = String(order.partner_name ?? order.studio_name ?? '').trim().toLowerCase();
  return !!orderPartner && orderPartner === String(partner.name ?? '').trim().toLowerCase();
}

export function partnerLabOrderHistory(orders: StudioLabOrder[], partner: Partner): StudioLabOrder[] {
  return orders.filter((order) => belongsToPartner(order, partner));
}

export function calculatePartnerBalance(
  partner: Partner,
  ledgerEntries: PhotographerLedgerEntry[],
  directTransactions: DirectTransaction[],
  allLabOrders: StudioLabOrder[],
): PartnerBalance {
  const pLedger = ledgerEntries.filter((entry) => entry.partner_id
    ? entry.partner_id === partner.id
    : entry.mobile === partner.mobile);
  const pDirect = directTransactions.filter((transaction) => transaction.partner_id === partner.id);
  const activeLabOrders = partnerLabOrderHistory(allLabOrders, partner)
    .filter((order) => !order.deleted_at && !order.archived_at);

  const totalCredit = pLedger
    .filter((entry) => entry.entry_type === 'SHOOT_DUTY_CREDIT')
    .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
  const totalDebit = pLedger
    .filter((entry) => entry.entry_type === 'LAB_WORK_DEBIT')
    .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
  const totalSettled = pLedger
    .filter((entry) => entry.entry_type === 'PAYMENT_SETTLED')
    .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
  const directGiven = pDirect
    .filter((transaction) => transaction.txn_type === 'Given')
    .reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);
  const directReceived = pDirect
    .filter((transaction) => transaction.txn_type === 'Received')
    .reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);
  const labCredit = activeLabOrders
    .reduce((sum, order) => sum + Number(order.advance_paid ?? 0), 0);
  const labDebit = activeLabOrders.reduce((sum, order) => {
    const orderTotal = Number(order.master_total ?? (
      Number(order.current_order_total ?? 0) + Number(order.previous_back_due ?? order.back_due ?? 0)
    ));
    return sum + Math.max(0, orderTotal - Number(order.balance_transferred_out ?? 0));
  }, 0);

  return {
    partner,
    totalCredit,
    totalDebit,
    totalSettled,
    directGiven,
    directReceived,
    labCredit,
    labDebit,
    balance: totalCredit + directReceived + labCredit - totalDebit - totalSettled - directGiven - labDebit,
  };
}
