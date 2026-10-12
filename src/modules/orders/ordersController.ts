import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createOrder,
  submitPaymentClaim,
  confirmOrderPayment,
  rejectOrderPayment,
  updateOrderStatus,
  pollOrdersAndEvents
} from './ordersService.js';
import { dbFetchOne } from '../../db/db.js';

export async function ordersRoutes(fastify: FastifyInstance) {
  const executeCreateOrder = async (body: any, reply: FastifyReply) => {
    const result = createOrder({
      store_id: parseInt(body.store_id || '0'),
      customer_name: body.customer_name,
      customer_phone: body.customer_phone,
      customer_email: body.customer_email,
      delivery_address: body.delivery_address,
      fulfillment_type: body.fulfillment_type || 'delivery',
      delivery_fee: parseFloat(body.delivery_fee || '0'),
      discount_code: body.discount_code || body.coupon_code || null,
      discount_amount: parseFloat(body.discount_amount || '0'),
      items: typeof body.items === 'string' ? JSON.parse(body.items) : (body.items || []),
      payment_method: body.payment_method || 'bank_transfer',
      notes: body.notes,
      receipt_url: body.receipt_url || null,
      payment_proof_ref: body.payment_proof_ref || body.notes || null,
      payment_confirmed: Boolean(body.payment_confirmed),
      force_create: Boolean(body.force_create || body.continue_new_order)
    });
    return reply.send(result);
  };

  const executeSubmitClaim = async (body: any, reply: FastifyReply) => {
    const orderId = parseInt(body.order_id || '0');
    const ref = body.payment_proof_ref || body.reference || body.payment_reference || 'Direct Bank Transfer';
    const receiptUrl = body.receipt_url || null;

    if (!orderId) return reply.send({ success: false, error: 'order_id is required' });

    const result = submitPaymentClaim(orderId, ref, receiptUrl);
    return reply.send(result);
  };

  const handleOrdersApi = async (req: FastifyRequest<{ Querystring: any; Body: any }>, reply: FastifyReply) => {
    const action = (req.query as any)?.action || (req.body as any)?.action;
    const store = (req as any).session?.merchantStore;
    const body = (req.body || {}) as any;

    try {
      // 1. Create Order
      if (action === 'create_order' || action === 'create' || (req.method === 'POST' && body.items && body.customer_name)) {
        return executeCreateOrder(body, reply);
      }

      // 2. Submit Payment Claim
      if (action === 'submit_claim' || action === 'claim') {
        return executeSubmitClaim(body, reply);
      }

      // 3. Confirm Payment (Merchant)
      if (action === 'confirm_payment') {
        if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized' });
        const orderId = parseInt(body.order_id || '0');
        const res = confirmOrderPayment(orderId, store.id);
        return reply.send(res);
      }

      // 4. Reject Payment (Merchant)
      if (action === 'reject_payment') {
        if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized' });
        const orderId = parseInt(body.order_id || '0');
        const res = rejectOrderPayment(orderId, store.id);
        return reply.send(res);
      }

      // 5. Update Status (Merchant)
      if (action === 'update_status') {
        if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized' });
        const orderId = parseInt(body.order_id || '0');
        const status = body.status || body.order_status;
        const res = updateOrderStatus(orderId, store.id, status);
        return reply.send(res);
      }

      // 6. Poll Events
      if (action === 'poll_events') {
        if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized' });
        const sinceOrderId = parseInt((req.query as any)?.since_id || '0');
        const sinceEventId = parseInt((req.query as any)?.since_event_id || '0');
        const data = pollOrdersAndEvents(store.id, sinceOrderId, sinceEventId);
        return reply.send({ success: true, ...data });
      }

      return reply.send({ success: false, error: 'Invalid orders action' });
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: e.message });
    }
  };

  fastify.post('/api/orders/create', async (req: FastifyRequest, reply: FastifyReply) => {
    return executeCreateOrder((req.body || {}) as any, reply);
  });
  fastify.post('/api/orders/claim', async (req: FastifyRequest, reply: FastifyReply) => {
    return executeSubmitClaim((req.body || {}) as any, reply);
  });
  fastify.post('/api/orders/submit_claim', async (req: FastifyRequest, reply: FastifyReply) => {
    return executeSubmitClaim((req.body || {}) as any, reply);
  });

  fastify.get('/api/orders', handleOrdersApi);
  fastify.post('/api/orders', handleOrdersApi);
  fastify.get('/api/orders.php', handleOrdersApi);
  fastify.post('/api/orders.php', handleOrdersApi);
}
