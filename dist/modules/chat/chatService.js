"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.realtimeHub = void 0;
exports.getStoreMonthlyChatUsage = getStoreMonthlyChatUsage;
exports.getOrCreateCustomerSession = getOrCreateCustomerSession;
exports.sendMessage = sendMessage;
exports.getConversationMessages = getConversationMessages;
exports.listMerchantConversations = listMerchantConversations;
exports.getCustomerChatContext = getCustomerChatContext;
const db_js_1 = require("../../db/db.js");
const helpers_js_1 = require("../../utils/helpers.js");
class RealtimeHub {
    merchantSockets = new Map();
    customerSockets = new Map();
    merchantSSESubs = new Map();
    customerSSESubs = new Map();
    // Register Merchant WebSocket
    registerMerchantWS(storeId, ws) {
        if (!this.merchantSockets.has(storeId)) {
            this.merchantSockets.set(storeId, new Set());
        }
        this.merchantSockets.get(storeId).add(ws);
    }
    unregisterMerchantWS(storeId, ws) {
        const set = this.merchantSockets.get(storeId);
        if (set) {
            set.delete(ws);
            if (set.size === 0)
                this.merchantSockets.delete(storeId);
        }
    }
    // Register Customer WebSocket
    registerCustomerWS(sessionToken, ws) {
        if (!this.customerSockets.has(sessionToken)) {
            this.customerSockets.set(sessionToken, new Set());
        }
        this.customerSockets.get(sessionToken).add(ws);
    }
    unregisterCustomerWS(sessionToken, ws) {
        const set = this.customerSockets.get(sessionToken);
        if (set) {
            set.delete(ws);
            if (set.size === 0)
                this.customerSockets.delete(sessionToken);
        }
    }
    // Register Merchant SSE
    registerMerchantSSE(storeId, sub) {
        if (!this.merchantSSESubs.has(storeId)) {
            this.merchantSSESubs.set(storeId, new Set());
        }
        this.merchantSSESubs.get(storeId).add(sub);
    }
    unregisterMerchantSSE(storeId, sub) {
        const set = this.merchantSSESubs.get(storeId);
        if (set) {
            set.delete(sub);
            if (set.size === 0)
                this.merchantSSESubs.delete(storeId);
        }
    }
    // Register Customer SSE
    registerCustomerSSE(sessionToken, sub) {
        if (!this.customerSSESubs.has(sessionToken)) {
            this.customerSSESubs.set(sessionToken, new Set());
        }
        this.customerSSESubs.get(sessionToken).add(sub);
    }
    unregisterCustomerSSE(sessionToken, sub) {
        const set = this.customerSSESubs.get(sessionToken);
        if (set) {
            set.delete(sub);
            if (set.size === 0)
                this.customerSSESubs.delete(sessionToken);
        }
    }
    // Instant In-Memory Broadcast to Merchant (0.05ms)
    broadcastToMerchant(storeId, event, payload) {
        const dataStr = JSON.stringify(payload);
        // WebSockets
        const wsSet = this.merchantSockets.get(storeId);
        if (wsSet) {
            const msg = JSON.stringify({ event, data: payload });
            for (const ws of wsSet) {
                try {
                    ws.send(msg);
                }
                catch (e) { }
            }
        }
        // SSE
        const sseSet = this.merchantSSESubs.get(storeId);
        if (sseSet) {
            const sseMsg = `event: ${event}\ndata: ${dataStr}\n\n`;
            for (const sub of sseSet) {
                try {
                    sub.write(sseMsg);
                }
                catch (e) { }
            }
        }
    }
    // Instant In-Memory Broadcast to Customer (0.05ms)
    broadcastToCustomer(sessionToken, event, payload) {
        const dataStr = JSON.stringify(payload);
        // WebSockets
        const wsSet = this.customerSockets.get(sessionToken);
        if (wsSet) {
            const msg = JSON.stringify({ event, data: payload });
            for (const ws of wsSet) {
                try {
                    ws.send(msg);
                }
                catch (e) { }
            }
        }
        // SSE
        const sseSet = this.customerSSESubs.get(sessionToken);
        if (sseSet) {
            const sseMsg = `event: ${event}\ndata: ${dataStr}\n\n`;
            for (const sub of sseSet) {
                try {
                    sub.write(sseMsg);
                }
                catch (e) { }
            }
        }
    }
}
exports.realtimeHub = new RealtimeHub();
/**
 * Calculate store's monthly live chat usage and enforce tier quotas
 * (Free: 20 new conversations/month; Pro & Business: Unlimited)
 */
function getStoreMonthlyChatUsage(storeId) {
    const db = (0, db_js_1.getDb)();
    const store = (0, db_js_1.dbFetchOne)('stores', { id: storeId });
    const planDetails = (0, helpers_js_1.getStorePlanDetails)(store);
    const tier = planDetails.tier;
    const isUnlimited = planDetails.isPro || planDetails.isBusiness || tier === 'enterprise';
    const limit = isUnlimited ? -1 : 20;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    // Calendar month boundary: 'YYYY-MM-01 00:00:00'
    const monthStartIso = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01 00:00:00`;
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    const resetDateIso = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01 00:00:00`;
    let used = 0;
    try {
        const row = db.prepare(`
      SELECT COUNT(*) as count 
      FROM chat_conversations 
      WHERE store_id = ? AND created_at >= ?
    `).get(storeId, monthStartIso);
        used = row ? Number(row.count) : 0;
    }
    catch (e) {
        used = 0;
    }
    const isExhausted = !isUnlimited && used >= limit;
    const remaining = isUnlimited ? -1 : Math.max(0, limit - used);
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthLabel = `${monthNames[now.getMonth()]} ${currentYear}`;
    return {
        store_id: storeId,
        tier,
        limit,
        used_this_month: used,
        remaining,
        is_exhausted: isExhausted,
        month_label: monthLabel,
        reset_date_iso: resetDateIso
    };
}
/**
 * Initialize or get Customer Chat Session
 * If store is on Free tier and has reached 20 new conversations for current calendar month,
 * creation of new conversations is blocked with clear upgrade notification.
 */
function getOrCreateCustomerSession(storeId, sessionToken, customerName, customerPhone, customerEmail) {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    let token = sessionToken?.trim();
    if (token) {
        const existing = (0, db_js_1.dbFetchOne)('chat_conversations', {
            store_id: storeId,
            customer_session_token: token
        });
        if (existing) {
            // Update customer info if provided - existing conversations NEVER consume new quota
            const updates = {};
            if (customerName && customerName !== existing.customer_name)
                updates.customer_name = customerName;
            if (customerPhone && customerPhone !== existing.customer_phone)
                updates.customer_phone = customerPhone;
            if (customerEmail && customerEmail !== existing.customer_email)
                updates.customer_email = customerEmail;
            if (Object.keys(updates).length > 0) {
                updates.updated_at = now;
                (0, db_js_1.dbUpdate)('chat_conversations', updates, { id: existing.id });
                return { conversation: { ...existing, ...updates }, isNew: false, usage: getStoreMonthlyChatUsage(storeId) };
            }
            return { conversation: existing, isNew: false, usage: getStoreMonthlyChatUsage(storeId) };
        }
    }
    // Before creating a NEW conversation, check if store has exhausted monthly chat allowance
    const usage = getStoreMonthlyChatUsage(storeId);
    if (usage.is_exhausted) {
        return {
            conversation: null,
            isNew: false,
            limit_reached: true,
            error: 'This store has reached its free monthly live chat limit (20 new chats). Please contact the store via WhatsApp.',
            usage
        };
    }
    // Generate new token
    if (!token) {
        token = 'cs_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    }
    const cleanName = customerName?.trim() || 'Shopper ' + Math.floor(1000 + Math.random() * 9000);
    const convId = (0, db_js_1.dbInsert)('chat_conversations', {
        store_id: storeId,
        customer_session_token: token,
        customer_name: cleanName,
        customer_phone: customerPhone?.trim() || null,
        customer_email: customerEmail?.trim() || null,
        last_message_preview: 'Conversation started',
        last_message_at: now,
        unread_merchant_count: 0,
        unread_customer_count: 0,
        status: 'active',
        created_at: now,
        updated_at: now
    });
    // Seed welcome system message
    const welcomeMsg = '👋 Hello! Welcome to our store. How can we help you today? Feel free to ask about products, orders, or delivery!';
    (0, db_js_1.dbInsert)('chat_messages', {
        conversation_id: convId,
        store_id: storeId,
        sender_type: 'system',
        sender_name: 'Store Assistant',
        message: welcomeMsg,
        is_read: 1,
        created_at: now
    });
    const newConv = (0, db_js_1.dbFetchOne)('chat_conversations', { id: convId });
    const updatedUsage = getStoreMonthlyChatUsage(storeId);
    return { conversation: newConv, isNew: true, usage: updatedUsage };
}
/**
 * Send Chat Message with Idempotency and Real-Time Push
 */
function sendMessage(conversationId, senderType, senderName, messageText, options = {}) {
    const text = messageText?.trim();
    if (!text)
        return { success: false, error: 'Message text cannot be empty' };
    const conv = (0, db_js_1.dbFetchOne)('chat_conversations', { id: conversationId });
    if (!conv)
        return { success: false, error: 'Conversation not found' };
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    // Idempotency check: deduplicate if same key sent within recent window
    if (options.idempotencyKey) {
        const existing = (0, db_js_1.dbFetchOne)('chat_messages', {
            conversation_id: conversationId,
            idempotency_key: options.idempotencyKey
        });
        if (existing) {
            return { success: true, message: existing, conversation: conv, duplicate: true };
        }
    }
    const msgId = (0, db_js_1.dbInsert)('chat_messages', {
        conversation_id: conversationId,
        store_id: conv.store_id,
        sender_type: senderType,
        sender_name: senderName,
        message: text,
        order_id: options.orderId || null,
        product_id: options.productId || null,
        product_title: options.productTitle || null,
        is_read: 0,
        idempotency_key: options.idempotencyKey || null,
        created_at: now
    });
    const preview = text.length > 80 ? text.substring(0, 77) + '...' : text;
    const updates = {
        last_message_preview: preview,
        last_message_at: now,
        updated_at: now
    };
    if (senderType === 'customer') {
        updates.unread_merchant_count = (conv.unread_merchant_count || 0) + 1;
    }
    else {
        updates.unread_customer_count = (conv.unread_customer_count || 0) + 1;
        updates.unread_merchant_count = 0; // Merchant replied, reset merchant unread
    }
    (0, db_js_1.dbUpdate)('chat_conversations', updates, { id: conv.id });
    const updatedConv = (0, db_js_1.dbFetchOne)('chat_conversations', { id: conv.id });
    const newMsg = (0, db_js_1.dbFetchOne)('chat_messages', { id: msgId });
    // Emit Notification Event for sound alerts if customer sent message
    if (senderType === 'customer') {
        try {
            (0, db_js_1.dbInsert)('notification_events', {
                store_id: conv.store_id,
                event_type: 'chat_message',
                event_reference: `chat_${conv.id}_${msgId}`,
                title: conv.customer_name || 'Customer Message',
                message: text,
                data_json: JSON.stringify({ conversation_id: conv.id, message_id: msgId }),
                is_read: 0,
                created_at: now
            });
        }
        catch (e) { }
        // Push real-time to merchant
        exports.realtimeHub.broadcastToMerchant(conv.store_id, 'chat_message', newMsg);
        exports.realtimeHub.broadcastToMerchant(conv.store_id, 'notification', {
            store_id: conv.store_id,
            event_type: 'chat_message',
            event_reference: `chat_${conv.id}_${msgId}`,
            title: conv.customer_name,
            message: text
        });
    }
    else {
        // Merchant reply -> push real-time to customer
        exports.realtimeHub.broadcastToCustomer(conv.customer_session_token, 'chat_message', newMsg);
    }
    return { success: true, message: newMsg, conversation: updatedConv };
}
/**
 * Get Messages for a Conversation (with Delta Polling support)
 */
function getConversationMessages(conversationId, afterId = 0, markAsReadSender) {
    const db = (0, db_js_1.getDb)();
    let sql = 'SELECT * FROM chat_messages WHERE conversation_id = ?';
    const params = [conversationId];
    if (afterId > 0) {
        sql += ' AND id > ?';
        params.push(afterId);
    }
    sql += ' ORDER BY id ASC LIMIT 200';
    const stmt = db.prepare(sql);
    const messages = stmt.all(...params) || [];
    // Mark as read
    if (markAsReadSender) {
        const oppSender = markAsReadSender === 'merchant' ? 'customer' : 'merchant';
        db.exec(`UPDATE chat_messages SET is_read = 1 WHERE conversation_id = ${conversationId} AND sender_type = '${oppSender}' AND is_read = 0`);
        if (markAsReadSender === 'merchant') {
            db.exec(`UPDATE chat_conversations SET unread_merchant_count = 0 WHERE id = ${conversationId}`);
        }
        else {
            db.exec(`UPDATE chat_conversations SET unread_customer_count = 0 WHERE id = ${conversationId}`);
        }
    }
    return messages;
}
/**
 * List Merchant Conversations with Customer Order Aggregations
 */
function listMerchantConversations(storeId, search = '') {
    const db = (0, db_js_1.getDb)();
    let sql = `
    SELECT 
      c.*,
      COUNT(DISTINCT o.id) AS total_orders_count,
      COALESCE(SUM(CASE WHEN o.order_status IN ('confirmed','completed','dispatched') THEN o.total_amount ELSE 0 END), 0) AS customer_total_spent
    FROM chat_conversations c
    LEFT JOIN orders o ON o.store_id = c.store_id AND (o.customer_phone = c.customer_phone OR (c.customer_phone IS NOT NULL AND o.customer_phone LIKE '%' || SUBSTR(c.customer_phone, -10)))
    WHERE c.store_id = ?
  `;
    const params = [storeId];
    if (search.trim()) {
        sql += ' AND (c.customer_name LIKE ? OR c.customer_phone LIKE ? OR c.last_message_preview LIKE ?)';
        const query = `%${search.trim()}%`;
        params.push(query, query, query);
    }
    sql += ' GROUP BY c.id ORDER BY c.last_message_at DESC LIMIT 100';
    const stmt = db.prepare(sql);
    const convs = stmt.all(...params) || [];
    const unreadRow = db.prepare('SELECT COALESCE(SUM(unread_merchant_count), 0) as total FROM chat_conversations WHERE store_id = ?').get(storeId);
    const totalUnread = unreadRow ? Number(unreadRow.total) : 0;
    return { conversations: convs, total_unread: totalUnread };
}
/**
 * Get Customer Order Context for Sidebar in Merchant Live Chat
 */
function getCustomerChatContext(conversationId, storeId) {
    const conv = (0, db_js_1.dbFetchOne)('chat_conversations', { id: conversationId, store_id: storeId });
    if (!conv)
        return { customer: null, orders: [] };
    const phoneNorm = conv.customer_phone ? (0, helpers_js_1.normalizePhoneNumber)(conv.customer_phone) : '';
    let customerProfile = phoneNorm ? (0, db_js_1.dbFetchOne)('customers', { store_id: storeId, phone_normalized: phoneNorm }) : null;
    // Retrieve customer orders
    const allOrders = (0, db_js_1.dbFetchAll)('orders', { store_id: storeId }, 'id DESC');
    const matchingOrders = allOrders.filter(o => {
        if (!conv.customer_phone)
            return false;
        const oNorm = (0, helpers_js_1.normalizePhoneNumber)(o.customer_phone);
        return oNorm === phoneNorm || (phoneNorm && oNorm.endsWith(phoneNorm.slice(-10)));
    });
    const totalSpent = matchingOrders
        .filter(o => ['confirmed', 'completed', 'dispatched'].includes(o.order_status))
        .reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
    const customerData = {
        name: conv.customer_name,
        phone: conv.customer_phone,
        email: conv.customer_email,
        total_orders: matchingOrders.length,
        total_spent: totalSpent
    };
    return { customer: customerData, orders: matchingOrders.slice(0, 10) };
}
