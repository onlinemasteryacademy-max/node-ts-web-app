"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ordersRoutes = ordersRoutes;
const ordersService_js_1 = require("./ordersService.js");
async function ordersRoutes(fastify) {
    const executeCreateOrder = async (body, reply) => {
        const result = (0, ordersService_js_1.createOrder)({
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
    };
    const executeSubmitClaim = async (body, reply) => {
        const orderId = parseInt(body.order_id || '0');
        const ref = body.payment_proof_ref || body.reference || body.payment_reference || 'Direct Bank Transfer';
        const receiptUrl = body.receipt_url || null;
        if (!orderId)
            return reply.send({ success: false, error: 'order_id is required' });
        const result = (0, ordersService_js_1.submitPaymentClaim)(orderId, ref, receiptUrl);
        return reply.send(result);
    };
    const handleOrdersApi = async (req, reply) => {
        const action = req.query?.action || req.body?.action;
        const store = req.session?.merchantStore;
        const body = (req.body || {});
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
                if (!store)
                    return reply.code(401).send({ success: false, error: 'Unauthorized' });
                const orderId = parseInt(body.order_id || '0');
                const res = (0, ordersService_js_1.confirmOrderPayment)(orderId, store.id);
                return reply.send(res);
            }
            // 4. Reject Payment (Merchant)
            if (action === 'reject_payment') {
                if (!store)
                    return reply.code(401).send({ success: false, error: 'Unauthorized' });
                const orderId = parseInt(body.order_id || '0');
                const res = (0, ordersService_js_1.rejectOrderPayment)(orderId, store.id);
                return reply.send(res);
            }
            // 5. Update Status (Merchant)
            if (action === 'update_status') {
                if (!store)
                    return reply.code(401).send({ success: false, error: 'Unauthorized' });
                const orderId = parseInt(body.order_id || '0');
                const status = body.status || body.order_status;
                const res = (0, ordersService_js_1.updateOrderStatus)(orderId, store.id, status);
                return reply.send(res);
            }
            // 6. Poll Events
            if (action === 'poll_events') {
                if (!store)
                    return reply.code(401).send({ success: false, error: 'Unauthorized' });
                const sinceOrderId = parseInt(req.query?.since_id || '0');
                const sinceEventId = parseInt(req.query?.since_event_id || '0');
                const data = (0, ordersService_js_1.pollOrdersAndEvents)(store.id, sinceOrderId, sinceEventId);
                return reply.send({ success: true, ...data });
            }
            return reply.send({ success: false, error: 'Invalid orders action' });
        }
        catch (e) {
            return reply.code(500).send({ success: false, error: e.message });
        }
    };
    fastify.post('/api/orders/create', async (req, reply) => {
        return executeCreateOrder((req.body || {}), reply);
    });
    fastify.post('/api/orders/claim', async (req, reply) => {
        return executeSubmitClaim((req.body || {}), reply);
    });
    fastify.post('/api/orders/submit_claim', async (req, reply) => {
        return executeSubmitClaim((req.body || {}), reply);
    });
    fastify.get('/api/orders', handleOrdersApi);
    fastify.post('/api/orders', handleOrdersApi);
    fastify.get('/api/orders.php', handleOrdersApi);
    fastify.post('/api/orders.php', handleOrdersApi);
}
