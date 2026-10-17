"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrder = createOrder;
exports.submitPaymentClaim = submitPaymentClaim;
exports.confirmOrderPayment = confirmOrderPayment;
exports.rejectOrderPayment = rejectOrderPayment;
exports.updateOrderStatus = updateOrderStatus;
exports.pollOrdersAndEvents = pollOrdersAndEvents;
const node_crypto_1 = __importDefault(require("node:crypto"));
const db_js_1 = require("../../db/db.js");
const helpers_js_1 = require("../../utils/helpers.js");
const chatService_js_1 = require("../chat/chatService.js");
const securityService_js_1 = require("../security/securityService.js");
const sampleTemplatesData_js_1 = require("../../config/sampleTemplatesData.js");
/**
 * Create Order with Identity Resolution & Anti-Spam Check
 */
function createOrder(input) {
    let store = (0, db_js_1.dbFetchOne)('stores', { id: input.store_id });
    if (!store) {
        const demoEntry = Object.values(sampleTemplatesData_js_1.SAMPLE_STORES_DATA).find(s => s.store.id === input.store_id);
        if (demoEntry) {
            try {
                (0, db_js_1.dbInsert)('stores', {
                    id: demoEntry.store.id,
                    slug: demoEntry.store.slug,
                    store_name: demoEntry.store.store_name,
                    owner_name: 'Demo Merchant',
                    email: `${demoEntry.store.slug}@demo.zlik.store`,
                    whatsapp_number: '+2348000000000',
                    plan_tier: 'pro',
                    status: 'active',
                    is_verified: 1,
                    allow_bank_transfer: 1,
                    allow_pay_on_delivery: 1,
                    delivery_fee: demoEntry.store.delivery_fee || 0,
                    template_slug: demoEntry.store.template_slug
                });
                const seller = (0, securityService_js_1.getOrCreateSellerProfile)(demoEntry.store.id);
                if (seller) {
                    (0, db_js_1.dbUpdate)('seller_profiles', { order_gating_enabled: 0, composite_verification_status: 'verified' }, { id: seller.id });
                }
                for (const item of demoEntry.items) {
                    try {
                        (0, db_js_1.dbInsert)('items', {
                            id: item.id,
                            store_id: demoEntry.store.id,
                            title: item.title,
                            price: item.price,
                            category: item.category,
                            image_url: item.image_url,
                            is_available: 1
                        });
                    }
                    catch (e) { }
                }
                store = (0, db_js_1.dbFetchOne)('stores', { id: input.store_id });
            }
            catch (e) {
                store = (0, db_js_1.dbFetchOne)('stores', { id: input.store_id });
            }
        }
    }
    if (!store)
        return { success: false, error: 'Store not found' };
    // Storefront Gating Enforcement (Batch 6)
    if ((0, securityService_js_1.isStoreOrderGated)(input.store_id)) {
        return {
            success: false,
            error: 'This storefront is currently undergoing seller identity verification and is not yet authorized to accept customer orders or bank transfers.',
            is_gated: true
        };
    }
    const paymentMethod = input.payment_method || 'bank_transfer';
    if (paymentMethod === 'bank_transfer' && store.allow_bank_transfer === 0) {
        return { success: false, error: 'Direct Bank Transfer is not accepted by this store.' };
    }
    if (paymentMethod === 'pay_on_delivery' && store.allow_pay_on_delivery === 0) {
        return { success: false, error: 'Pay on delivery is not accepted by this store.' };
    }
    if (!input.customer_name?.trim())
        return { success: false, error: 'Customer name is required' };
    if (!input.customer_phone?.trim())
        return { success: false, error: 'Customer phone number is required' };
    if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
        return { success: false, error: 'Cart is empty' };
    }
    // 1. Anti-Spam Open-Order Check (bypassable if customer explicitly chooses to continue)
    if (!input.force_create) {
        const openCheck = (0, helpers_js_1.checkCustomerOpenOrdersLimit)(input.store_id, input.customer_phone);
        if (!openCheck.allowed) {
            return {
                success: false,
                error: 'You have active unfulfilled orders. Please complete or track your existing order.',
                open_orders_exceeded: true,
                existing_orders: openCheck.open_orders
            };
        }
    }
    // 2. Resolve Customer Profile
    const customer = (0, helpers_js_1.resolveOrCreateCustomer)(input.store_id, input.customer_phone, input.customer_name, input.customer_email, input.delivery_address);
    // 3. Authoritative Price & Item Snapshot Calculation
    let subtotal = 0;
    const processedItems = [];
    for (const rawItem of input.items) {
        const qty = Math.max(1, parseInt(String(rawItem.quantity) || '1'));
        let unitPrice = Math.max(0, parseFloat(String(rawItem.price) || '0'));
        let itemTitle = rawItem.title || 'Product Item';
        let imageUrl = rawItem.image_url || null;
        let category = 'General';
        let basePrice = unitPrice;
        let selectedVariant = null;
        let selectedOptionsSnapshot = [];
        // If item ID is supplied, authoritatively look up product from database
        if (rawItem.id) {
            const dbItem = (0, db_js_1.dbFetchOne)('items', { id: rawItem.id, store_id: input.store_id });
            if (dbItem) {
                itemTitle = dbItem.title;
                imageUrl = dbItem.image_url || imageUrl;
                category = dbItem.category || 'General';
                basePrice = parseFloat(dbItem.price || 0);
                unitPrice = basePrice;
                // Parse variants if product has them
                let variantsList = [];
                try {
                    if (dbItem.variants_json) {
                        variantsList = typeof dbItem.variants_json === 'string' ? JSON.parse(dbItem.variants_json) : dbItem.variants_json;
                    }
                }
                catch (e) { }
                // Match selected variant
                const variantIdentifier = rawItem.variant || rawItem.variant_name || rawItem.variant_id;
                if (variantIdentifier && Array.isArray(variantsList) && variantsList.length > 0) {
                    const matched = variantsList.find((v) => v.id === variantIdentifier ||
                        v.name === variantIdentifier ||
                        v.title === variantIdentifier ||
                        v.sku === variantIdentifier ||
                        `${v.size || ''} ${v.color || ''}`.trim() === String(variantIdentifier).trim());
                    if (matched) {
                        selectedVariant = matched;
                        if (matched.price !== undefined && matched.price !== null && !isNaN(parseFloat(matched.price)) && parseFloat(matched.price) > 0) {
                            unitPrice = parseFloat(matched.price);
                        }
                        if (matched.image_url) {
                            imageUrl = matched.image_url;
                        }
                    }
                }
                // Parse option groups (e.g. food meal options, extras, sides)
                let optionGroupsList = [];
                try {
                    if (dbItem.option_groups_json) {
                        optionGroupsList = typeof dbItem.option_groups_json === 'string' ? JSON.parse(dbItem.option_groups_json) : dbItem.option_groups_json;
                    }
                }
                catch (e) { }
                const selectedOptions = rawItem.selected_options || rawItem.options || rawItem.addons || [];
                if (Array.isArray(selectedOptions) && Array.isArray(optionGroupsList)) {
                    for (const opt of selectedOptions) {
                        const optName = typeof opt === 'string' ? opt : (opt.name || opt.title || opt.option_name);
                        const optGroup = typeof opt === 'object' ? (opt.group || opt.group_name) : null;
                        // Find option in groups to get verified extra charge
                        let extraPrice = 0;
                        for (const group of optionGroupsList) {
                            if (optGroup && group.name !== optGroup)
                                continue;
                            const foundOption = (group.options || []).find((o) => o.name === optName || o.title === optName || o.id === opt.id);
                            if (foundOption) {
                                extraPrice = parseFloat(foundOption.price || 0);
                                selectedOptionsSnapshot.push({
                                    group: group.name,
                                    name: foundOption.name || foundOption.title,
                                    price: extraPrice
                                });
                                break;
                            }
                        }
                        if (extraPrice === 0 && typeof opt === 'object' && opt.price) {
                            // Fallback to submitted option price if specified
                            extraPrice = parseFloat(opt.price || 0);
                            selectedOptionsSnapshot.push({
                                group: optGroup || 'Custom Option',
                                name: optName,
                                price: extraPrice
                            });
                        }
                        unitPrice += extraPrice;
                    }
                }
            }
        }
        else {
            // Direct item without DB item record (e.g. custom or test item)
            if (rawItem.variant) {
                selectedVariant = { name: rawItem.variant };
            }
            if (rawItem.addons && Array.isArray(rawItem.addons)) {
                selectedOptionsSnapshot = rawItem.addons.map((a) => typeof a === 'string' ? { name: a, price: 0 } : a);
            }
        }
        const itemTotal = unitPrice * qty;
        subtotal += itemTotal;
        processedItems.push({
            id: rawItem.id || null,
            title: itemTitle,
            category: category,
            base_price: basePrice,
            unit_price: unitPrice,
            quantity: qty,
            total: itemTotal,
            variant: selectedVariant?.name || selectedVariant?.title || rawItem.variant || null,
            variant_details: selectedVariant,
            selected_options: selectedOptionsSnapshot,
            notes: rawItem.notes || rawItem.prep_notes || null,
            image_url: imageUrl
        });
    }
    // 3.1 Calculate Discount (if coupon code provided)
    let discountAmount = Math.max(0, parseFloat(String(input.discount_amount || 0)));
    let discountCode = input.discount_code ? input.discount_code.trim().toUpperCase() : null;
    if (discountCode) {
        const coupon = (0, db_js_1.dbFetchOne)('coupons', { store_id: input.store_id, code: discountCode, status: 'active' });
        if (coupon) {
            if (coupon.discount_type === 'percentage') {
                discountAmount = Math.round(((subtotal * coupon.discount_value) / 100) * 100) / 100;
            }
            else {
                discountAmount = Math.min(coupon.discount_value, subtotal);
            }
            (0, db_js_1.dbUpdate)('coupons', { uses_count: (coupon.uses_count || 0) + 1 }, { id: coupon.id });
        }
        else {
            discountCode = null;
            discountAmount = 0;
        }
    }
    const deliveryFee = input.fulfillment_type === 'pickup' ? 0 : Math.max(0, parseFloat(String(input.delivery_fee || 0)));
    const totalAmount = Math.max(0, subtotal - discountAmount) + deliveryFee;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const orderRef = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    const orderToken = node_crypto_1.default.randomBytes(16).toString('hex');
    const verificationHash = node_crypto_1.default.createHash('sha256').update(orderRef + orderToken + String(totalAmount)).digest('hex').substring(0, 12);
    const orderId = (0, db_js_1.dbInsert)('orders', {
        store_id: input.store_id,
        order_ref: orderRef,
        order_token: orderToken,
        customer_id: customer ? customer.id : null,
        customer_name: input.customer_name.trim(),
        customer_phone: input.customer_phone.trim(),
        customer_email: input.customer_email ? input.customer_email.toLowerCase().trim() : null,
        delivery_address: input.fulfillment_type === 'pickup' ? 'In-Store Pickup' : (input.delivery_address?.trim() || ''),
        fulfillment_type: input.fulfillment_type || 'delivery',
        items_json: JSON.stringify(processedItems),
        subtotal: subtotal,
        delivery_fee: deliveryFee,
        discount_code: discountCode,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        payment_method: paymentMethod,
        payment_proof_ref: paymentMethod === 'bank_transfer' && (input.payment_confirmed || input.receipt_url || input.payment_proof_ref)
            ? (input.payment_proof_ref?.trim() || 'Direct Transfer Confirmed')
            : (paymentMethod === 'pay_on_delivery' ? 'Pay on Delivery' : null),
        receipt_url: input.receipt_url || null,
        payment_status: paymentMethod === 'bank_transfer' && (input.payment_confirmed || input.receipt_url || input.payment_proof_ref)
            ? 'claimed'
            : 'unpaid',
        order_status: 'pending',
        notes: input.notes?.trim() || null,
        verification_hash: verificationHash,
        created_at: now,
        updated_at: now
    });
    // If customer confirmed transfer payment upfront, automatically create a payment claim
    if (paymentMethod === 'bank_transfer' && (input.payment_confirmed || input.receipt_url || input.payment_proof_ref)) {
        try {
            const claimProof = input.payment_proof_ref?.trim() || 'Direct Transfer Confirmed';
            (0, db_js_1.dbInsert)('payment_claims', {
                order_id: orderId,
                store_id: input.store_id,
                customer_id: customer ? customer.id : null,
                amount: totalAmount,
                payment_reference: claimProof,
                receipt_url: input.receipt_url || null,
                status: 'claimed',
                claimed_at: now,
                created_at: now
            });
        }
        catch (e) { }
    }
    const newOrder = (0, db_js_1.dbFetchOne)('orders', { id: orderId });
    // 4. Emit Notification Event for Merchant Audio Chime Alert
    try {
        (0, db_js_1.dbInsert)('notification_events', {
            store_id: input.store_id,
            event_type: 'new_order',
            event_reference: `order_${orderId}`,
            title: `New Order #${orderRef}`,
            message: `${input.customer_name} placed an order for ₦${totalAmount.toLocaleString('en-US')}`,
            data_json: JSON.stringify({ order_id: orderId, order_ref: orderRef, total: totalAmount }),
            is_read: 0,
            created_at: now
        });
    }
    catch (e) { }
    // 5. Broadcast to Merchant in Real-Time
    chatService_js_1.realtimeHub.broadcastToMerchant(input.store_id, 'notification', {
        store_id: input.store_id,
        event_type: 'new_order',
        event_reference: `order_${orderId}`,
        title: `New Order #${orderRef}`,
        message: `${input.customer_name} placed an order for ₦${totalAmount.toLocaleString('en-US')}`
    });
    return { success: true, order: newOrder, order_token: orderToken };
}
/**
 * Submit Payment Claim with Duplicate Click Deduplication
 */
function submitPaymentClaim(orderId, reference, receiptUrl) {
    const order = (0, db_js_1.dbFetchOne)('orders', { id: orderId });
    if (!order)
        return { success: false, error: 'Order not found' };
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    // Idempotency: Check if claim already submitted for this order
    const existingClaim = (0, db_js_1.dbFetchOne)('payment_claims', { order_id: orderId });
    if (existingClaim) {
        return { success: true, claim: existingClaim, duplicate: true };
    }
    const claimId = (0, db_js_1.dbInsert)('payment_claims', {
        order_id: orderId,
        store_id: order.store_id,
        customer_id: order.customer_id || null,
        amount: order.total_amount,
        payment_reference: reference?.trim() || 'Direct Transfer',
        receipt_url: receiptUrl || null,
        status: 'claimed',
        claimed_at: now,
        created_at: now
    });
    (0, db_js_1.dbUpdate)('orders', {
        payment_status: 'claimed',
        payment_proof_ref: reference?.trim() || 'Direct Transfer',
        updated_at: now
    }, { id: orderId });
    // Emit Notification Event
    try {
        (0, db_js_1.dbInsert)('notification_events', {
            store_id: order.store_id,
            event_type: 'payment_claim',
            event_reference: `claim_${claimId}`,
            title: `Payment Claimed for #${order.order_ref}`,
            message: `${order.customer_name} claimed bank transfer: ${reference}`,
            data_json: JSON.stringify({ order_id: orderId, claim_id: claimId }),
            is_read: 0,
            created_at: now
        });
    }
    catch (e) { }
    chatService_js_1.realtimeHub.broadcastToMerchant(order.store_id, 'notification', {
        store_id: order.store_id,
        event_type: 'payment_claim',
        event_reference: `claim_${claimId}`,
        title: `Payment Claimed for #${order.order_ref}`,
        message: `${order.customer_name} claimed bank transfer: ${reference}`
    });
    const newClaim = (0, db_js_1.dbFetchOne)('payment_claims', { id: claimId });
    return { success: true, claim: newClaim };
}
/**
 * Confirm Order Payment (Merchant Action)
 */
function confirmOrderPayment(orderId, storeId) {
    const order = (0, db_js_1.dbFetchOne)('orders', { id: orderId, store_id: storeId });
    if (!order)
        return { success: false, error: 'Order not found' };
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    (0, db_js_1.dbUpdate)('orders', {
        payment_status: 'paid',
        order_status: 'confirmed',
        updated_at: now
    }, { id: orderId });
    (0, db_js_1.dbUpdate)('payment_claims', { status: 'confirmed' }, { order_id: orderId });
    // Increment customer lifetime metrics
    if (order.customer_id) {
        const cust = (0, db_js_1.dbFetchOne)('customers', { id: order.customer_id });
        if (cust) {
            (0, db_js_1.dbUpdate)('customers', {
                total_orders: (cust.total_orders || 0) + 1,
                total_spent: (cust.total_spent || 0) + parseFloat(order.total_amount || 0),
                last_order_at: now,
                updated_at: now
            }, { id: cust.id });
        }
    }
    return { success: true };
}
/**
 * Reject Order Payment Claim (Merchant Action)
 */
function rejectOrderPayment(orderId, storeId) {
    const order = (0, db_js_1.dbFetchOne)('orders', { id: orderId, store_id: storeId });
    if (!order)
        return { success: false, error: 'Order not found' };
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    (0, db_js_1.dbUpdate)('orders', { payment_status: 'unpaid', updated_at: now }, { id: orderId });
    (0, db_js_1.dbUpdate)('payment_claims', { status: 'rejected' }, { order_id: orderId });
    return { success: true };
}
/**
 * Update Order Status
 */
function updateOrderStatus(orderId, storeId, newStatus) {
    const valid = ['pending', 'confirmed', 'dispatched', 'completed', 'cancelled'];
    if (!valid.includes(newStatus))
        return { success: false, error: 'Invalid order status' };
    const order = (0, db_js_1.dbFetchOne)('orders', { id: orderId, store_id: storeId });
    if (!order)
        return { success: false, error: 'Order not found' };
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    (0, db_js_1.dbUpdate)('orders', { order_status: newStatus, updated_at: now }, { id: orderId });
    return { success: true };
}
/**
 * Delta Polling for Orders and Events
 */
function pollOrdersAndEvents(storeId, sinceOrderId = 0, sinceEventId = 0) {
    const db = (0, db_js_1.getDb)();
    // New orders
    const newOrders = db.prepare('SELECT id FROM orders WHERE store_id = ? AND id > ? ORDER BY id DESC').all(storeId, sinceOrderId);
    const latestOrderId = newOrders.length > 0 ? Number(newOrders[0].id) : sinceOrderId;
    // New events
    const newEvents = db.prepare('SELECT * FROM notification_events WHERE store_id = ? AND id > ? ORDER BY id ASC').all(storeId, sinceEventId);
    const latestEventId = newEvents.length > 0 ? Number(newEvents[newEvents.length - 1].id) : sinceEventId;
    return {
        has_new: newOrders.length > 0,
        latest_id: latestOrderId,
        new_events: newEvents,
        latest_event_id: latestEventId
    };
}
