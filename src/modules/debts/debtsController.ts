import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { dbFetchOne, dbFetchAll, dbInsert, dbUpdate, dbDelete } from '../../db/db.js';
import { getStorePlanDetails, normalizePhoneNumber, formatCurrency } from '../../utils/helpers.js';

export interface DebtRecord {
  id: number;
  store_id: number;
  customer_name: string;
  customer_phone: string;
  amount: number;
  description?: string;
  due_date?: string;
  status: 'pending' | 'paid';
  notes?: string;
  created_at: string;
  updated_at: string;
}

export const debtsRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. List Debts & Summary Stats
  fastify.get('/api/merchant/debts', async (req: FastifyRequest, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });

    const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
    const { config, isPro } = getStorePlanDetails(currentStore);

    const debts = dbFetchAll<DebtRecord>('debts', { store_id: currentStore.id }, 'id DESC');
    const activeDebts = debts.filter(d => d.status === 'pending');
    const paidDebts = debts.filter(d => d.status === 'paid');

    const totalOutstanding = activeDebts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const totalRecovered = paidDebts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

    return reply.send({
      success: true,
      debts,
      stats: {
        total_outstanding: totalOutstanding,
        total_recovered: totalRecovered,
        active_count: activeDebts.length,
        paid_count: paidDebts.length,
        max_active_limit: config.limits.active_debts_limit,
        is_limit_reached: config.limits.active_debts_limit !== -1 && activeDebts.length >= config.limits.active_debts_limit
      },
      isPro
    });
  });

  // 2. Create Debt Record
  fastify.post('/api/merchant/debts', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });

    const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
    const { config } = getStorePlanDetails(currentStore);

    const body = (req.body || {}) as any;
    const customerName = String(body.customer_name || '').trim();
    const customerPhone = String(body.customer_phone || '').trim();
    const amount = parseFloat(body.amount);
    const description = body.description ? String(body.description).trim() : null;
    const dueDate = body.due_date ? String(body.due_date).trim() : null;
    const notes = body.notes ? String(body.notes).trim() : null;

    if (!customerName) {
      return reply.send({ success: false, error: 'Customer name is required' });
    }
    if (!customerPhone) {
      return reply.send({ success: false, error: 'Customer phone number is required' });
    }
    if (isNaN(amount) || amount <= 0) {
      return reply.send({ success: false, error: 'Valid debt amount is required' });
    }

    // Check Plan Limit for Active Debts (3 for Free, Unlimited for Pro/Business)
    const activeDebts = dbFetchAll<DebtRecord>('debts', { store_id: currentStore.id, status: 'pending' });
    if (config.limits.active_debts_limit !== -1 && activeDebts.length >= config.limits.active_debts_limit) {
      return reply.send({
        success: false,
        limit_reached: true,
        error: `Your Free plan is limited to ${config.limits.active_debts_limit} active debts. Upgrade to Pro for unlimited debt tracking & automated WhatsApp reminders.`
      });
    }

    const normalizedPhone = normalizePhoneNumber(customerPhone);
    const debtId = dbInsert('debts', {
      store_id: currentStore.id,
      customer_name: customerName,
      customer_phone: normalizedPhone || customerPhone,
      amount,
      description,
      due_date: dueDate,
      status: 'pending',
      notes
    });

    const newDebt = dbFetchOne<DebtRecord>('debts', { id: debtId });
    return reply.send({ success: true, debt: newDebt });
  });

  // 3. Mark Debt as Paid
  fastify.post('/api/merchant/debts/mark-paid', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });

    const debtId = parseInt((req.body as any)?.debt_id);
    if (!debtId) return reply.send({ success: false, error: 'Valid debt ID required' });

    const debt = dbFetchOne<DebtRecord>('debts', { id: debtId, store_id: store.id });
    if (!debt) return reply.send({ success: false, error: 'Debt record not found' });

    dbUpdate('debts', { status: 'paid', updated_at: new Date().toISOString() }, { id: debtId });
    return reply.send({ success: true, message: 'Debt marked as paid' });
  });

  // 4. Delete Debt Record
  fastify.post('/api/merchant/debts/delete', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });

    const debtId = parseInt((req.body as any)?.debt_id);
    if (!debtId) return reply.send({ success: false, error: 'Valid debt ID required' });

    const debt = dbFetchOne<DebtRecord>('debts', { id: debtId, store_id: store.id });
    if (!debt) return reply.send({ success: false, error: 'Debt record not found' });

    dbDelete('debts', { id: debtId, store_id: store.id });
    return reply.send({ success: true, message: 'Debt record deleted' });
  });

  // 5. Generate WhatsApp Debt Reminder Link
  fastify.get('/api/merchant/debts/:id/reminder-link', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });

    const debtId = parseInt(req.params.id);
    const debt = dbFetchOne<DebtRecord>('debts', { id: debtId, store_id: store.id });
    if (!debt) return reply.send({ success: false, error: 'Debt record not found' });

    const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
    const cleanPhone = normalizePhoneNumber(debt.customer_phone).replace('+', '');
    const formattedAmount = formatCurrency(debt.amount);
    const dueDateStr = debt.due_date ? ` due on ${debt.due_date}` : '';
    const descStr = debt.description ? ` for "${debt.description}"` : '';

    let bankInfo = '';
    if (currentStore.bank_name && currentStore.bank_account_number) {
      bankInfo = `\n\nBank Payment Details:\nBank: ${currentStore.bank_name}\nAccount: ${currentStore.bank_account_number}\nName: ${currentStore.bank_account_name || currentStore.store_name}`;
    }

    const message = `Hello ${debt.customer_name}, this is a gentle reminder from *${currentStore.store_name}* regarding your outstanding balance of *${formattedAmount}*${descStr}${dueDateStr}.${bankInfo}\n\nPlease confirm once payment is made. Thank you for your business!`;

    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    return reply.send({ success: true, url: waUrl, message });
  });
};
