import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { dbFetchOne, dbFetchAll, getDb } from '../../db/db.js';
import { getStorePlanDetails, formatCurrency } from '../../utils/helpers.js';

export const broadcastsRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Daily Sales Summary via WhatsApp
  fastify.get('/api/merchant/sales-summary/today', async (req: FastifyRequest, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });

    const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
    const db = getDb();

    // Query today's start and end timestamps in UTC/local
    const todayStr = new Date().toISOString().slice(0, 10);
    const startOfDay = todayStr + ' 00:00:00';
    const endOfDay = todayStr + ' 23:59:59';

    const ordersStmt = db.prepare(`
      SELECT * FROM orders 
      WHERE store_id = ? AND created_at >= ? AND created_at <= ?
      ORDER BY id DESC
    `);
    const ordersToday = ordersStmt.all(currentStore.id, startOfDay, endOfDay) as any[];

    const paidOrders = ordersToday.filter(o => o.payment_status === 'paid');
    const pendingOrders = ordersToday.filter(o => o.payment_status !== 'paid');
    const totalGrossSales = paidOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const totalPendingAmount = pendingOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

    // Item sales breakdown
    const itemCounts: Record<string, { count: number; revenue: number }> = {};
    ordersToday.forEach(o => {
      try {
        const items = JSON.parse(o.items_json || '[]');
        items.forEach((it: any) => {
          const key = it.title || 'Product';
          if (!itemCounts[key]) itemCounts[key] = { count: 0, revenue: 0 };
          itemCounts[key].count += (it.quantity || 1);
          itemCounts[key].revenue += (it.total || (it.unit_price * (it.quantity || 1)) || 0);
        });
      } catch(e) {}
    });

    const topItems = Object.entries(itemCounts)
      .map(([title, data]) => ({ title, count: data.count, revenue: data.revenue }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Build WhatsApp formatted message text
    const dateFormatted = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    let summaryText = `📊 *DAILY SALES SUMMARY — ${currentStore.store_name.toUpperCase()}*\n`;
    summaryText += `🗓️ Date: ${dateFormatted}\n\n`;
    summaryText += `💰 *Gross Revenue (Paid):* ${formatCurrency(totalGrossSales)}\n`;
    summaryText += `📦 *Total Orders Today:* ${ordersToday.length} (${paidOrders.length} paid, ${pendingOrders.length} pending)\n`;
    if (totalPendingAmount > 0) {
      summaryText += `⏳ *Pending Payments:* ${formatCurrency(totalPendingAmount)}\n`;
    }
    summaryText += `\n🛍️ *Top Selling Products Today:*\n`;
    if (topItems.length === 0) {
      summaryText += `• No items recorded yet today.\n`;
    } else {
      topItems.forEach((it, idx) => {
        summaryText += `${idx + 1}. *${it.title}* — ${it.count} sold (${formatCurrency(it.revenue)})\n`;
      });
    }
    summaryText += `\n✨ Powered by Zlik • Keep growing!`;

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(summaryText)}`;

    return reply.send({
      success: true,
      summary: {
        date: dateFormatted,
        total_orders: ordersToday.length,
        paid_orders_count: paidOrders.length,
        pending_orders_count: pendingOrders.length,
        gross_revenue: totalGrossSales,
        gross_revenue_formatted: formatCurrency(totalGrossSales),
        pending_revenue: totalPendingAmount,
        pending_revenue_formatted: formatCurrency(totalPendingAmount),
        top_items: topItems,
        whatsapp_text: summaryText,
        whatsapp_url: whatsappUrl
      }
    });
  });

  // 2. Customer Segmentation Directory
  fastify.get('/api/merchant/customers', async (req: FastifyRequest, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });

    const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
    const db = getDb();
    const query = (req.query || {}) as Record<string, any>;
    const segment = query.segment || 'all';

    // Aggregate unique customer metrics from all store orders
    const stmt = db.prepare(`
      SELECT 
        customer_phone,
        customer_name,
        COUNT(id) as orders_count,
        SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as total_spent,
        MAX(created_at) as last_order_date
      FROM orders
      WHERE store_id = ? AND customer_phone IS NOT NULL AND TRIM(customer_phone) != ''
      GROUP BY customer_phone
      ORDER BY last_order_date DESC
    `);
    const allCustomers = stmt.all(currentStore.id) as any[];

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysStr = thirtyDaysAgo.toISOString();

    let filtered = allCustomers;
    if (segment === 'repeat') {
      filtered = allCustomers.filter(c => c.orders_count > 1);
    } else if (segment === 'vip') {
      filtered = allCustomers.filter(c => Number(c.total_spent) >= 20000);
    } else if (segment === 'recent') {
      filtered = allCustomers.filter(c => c.last_order_date >= thirtyDaysStr);
    }

    return reply.send({
      success: true,
      segment,
      total_count: filtered.length,
      customers: filtered.map(c => ({
        customer_phone: c.customer_phone,
        customer_name: c.customer_name || 'Valued Customer',
        orders_count: c.orders_count,
        total_spent: Number(c.total_spent) || 0,
        total_spent_formatted: formatCurrency(Number(c.total_spent) || 0),
        last_order_date: c.last_order_date,
        is_repeat: c.orders_count > 1,
        is_vip: (Number(c.total_spent) || 0) >= 20000
      })),
      counts: {
        all: allCustomers.length,
        repeat: allCustomers.filter(c => c.orders_count > 1).length,
        vip: allCustomers.filter(c => Number(c.total_spent) >= 20000).length,
        recent: allCustomers.filter(c => c.last_order_date >= thirtyDaysStr).length
      }
    });
  });

  // 3. Customer Broadcast Message Generator
  fastify.post('/api/merchant/broadcasts/generate', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });

    const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
    const body = (req.body || {}) as any;

    const templateType = body.template_type || 'promo_discount';
    const discountCode = body.discount_code ? body.discount_code.trim().toUpperCase() : 'SAVE10';
    const discountValue = body.discount_value || '10%';
    const customMessage = body.custom_message ? body.custom_message.trim() : '';

    const storeUrl = `https://${(req.headers.host || 'zlik.me')}/${currentStore.slug}`;
    let templateText = '';

    if (templateType === 'promo_discount') {
      templateText = `🎉 *EXCLUSIVE DISCOUNT FROM ${currentStore.store_name.toUpperCase()}*\n\n` +
        `Hello {{customer_name}}! 💖\n\n` +
        `As a valued customer, enjoy *${discountValue} OFF* your next order with coupon code *${discountCode}*.\n\n` +
        `🛍️ *Shop now:* ${storeUrl}\n\n` +
        `Hurry while items remain in stock!`;
    } else if (templateType === 'new_arrivals') {
      templateText = `✨ *FRESH ARRIVALS AT ${currentStore.store_name.toUpperCase()}*\n\n` +
        `Hello {{customer_name}}! 🌟\n\n` +
        `We've just restocked brand new items you'll love. Check out our latest collection before they sell out:\n\n` +
        `🛍️ *Explore Collection:* ${storeUrl}\n\n` +
        `Fast delivery & guaranteed quality!`;
    } else if (templateType === 'thank_you') {
      templateText = `🙏 *THANK YOU FROM ${currentStore.store_name.toUpperCase()}*\n\n` +
        `Hello {{customer_name}}! ✨\n\n` +
        `Thank you for trusting us with your recent order. We truly appreciate your support!\n\n` +
        `Need anything else or have questions? Simply reply right here or visit our store anytime at:\n` +
        `👉 ${storeUrl}`;
    } else {
      templateText = customMessage || `Hello {{customer_name}}! Check out our store: ${storeUrl}`;
    }

    return reply.send({
      success: true,
      template_text: templateText,
      store_url: storeUrl
    });
  });

  // 4. Daily WhatsApp Auto-Poster Featured Catalog Data
  fastify.get('/api/merchant/auto-poster/featured', async (req: FastifyRequest, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });

    const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
    const db = getDb();

    // Select up to 4 top in-stock products
    const stmt = db.prepare(`
      SELECT * FROM items 
      WHERE store_id = ? AND is_available = 1 AND image_url IS NOT NULL AND TRIM(image_url) != ''
      ORDER BY id DESC
      LIMIT 4
    `);
    const featuredItems = stmt.all(currentStore.id) as any[];

    return reply.send({
      success: true,
      store: {
        name: currentStore.store_name,
        slug: currentStore.slug,
        phone: currentStore.whatsapp_number,
        url: `https://${(req.headers.host || 'zlik.me')}/${currentStore.slug}`
      },
      featured_items: featuredItems
    });
  });
};
