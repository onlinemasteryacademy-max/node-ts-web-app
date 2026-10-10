import { createOrder, submitPaymentClaim, confirmOrderPayment, rejectOrderPayment, updateOrderStatus, pollOrdersAndEvents } from './ordersService.js';
export async function ordersRoutes(fastify) {
    const handleOrdersApi = async (req, reply) => {
        const action = req.query?.action || req.body?.action;
        const store = req.session?.merchantStore;
        try {
            // 1. Create Order
            if (action === 'create_order') {
                const body = (req.body || {});
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
                    force_create: Boolean(body.force_create || body.continue_new_order)
                });
                return reply.send(result);
            }
            // 2. Submit Payment Claim
            if (action === 'submit_claim') {
                const body = (req.body || {});
                const orderId = parseInt(body.order_id || '0');
                const ref = body.payment_proof_ref || body.reference || body.payment_reference || 'Direct Bank Transfer';
                const receiptUrl = body.receipt_url || null;
                if (!orderId)
                    return reply.send({ success: false, error: 'order_id is required' });
                const result = submitPaymentClaim(orderId, ref, receiptUrl);
                return reply.send(result);
            }
            // 3. Confirm Payment (Merchant)
            if (action === 'confirm_payment') {
                if (!store)
                    return reply.code(401).send({ success: false, error: 'Unauthorized' });
                const body = (req.body || {});
                const orderId = parseInt(body.order_id || '0');
                const res = confirmOrderPayment(orderId, store.id);
                return reply.send(res);
            }
            // 4. Reject Payment (Merchant)
            if (action === 'reject_payment') {
                if (!store)
                    return reply.code(401).send({ success: false, error: 'Unauthorized' });
                const body = (req.body || {});
                const orderId = parseInt(body.order_id || '0');
                const res = rejectOrderPayment(orderId, store.id);
                return reply.send(res);
            }
            // 5. Update Status (Merchant)
            if (action === 'update_status') {
                if (!store)
                    return reply.code(401).send({ success: false, error: 'Unauthorized' });
                const body = (req.body || {});
                const orderId = parseInt(body.order_id || '0');
                const status = body.status || body.order_status;
                const res = updateOrderStatus(orderId, store.id, status);
                return reply.send(res);
            }
            // 6. Poll Events
            if (action === 'poll_events') {
                if (!store)
                    return reply.code(401).send({ success: false, error: 'Unauthorized' });
                const sinceOrderId = parseInt(req.query?.since_id || '0');
                const sinceEventId = parseInt(req.query?.since_event_id || '0');
                const data = pollOrdersAndEvents(store.id, sinceOrderId, sinceEventId);
                return reply.send({ success: true, ...data });
            }
            return reply.send({ success: false, error: 'Invalid orders action' });
        }
        catch (e) {
            return reply.code(500).send({ success: false, error: e.message });
        }
    };
    fastify.get('/api/orders', handleOrdersApi);
    fastify.post('/api/orders', handleOrdersApi);
    fastify.get('/api/orders.php', handleOrdersApi);
    fastify.post('/api/orders.php', handleOrdersApi);
}
