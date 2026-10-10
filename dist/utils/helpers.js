"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NIGERIAN_STATES = exports.STORE_MARKETPLACE_CATEGORIES = exports.RESERVED_USERNAMES = void 0;
exports.normalizePhoneNumber = normalizePhoneNumber;
exports.formatCurrency = formatCurrency;
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.comparePassword = comparePassword;
exports.getPlatformSettings = getPlatformSettings;
exports.getEffectivePlans = getEffectivePlans;
exports.getStorePlanDetails = getStorePlanDetails;
exports.can = can;
exports.limit = limit;
exports.resolveOrCreateCustomer = resolveOrCreateCustomer;
exports.checkCustomerOpenOrdersLimit = checkCustomerOpenOrdersLimit;
exports.calculateStoreRevenueMetrics = calculateStoreRevenueMetrics;
exports.generatePasswordResetToken = generatePasswordResetToken;
exports.normalizeStoreSlug = normalizeStoreSlug;
exports.validateStoreSlugAvailability = validateStoreSlugAvailability;
exports.getStoreCategoryInfo = getStoreCategoryInfo;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const plans_js_1 = require("../config/plans.js");
const db_js_1 = require("../db/db.js");
const env_js_1 = require("../config/env.js");
/**
 * Normalize phone number into canonical Nigerian standard (+2348012345678)
 */
function normalizePhoneNumber(phone) {
    if (!phone)
        return '';
    const cleaned = String(phone).trim().replace(/[^\d+]/g, '');
    const hasLeadingPlus = cleaned.startsWith('+');
    const digits = cleaned.replace(/\D/g, '');
    if (!digits)
        return '';
    // 080... (11 digits starting with 0) -> +23480...
    if (digits.length === 11 && digits.startsWith('0')) {
        return '+234' + digits.substring(1);
    }
    // 23480... (13 digits starting with 234) -> +23480...
    if (digits.length === 13 && digits.startsWith('234')) {
        return '+' + digits;
    }
    // 80... (10 digits without leading 0) -> +23480...
    if (digits.length === 10) {
        return '+234' + digits;
    }
    return hasLeadingPlus ? '+' + digits : '+' + digits;
}
/**
 * Format currency with locale commas
 */
function formatCurrency(amount, symbol = '₦') {
    const num = typeof amount === 'string' ? parseFloat(amount) : (Number(amount) || 0);
    return symbol + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/**
 * Hash password securely
 */
function hashPassword(password) {
    const salt = bcryptjs_1.default.genSaltSync(10);
    return bcryptjs_1.default.hashSync(password, salt);
}
/**
 * Verify password against hash
 */
function verifyPassword(password, hash) {
    if (!password || !hash)
        return false;
    return bcryptjs_1.default.compareSync(password, hash);
}
function comparePassword(password, hash) {
    if (!password || !hash)
        return Promise.resolve(false);
    return bcryptjs_1.default.compare(password, hash);
}
/**
 * Get Platform Settings
 */
function getPlatformSettings() {
    const settings = (0, db_js_1.dbFetchOne)('platform_settings');
    return settings || {
        platform_name: 'Zlik',
        pro_monthly_price: 5000,
        pro_yearly_price: 50000,
        business_monthly_price: 9000,
        business_yearly_price: 90000,
        free_product_limit: 10,
        free_weekly_posters: 3,
        paystack_mode: 'test'
    };
}
/**
 * Dynamic resolution of all platform plans, limits, and feature toggles.
 * Merges baseline defaults with active database settings (platform_settings.plans_config_json).
 */
function getEffectivePlans() {
    const settings = getPlatformSettings();
    const proMonthly = Number(settings.pro_monthly_price || 5000);
    const proYearly = Number(settings.pro_yearly_price || 50000);
    const bizMonthly = Number(settings.business_monthly_price || 9000);
    const bizYearly = Number(settings.business_yearly_price || 90000);
    const freeLimit = Number(settings.free_product_limit || 10);
    const freePosters = Number(settings.free_weekly_posters || 3);
    // Deep clone baseline PLANS
    const resolved = JSON.parse(JSON.stringify(plans_js_1.PLANS));
    // Sync pricing numbers
    resolved.free.price_monthly = 0;
    resolved.free.price_yearly = 0;
    resolved.free.limits.max_products = freeLimit;
    resolved.pro.price_monthly = proMonthly;
    resolved.pro.price_yearly = proYearly;
    resolved.pro.price_formatted = `₦${proMonthly.toLocaleString()}/mo`;
    resolved.pro.price_yearly_formatted = `₦${proYearly.toLocaleString()}/yr — save ₦${((proMonthly * 12) - proYearly).toLocaleString()}`;
    resolved.business.price_monthly = bizMonthly;
    resolved.business.price_yearly = bizYearly;
    resolved.business.price_formatted = `₦${bizMonthly.toLocaleString()}/mo`;
    resolved.business.price_yearly_formatted = `₦${bizYearly.toLocaleString()}/yr — save ₦${((bizMonthly * 12) - bizYearly).toLocaleString()}`;
    // If custom plans_config_json is set in database, overlay it
    if (settings.plans_config_json) {
        try {
            const parsed = typeof settings.plans_config_json === 'string' ? JSON.parse(settings.plans_config_json) : settings.plans_config_json;
            ['free', 'pro', 'business'].forEach(tier => {
                if (parsed[tier]) {
                    if (parsed[tier].limits) {
                        resolved[tier].limits = { ...resolved[tier].limits, ...parsed[tier].limits };
                    }
                    if (parsed[tier].features) {
                        resolved[tier].features = { ...resolved[tier].features, ...parsed[tier].features };
                    }
                    if (parsed[tier].price_monthly !== undefined)
                        resolved[tier].price_monthly = Number(parsed[tier].price_monthly);
                    if (parsed[tier].price_yearly !== undefined)
                        resolved[tier].price_yearly = Number(parsed[tier].price_yearly);
                }
            });
        }
        catch (e) {
            // Invalid JSON fallback to baseline
        }
    }
    return resolved;
}
/**
 * Get active plan and configuration details for a store
 */
function getStorePlanDetails(store) {
    const now = new Date();
    let planKey = (store?.plan_tier || store?.plan || 'free').toLowerCase();
    // Check 7-day Pro trial
    const isTrialActive = Boolean(store?.is_trial_active);
    const trialEndsAt = store?.trial_ends_at ? new Date(store.trial_ends_at) : null;
    const hasActiveTrial = Boolean(isTrialActive && trialEndsAt && trialEndsAt > now);
    // Check active paid subscription
    const planExpiresAt = store?.plan_expires_at ? new Date(store.plan_expires_at) : null;
    const hasActivePaidPlan = Boolean(planExpiresAt && planExpiresAt > now);
    let effectivePlan = 'free';
    if (hasActiveTrial) {
        effectivePlan = 'pro';
    }
    else if (hasActivePaidPlan && (planKey === 'pro' || planKey === 'business' || planKey === 'enterprise')) {
        effectivePlan = planKey;
    }
    else if (planKey === 'pro' || planKey === 'business' || planKey === 'enterprise') {
        // If not expired or no expiry specified
        effectivePlan = planKey;
    }
    const allPlans = getEffectivePlans();
    const config = allPlans[effectivePlan] || allPlans.free;
    const isPro = effectivePlan !== 'free';
    const isBusiness = effectivePlan === 'business' || effectivePlan === 'enterprise';
    return { plan: effectivePlan, tier: effectivePlan, isPro, isBusiness, is_trial: hasActiveTrial, config };
}
/**
 * Universal Feature Gating Check
 */
function can(store, featureKey) {
    const { config } = getStorePlanDetails(store);
    return Boolean(config.features[featureKey]);
}
/**
 * Universal Limits Check
 */
function limit(store, limitKey) {
    const { config } = getStorePlanDetails(store);
    return config.limits[limitKey] ?? 0;
}
/**
 * Resolve existing customer or create a new one using (store_id + phone_normalized)
 */
function resolveOrCreateCustomer(storeId, phoneRaw, name, email, address) {
    const phoneNorm = normalizePhoneNumber(phoneRaw);
    const phoneDisplay = String(phoneRaw || '').trim();
    const cleanName = String(name || '').trim();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    if (!phoneNorm)
        return null;
    const existing = (0, db_js_1.dbFetchOne)('customers', {
        store_id: storeId,
        phone_normalized: phoneNorm
    });
    if (existing) {
        const updates = {
            phone_display: phoneDisplay,
            last_order_at: now,
            updated_at: now
        };
        if (cleanName)
            updates.name = cleanName;
        if (email)
            updates.email = email.toLowerCase().trim();
        if (address)
            updates.address = address.trim();
        (0, db_js_1.dbUpdate)('customers', updates, { id: existing.id });
        return { ...existing, ...updates };
    }
    else {
        const newId = (0, db_js_1.dbInsert)('customers', {
            store_id: storeId,
            phone_normalized: phoneNorm,
            phone_display: phoneDisplay,
            name: cleanName || 'Valued Customer',
            email: email ? email.toLowerCase().trim() : null,
            address: address ? address.trim() : null,
            total_orders: 0,
            total_spent: 0.0,
            first_order_at: now,
            last_order_at: now,
            created_at: now,
            updated_at: now
        });
        return (0, db_js_1.dbFetchOne)('customers', { id: newId });
    }
}
/**
 * Open-Orders Anti-Spam Check
 */
function checkCustomerOpenOrdersLimit(storeId, phoneRaw) {
    const phoneNorm = normalizePhoneNumber(phoneRaw);
    if (!phoneNorm) {
        return { allowed: true, open_count: 0, open_orders: [] };
    }
    const allOrders = (0, db_js_1.dbFetchAll)('orders', { store_id: storeId }, 'id DESC');
    const openOrders = allOrders.filter(o => {
        const norm = normalizePhoneNumber(o.customer_phone);
        const status = (o.order_status || 'pending').toLowerCase();
        const isUnclosed = status !== 'completed' && status !== 'cancelled';
        return norm === phoneNorm && isUnclosed;
    });
    return {
        allowed: openOrders.length < 3,
        open_count: openOrders.length,
        open_orders: openOrders.slice(0, 3)
    };
}
/**
 * Multi-Period Revenue & Store Analytics
 * Free Periods: today, yesterday, this_week, this_month, last_month
 * Paid (Pro/Business) Periods: 3months, 6months, yearly, lifetime
 */
function calculateStoreRevenueMetrics(orders) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;
    // This Week (starting Sunday)
    const dayOfWeek = now.getDay();
    const thisWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek).getTime();
    // This Month
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    // Last Month
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const lastMonthEnd = thisMonthStart;
    // Pro Periods
    const threeMonthsAgo = todayStart - 90 * 86400000;
    const sixMonthsAgo = todayStart - 180 * 86400000;
    const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
    const periods = {
        today: { label: 'Today', since: todayStart },
        yesterday: { label: 'Yesterday', since: yesterdayStart, until: todayStart },
        this_week: { label: 'This Week', since: thisWeekStart },
        this_month: { label: 'This Month', since: thisMonthStart },
        last_month: { label: 'Last Month', since: lastMonthStart, until: lastMonthEnd },
        // Backwards compatibility aliases
        week: { label: 'This Week', since: thisWeekStart },
        month: { label: 'This Month', since: thisMonthStart },
        // Paid Timeframes
        '3months': { label: 'Last 3 Months', since: threeMonthsAgo, is_pro: true },
        '6months': { label: 'Last 6 Months', since: sixMonthsAgo, is_pro: true },
        yearly: { label: 'This Year', since: yearStart, is_pro: true },
        lifetime: { label: 'Full Lifetime', since: 0, is_pro: true }
    };
    const metrics = {};
    for (const [key, p] of Object.entries(periods)) {
        metrics[key] = {
            label: p.label,
            is_pro: Boolean(p.is_pro),
            confirmed_revenue: 0.0,
            confirmed_count: 0,
            pending_revenue: 0.0,
            pending_count: 0,
            cancelled_count: 0,
            delivery_revenue: 0.0,
            pickup_count: 0,
            delivery_count: 0,
            aov: 0.0,
            top_items: []
        };
    }
    const itemSales = {};
    for (const key of Object.keys(periods)) {
        itemSales[key] = {};
    }
    for (const order of orders) {
        const createdAt = order.created_at ? new Date(order.created_at.replace(/-/g, '/')).getTime() : 0;
        const status = String(order.order_status || 'pending').toLowerCase();
        const amount = parseFloat(order.total_amount || 0);
        const deliveryFee = parseFloat(order.delivery_fee || 0);
        const fulfillment = String(order.fulfillment_type || 'delivery').toLowerCase();
        let items = [];
        try {
            items = typeof order.items_json === 'string' ? JSON.parse(order.items_json) : (order.items_json || []);
        }
        catch (e) { }
        for (const [key, p] of Object.entries(periods)) {
            const matchesSince = createdAt >= p.since;
            const matchesUntil = p.until ? createdAt < p.until : true;
            if (matchesSince && matchesUntil) {
                if (status === 'confirmed' || status === 'completed' || status === 'dispatched') {
                    metrics[key].confirmed_revenue += amount;
                    metrics[key].confirmed_count += 1;
                    if (deliveryFee > 0)
                        metrics[key].delivery_revenue += deliveryFee;
                    // Item aggregations
                    for (const item of items) {
                        const title = item.title || 'Product';
                        if (!itemSales[key][title]) {
                            itemSales[key][title] = { title, count: 0, revenue: 0 };
                        }
                        itemSales[key][title].count += parseInt(item.quantity || 1);
                        itemSales[key][title].revenue += parseFloat(item.price || 0) * parseInt(item.quantity || 1);
                    }
                }
                else if (status === 'pending') {
                    metrics[key].pending_revenue += amount;
                    metrics[key].pending_count += 1;
                }
                else if (status === 'cancelled') {
                    metrics[key].cancelled_count += 1;
                }
                if (fulfillment === 'pickup') {
                    metrics[key].pickup_count += 1;
                }
                else {
                    metrics[key].delivery_count += 1;
                }
            }
        }
    }
    for (const key of Object.keys(periods)) {
        if (metrics[key].confirmed_count > 0) {
            metrics[key].aov = metrics[key].confirmed_revenue / metrics[key].confirmed_count;
        }
        const sorted = Object.values(itemSales[key]).sort((a, b) => b.revenue - a.revenue);
        metrics[key].top_items = sorted.slice(0, 5);
    }
    return metrics;
}
/**
 * Generate Crypto Reset Token
 */
function generatePasswordResetToken() {
    const token = node_crypto_1.default.randomBytes(32).toString('hex');
    const hash = node_crypto_1.default.createHash('sha256').update(token).digest('hex');
    return { token, hash };
}
/**
 * Reserved System Usernames / Paths
 */
exports.RESERVED_USERNAMES = new Set([
    'admin', 'api', 'assets', 'merchant', 'login', 'register', 'logout', 'marketplace',
    'store', 'order', 'receipt', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'terms',
    'privacy', 'pricing', 'checkout', 'dashboard', 'settings', 'messages', 'items',
    'chat', 'feed', 'auth', 'webhook', 'webhooks', 'help', 'support', 'billing', 'upgrade',
    'test', 'null', 'undefined', 'static', 'public', 'superadmin', 'super-admin',
    'zlik-ops-9x7q2m8b', env_js_1.ENV.ADMIN_SECRET_PATH.toLowerCase()
]);
/**
 * Normalize username / slug into clean lowercase format
 */
function normalizeStoreSlug(input) {
    if (!input)
        return '';
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-_]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}
/**
 * Validate and ensure a store username/slug is unique and available (unless previous store is deleted)
 */
function validateStoreSlugAvailability(rawSlug, excludeStoreId) {
    const slug = normalizeStoreSlug(rawSlug);
    if (!slug || slug.length < 3) {
        return { valid: false, normalizedSlug: slug, error: 'Store username must be at least 3 characters long.' };
    }
    if (slug.length > 30) {
        return { valid: false, normalizedSlug: slug, error: 'Store username cannot exceed 30 characters.' };
    }
    if (exports.RESERVED_USERNAMES.has(slug)) {
        return { valid: false, normalizedSlug: slug, error: `The username "${slug}" is reserved for system routes. Please choose another.` };
    }
    // Check if assigned to any other active/non-deleted store
    const allStores = (0, db_js_1.dbFetchAll)('stores', { slug });
    const conflict = allStores.find(s => {
        if (excludeStoreId && s.id === excludeStoreId)
            return false;
        return s.status !== 'deleted';
    });
    if (conflict) {
        return {
            valid: false,
            normalizedSlug: slug,
            error: `The username "zlik.store/${slug}" is already assigned to another store. Please choose another.`
        };
    }
    return { valid: true, normalizedSlug: slug };
}
exports.STORE_MARKETPLACE_CATEGORIES = {
    all: {
        id: 'all',
        name: 'All Categories',
        icon: '✨',
        accent_color: '#08110D',
        accent_bg: '#F3F4F6'
    },
    fashion: {
        id: 'fashion',
        name: 'Fashion & Apparel',
        icon: '👗',
        accent_color: '#BE185D',
        accent_bg: '#FCE7F3'
    },
    food: {
        id: 'food',
        name: 'Food & Groceries',
        icon: '🍔',
        accent_color: '#D97706',
        accent_bg: '#FEF3C7'
    },
    beauty: {
        id: 'beauty',
        name: 'Beauty & Cosmetics',
        icon: '💄',
        accent_color: '#9333EA',
        accent_bg: '#F3E8FF'
    },
    electronics: {
        id: 'electronics',
        name: 'Electronics & Tech',
        icon: '⚡',
        accent_color: '#2563EB',
        accent_bg: '#DBEAFE'
    },
    home: {
        id: 'home',
        name: 'Home & Living',
        icon: '🛋️',
        accent_color: '#4F46E5',
        accent_bg: '#EEF2FF'
    },
    services: {
        id: 'services',
        name: 'Services & Bookings',
        icon: '💼',
        accent_color: '#0D9488',
        accent_bg: '#CCFBF1'
    },
    digital: {
        id: 'digital',
        name: 'Digital & Creative',
        icon: '📱',
        accent_color: '#7C3AED',
        accent_bg: '#EDE9FE'
    },
    general: {
        id: 'general',
        name: 'General Retail',
        icon: '🛒',
        accent_color: '#087A50',
        accent_bg: '#EAF7F0'
    }
};
function getStoreCategoryInfo(store) {
    if (!store)
        return exports.STORE_MARKETPLACE_CATEGORIES.general;
    const raw = `${store.business_type || ''} ${store.category || ''} ${store.store_name || ''} ${store.bio || ''}`.toLowerCase();
    const indId = Number(store.industry_id);
    if (raw.includes('fashion') || raw.includes('clothing') || raw.includes('apparel') || raw.includes('boutique') || raw.includes('shoes') || raw.includes('wear') || raw.includes('jewelry') || indId === 2) {
        return exports.STORE_MARKETPLACE_CATEGORIES.fashion;
    }
    if (raw.includes('food') || raw.includes('restaurant') || raw.includes('bakery') || raw.includes('kitchen') || raw.includes('cafe') || raw.includes('grocer') || raw.includes('chop') || raw.includes('cater') || indId === 3) {
        return exports.STORE_MARKETPLACE_CATEGORIES.food;
    }
    if (raw.includes('beauty') || raw.includes('cosmetic') || raw.includes('skin') || raw.includes('hair') || raw.includes('makeup') || raw.includes('fragrance') || raw.includes('perfume') || raw.includes('spa') || indId === 4) {
        return exports.STORE_MARKETPLACE_CATEGORIES.beauty;
    }
    if (raw.includes('electronic') || raw.includes('gadget') || raw.includes('phone') || raw.includes('tech') || raw.includes('computer') || raw.includes('laptop') || raw.includes('audio') || indId === 5) {
        return exports.STORE_MARKETPLACE_CATEGORIES.electronics;
    }
    if (raw.includes('home') || raw.includes('furniture') || raw.includes('decor') || raw.includes('bedding') || raw.includes('interior')) {
        return exports.STORE_MARKETPLACE_CATEGORIES.home;
    }
    if (raw.includes('service') || raw.includes('booking') || raw.includes('consult') || raw.includes('repair') || raw.includes('logistics') || indId === 6) {
        return exports.STORE_MARKETPLACE_CATEGORIES.services;
    }
    if (raw.includes('digital') || raw.includes('ebook') || raw.includes('course') || raw.includes('software') || raw.includes('art') || raw.includes('creative')) {
        return exports.STORE_MARKETPLACE_CATEGORIES.digital;
    }
    return exports.STORE_MARKETPLACE_CATEGORIES.general;
}
exports.NIGERIAN_STATES = [
    'Abia',
    'Adamawa',
    'Akwa Ibom',
    'Anambra',
    'Bauchi',
    'Bayelsa',
    'Benue',
    'Borno',
    'Cross River',
    'Delta',
    'Ebonyi',
    'Edo',
    'Ekiti',
    'Enugu',
    'FCT - Abuja',
    'Gombe',
    'Imo',
    'Jigawa',
    'Kaduna',
    'Kano',
    'Katsina',
    'Kebbi',
    'Kogi',
    'Kwara',
    'Lagos',
    'Nasarawa',
    'Niger',
    'Ogun',
    'Ondo',
    'Osun',
    'Oyo',
    'Plateau',
    'Rivers',
    'Sokoto',
    'Taraba',
    'Yobe',
    'Zamfara'
];
