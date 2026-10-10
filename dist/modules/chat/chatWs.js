"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatWebSocketRoutes = chatWebSocketRoutes;
const ws_1 = require("ws");
const chatService_js_1 = require("./chatService.js");
async function chatWebSocketRoutes(fastify) {
    fastify.get('/ws/chat', { websocket: true }, (socket, req) => {
        let authRole = null;
        let authStoreId = null;
        let authSessionToken = null;
        let activeConversationId = null;
        const wsClient = {
            send: (data) => {
                if (socket.readyState === ws_1.WebSocket.OPEN) {
                    try {
                        socket.send(data);
                    }
                    catch (e) { }
                }
            }
        };
        socket.on('message', (raw) => {
            try {
                const payload = JSON.parse(raw.toString());
                // 1. Auth Handshake
                if (payload.type === 'auth') {
                    if (payload.role === 'merchant' && payload.store_id) {
                        authRole = 'merchant';
                        authStoreId = parseInt(payload.store_id);
                        chatService_js_1.realtimeHub.registerMerchantWS(authStoreId, wsClient);
                        wsClient.send(JSON.stringify({ type: 'authenticated', role: 'merchant', store_id: authStoreId }));
                    }
                    else if (payload.role === 'customer' && payload.session_token) {
                        authRole = 'customer';
                        const token = String(payload.session_token);
                        authSessionToken = token;
                        chatService_js_1.realtimeHub.registerCustomerWS(token, wsClient);
                        wsClient.send(JSON.stringify({ type: 'authenticated', role: 'customer', session_token: token }));
                    }
                    return;
                }
                // 2. Direct Instant Message Submission via WebSocket (< 1ms delivery)
                if (payload.type === 'send_message') {
                    const convId = parseInt(payload.conversation_id || '0');
                    const text = payload.message;
                    const senderType = payload.sender_type || (authRole === 'merchant' ? 'merchant' : 'customer');
                    const senderName = payload.sender_name || (senderType === 'merchant' ? 'Merchant' : 'Customer');
                    if (!convId || !text)
                        return;
                    const res = (0, chatService_js_1.sendMessage)(convId, senderType, senderName, text, {
                        orderId: payload.order_id,
                        productId: payload.product_id,
                        productTitle: payload.product_title,
                        idempotencyKey: payload.idempotency_key
                    });
                    wsClient.send(JSON.stringify({ type: 'message_ack', ...res }));
                    return;
                }
                // 3. Select Active Conversation (Merchant or Customer)
                if (payload.type === 'select_conversation') {
                    activeConversationId = parseInt(payload.conversation_id || '0');
                    return;
                }
                // 4. In-Memory Typing Indicator (0.05ms)
                if (payload.type === 'typing') {
                    const convId = parseInt(payload.conversation_id || '0');
                    const isTyping = Boolean(payload.is_typing);
                    if (authRole === 'merchant' && authStoreId && payload.customer_session_token) {
                        chatService_js_1.realtimeHub.broadcastToCustomer(payload.customer_session_token, 'typing', {
                            conversation_id: convId,
                            is_typing: isTyping,
                            sender_name: payload.sender_name || 'Store'
                        });
                    }
                    else if (authRole === 'customer' && payload.store_id) {
                        chatService_js_1.realtimeHub.broadcastToMerchant(parseInt(payload.store_id), 'typing', {
                            conversation_id: convId,
                            is_typing: isTyping,
                            sender_name: payload.sender_name || 'Customer'
                        });
                    }
                    return;
                }
                // 5. Keepalive Ping
                if (payload.type === 'ping') {
                    wsClient.send(JSON.stringify({ type: 'pong' }));
                }
            }
            catch (err) { }
        });
        socket.on('close', () => {
            if (authRole === 'merchant' && authStoreId) {
                chatService_js_1.realtimeHub.unregisterMerchantWS(authStoreId, wsClient);
            }
            else if (authRole === 'customer' && authSessionToken) {
                chatService_js_1.realtimeHub.unregisterCustomerWS(authSessionToken, wsClient);
            }
        });
    });
}
