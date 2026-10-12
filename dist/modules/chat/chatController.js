"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatRoutes = chatRoutes;
const chatService_js_1 = require("./chatService.js");
const db_js_1 = require("../../db/db.js");
async function chatRoutes(fastify) {
    // 1. Unified REST API endpoint for Live Chat (/api/chat and /api/chat.php)
    const handleChatApi = async (req, reply) => {
        const action = req.query?.action || req.body?.action;
        const store = req.session?.merchantStore;
        try {
            // Action: get_session (Customer initialization)
            if (action === 'get_session') {
                const storeId = parseInt(req.query?.store_id || req.body?.store_id || '0');
                const sessionToken = req.query?.customer_session_token || req.body?.customer_session_token;
                const custName = req.query?.customer_name || req.body?.customer_name;
                const custPhone = req.query?.customer_phone || req.body?.customer_phone;
                const custEmail = req.query?.customer_email || req.body?.customer_email;
                if (!storeId)
                    return reply.send({ success: false, error: 'store_id is required' });
                const result = (0, chatService_js_1.getOrCreateCustomerSession)(storeId, sessionToken, custName, custPhone, custEmail);
                if (result.limit_reached) {
                    return reply.send({
                        success: false,
                        limit_reached: true,
                        error: result.error,
                        usage: result.usage
                    });
                }
                return reply.send({
                    success: true,
                    conversation: result.conversation,
                    customer_session_token: result.conversation?.customer_session_token,
                    usage: result.usage
                });
            }
            // Action: send_message (Both Customer and Merchant)
            if (action === 'send_message') {
                const body = (req.body || {});
                const conversationId = parseInt(body.conversation_id || '0');
                const text = body.message;
                const senderType = body.sender_type || (store ? 'merchant' : 'customer');
                const senderName = body.sender_name || (store ? store.store_name : 'Customer');
                const idempotencyKey = body.idempotency_key;
                const orderId = body.order_id ? parseInt(body.order_id) : null;
                const productId = body.product_id ? parseInt(body.product_id) : null;
                const productTitle = body.product_title || null;
                if (!conversationId)
                    return reply.send({ success: false, error: 'conversation_id is required' });
                // Authorization check if merchant
                if (senderType === 'merchant') {
                    if (!store)
                        return reply.code(401).send({ success: false, error: 'Unauthorized merchant session' });
                    const conv = (0, db_js_1.dbFetchOne)('chat_conversations', { id: conversationId });
                    if (!conv || conv.store_id !== store.id) {
                        return reply.code(403).send({ success: false, error: 'Cannot reply to another store conversation' });
                    }
                }
                const res = (0, chatService_js_1.sendMessage)(conversationId, senderType, senderName, text, {
                    orderId,
                    productId,
                    productTitle,
                    idempotencyKey
                });
                return reply.send(res);
            }
            // Action: get_messages (Delta polling with after_id)
            if (action === 'get_messages') {
                const convId = parseInt(req.query?.conversation_id || '0');
                const afterId = parseInt(req.query?.after_id || '0');
                const customerToken = req.query?.customer_session_token;
                if (!convId)
                    return reply.send({ success: false, error: 'conversation_id is required' });
                // Customer Isolation Guard
                if (customerToken) {
                    const conv = (0, db_js_1.dbFetchOne)('chat_conversations', { id: convId });
                    if (!conv || conv.customer_session_token !== customerToken) {
                        return reply.code(403).send({ success: false, error: 'Unauthorized access to customer conversation' });
                    }
                }
                // Merchant Isolation Guard
                if (store) {
                    const conv = (0, db_js_1.dbFetchOne)('chat_conversations', { id: convId });
                    if (!conv || conv.store_id !== store.id) {
                        return reply.code(403).send({ success: false, error: 'Unauthorized merchant access' });
                    }
                }
                const markSender = store ? 'merchant' : 'customer';
                const msgs = (0, chatService_js_1.getConversationMessages)(convId, afterId, markSender);
                return reply.send({ success: true, messages: msgs });
            }
            // Action: merchant_list_conversations
            if (action === 'merchant_list_conversations') {
                if (!store)
                    return reply.code(401).send({ success: false, error: 'Unauthorized' });
                const search = req.query?.search || '';
                const list = (0, chatService_js_1.listMerchantConversations)(store.id, search);
                return reply.send({
                    success: true,
                    conversations: list.conversations,
                    total_unread_count: list.total_unread
                });
            }
            // Action: merchant_get_unread_count
            if (action === 'merchant_get_unread_count') {
                if (!store)
                    return reply.code(401).send({ success: false, error: 'Unauthorized' });
                const list = (0, chatService_js_1.listMerchantConversations)(store.id);
                return reply.send({ success: true, unread_count: list.total_unread, total_unread: list.total_unread });
            }
            // Action: merchant_get_customer_context
            if (action === 'merchant_get_customer_context') {
                if (!store)
                    return reply.code(401).send({ success: false, error: 'Unauthorized' });
                const convId = parseInt(req.query?.conversation_id || '0');
                const context = (0, chatService_js_1.getCustomerChatContext)(convId, store.id);
                return reply.send({ success: true, ...context });
            }
            return reply.send({ success: false, error: 'Invalid chat action' });
        }
        catch (e) {
            return reply.code(500).send({ success: false, error: e.message });
        }
    };
    fastify.get('/api/chat', handleChatApi);
    fastify.post('/api/chat', handleChatApi);
    fastify.get('/api/chat.php', handleChatApi);
    fastify.post('/api/chat.php', handleChatApi);
    // Dedicated Storefront Live Chat REST Endpoints
    fastify.post('/api/chat/session', async (req, reply) => {
        try {
            const body = (req.body || {});
            const storeId = parseInt(body.store_id || '0');
            const sessionToken = body.session_token || body.customer_session_token;
            const custName = body.customer_name || 'Store Customer';
            const custPhone = body.customer_phone;
            const custEmail = body.customer_email;
            if (!storeId)
                return reply.send({ success: false, error: 'store_id is required' });
            const result = (0, chatService_js_1.getOrCreateCustomerSession)(storeId, sessionToken, custName, custPhone, custEmail);
            if (result.limit_reached) {
                return reply.send({
                    success: false,
                    limit_reached: true,
                    error: result.error,
                    usage: result.usage
                });
            }
            return reply.send({
                success: true,
                conversation_id: result.conversation.id,
                session_token: result.conversation.customer_session_token,
                conversation: result.conversation,
                usage: result.usage
            });
        }
        catch (e) {
            return reply.code(500).send({ success: false, error: e.message });
        }
    });
    // Dedicated Merchant Live Chat Monthly Usage Quota Endpoint
    fastify.get('/api/merchant/chat/usage', async (req, reply) => {
        const store = req.session?.merchantStore;
        if (!store)
            return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });
        const usage = (0, chatService_js_1.getStoreMonthlyChatUsage)(store.id);
        return reply.send({ success: true, usage });
    });
    fastify.get('/api/chat/messages', async (req, reply) => {
        try {
            let convId = parseInt(req.query?.conversation_id || '0');
            const token = req.query?.session_token || req.query?.customer_session_token;
            if (!convId && token) {
                const conv = (0, db_js_1.dbFetchOne)('chat_conversations', { customer_session_token: token });
                if (conv)
                    convId = conv.id;
            }
            const afterId = parseInt(req.query?.after_id || '0');
            if (!convId)
                return reply.send({ success: false, error: 'conversation_id is required' });
            const msgs = (0, chatService_js_1.getConversationMessages)(convId, afterId, 'customer');
            return reply.send({ success: true, messages: msgs });
        }
        catch (e) {
            return reply.code(500).send({ success: false, error: e.message });
        }
    });
    fastify.post('/api/chat/send', async (req, reply) => {
        try {
            const body = (req.body || {});
            let conversationId = parseInt(body.conversation_id || '0');
            const token = body.session_token || body.customer_session_token || body.sender_id;
            if (!conversationId && token) {
                const conv = (0, db_js_1.dbFetchOne)('chat_conversations', { customer_session_token: token });
                if (conv)
                    conversationId = conv.id;
            }
            const text = body.message_text || body.message;
            const senderType = body.sender_type || 'customer';
            const senderName = body.sender_name || 'Customer';
            if (!conversationId)
                return reply.send({ success: false, error: 'conversation_id is required' });
            if (!text)
                return reply.send({ success: false, error: 'message is required' });
            const res = (0, chatService_js_1.sendMessage)(conversationId, senderType, senderName, text, {
                orderId: body.order_id ? parseInt(body.order_id) : null,
                productId: body.product_id ? parseInt(body.product_id) : null
            });
            return reply.send(res);
        }
        catch (e) {
            return reply.code(500).send({ success: false, error: e.message });
        }
    });
    // 2. High-Performance Real-Time SSE Stream (/api/stream and /api/stream.php)
    const handleStream = async (req, reply) => {
        const channel = req.query?.channel || 'merchant';
        const store = req.session?.merchantStore;
        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.setHeader('X-Accel-Buffering', 'no');
        reply.raw.flushHeaders();
        reply.raw.write(':keepalive\n\n');
        const subscriber = {
            write: (data) => {
                try {
                    reply.raw.write(data);
                }
                catch (e) { }
            }
        };
        if (channel === 'merchant' && store) {
            chatService_js_1.realtimeHub.registerMerchantSSE(store.id, subscriber);
            req.raw.on('close', () => {
                chatService_js_1.realtimeHub.unregisterMerchantSSE(store.id, subscriber);
            });
        }
        else if (channel === 'customer') {
            const sessionToken = req.query?.customer_session_token;
            if (sessionToken) {
                chatService_js_1.realtimeHub.registerCustomerSSE(sessionToken, subscriber);
                req.raw.on('close', () => {
                    chatService_js_1.realtimeHub.unregisterCustomerSSE(sessionToken, subscriber);
                });
            }
        }
        // Keep connection alive with periodic pings every 25s
        const pingTimer = setInterval(() => {
            try {
                reply.raw.write(':keepalive\n\n');
            }
            catch (e) {
                clearInterval(pingTimer);
            }
        }, 25000);
        req.raw.on('close', () => {
            clearInterval(pingTimer);
        });
    };
    fastify.get('/api/stream', handleStream);
    fastify.get('/api/stream.php', handleStream);
}
