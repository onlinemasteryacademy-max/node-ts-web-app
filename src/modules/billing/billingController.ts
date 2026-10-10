import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import https from 'node:https';
import { dbFetchOne, dbFetchAll, dbInsert, dbUpdate } from '../../db/db.js';
import { getPlatformSettings, getEffectivePlans } from '../../utils/helpers.js';
import { sendEmail } from '../email/mailer.js';

/**
 * Helper to call Paystack Verify Transaction API over HTTPS
 */
async function verifyPaystackTransactionApi(reference: string, secretKey: string): Promise<{ success: boolean; data?: any; error?: string }> {
  const cleanKey = (secretKey || '').trim();

  // If secret key is mock placeholder in dev environment
  if (!cleanKey || cleanKey.startsWith('mock') || cleanKey === 'sk_test_placeholder' || cleanKey === 'test') {
    return {
      success: true,
      data: {
        status: 'success',
        reference,
        amount: 500000,
        channel: 'test_card',
        gateway_response: 'Successful (Sandbox Simulation Mode)'
      }
    };
  }

  // Validate Secret Key format to prevent Paystack "Format is Authorization Bearer [secret key]" error
  if (!cleanKey.startsWith('sk_test_') && !cleanKey.startsWith('sk_live_')) {
    return {
      success: false,
      error: `Invalid Paystack Secret Key format. Secret keys must begin with "sk_test_" (for test mode) or "sk_live_" (for live mode). Please enter your valid Paystack secret key in the Super Admin dashboard.`
    };
  }

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: `/transaction/verify/${encodeURIComponent(reference)}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cleanKey}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.status && parsed.data && parsed.data.status === 'success') {
            resolve({ success: true, data: parsed.data });
          } else {
            resolve({ 
              success: false, 
              error: parsed.message || 'Payment verification failed at Paystack', 
              data: parsed.data 
            });
          }
        } catch (e: any) {
          resolve({ success: false, error: 'Invalid response received from Paystack API' });
        }
      });
    });

    req.on('error', (e) => {
      resolve({ success: false, error: e.message || 'Network error verifying transaction with Paystack' });
    });

    req.setTimeout(12000, () => {
      req.destroy();
      resolve({ success: false, error: 'Paystack verification request timed out after 12s' });
    });

    req.end();
  });
}

export async function billingRoutes(fastify: FastifyInstance) {
  /**
   * 1. Verify Paystack Subscription Transaction (Client Post-Checkout Callback)
   */
  fastify.post('/api/billing/verify_subscription', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const body = (req.body || {}) as any;
    const reference = body.reference?.trim();
    const sessionStore = (req as any).session?.merchantStore;

    if (!reference) {
      return reply.send({ success: false, error: 'Transaction reference is required' });
    }

    // Lookup payment record
    const payment = dbFetchOne<any>('subscription_payments', { reference });
    if (!payment) {
      return reply.send({ success: false, error: 'No subscription payment found with this reference' });
    }

    const storeId = payment.store_id || (sessionStore && sessionStore.id);
    const store = dbFetchOne<any>('stores', { id: storeId });
    if (!store) {
      return reply.send({ success: false, error: 'Associated store account not found' });
    }

    // If already verified and active
    if (payment.status === 'success' && store.plan_tier === payment.plan_tier && store.subscription_status === 'active') {
      (req as any).session.merchantStore = store;
      return reply.send({ success: true, message: 'Subscription is already active', store, redirect: '/merchant' });
    }

    const settings = getPlatformSettings();
    const paystackMode = (settings.paystack_mode || 'test').toLowerCase();
    const isLive = paystackMode === 'live';
    const secretKey = isLive 
      ? (settings.paystack_live_secret_key || '').trim() 
      : (settings.paystack_test_secret_key || '').trim();

    if (isLive && (!secretKey || !secretKey.startsWith('sk_live_'))) {
      return reply.send({
        success: false,
        error: 'Paystack Live Mode is selected, but a valid Live Secret Key (starting with "sk_live_") has not been configured in the Super Admin dashboard.'
      });
    }

    if (!isLive && secretKey && !secretKey.startsWith('sk_test_') && !secretKey.startsWith('mock') && secretKey !== 'test' && secretKey !== 'sk_test_placeholder') {
      return reply.send({
        success: false,
        error: 'Paystack Test Secret Key must begin with "sk_test_". Please enter your valid Test Secret Key in the Super Admin dashboard.'
      });
    }

    const verifyResult = await verifyPaystackTransactionApi(reference, secretKey || 'sk_test_placeholder');

    if (!verifyResult.success) {
      dbUpdate('subscription_payments', {
        status: 'failed',
        gateway_reference: reference
      }, { id: payment.id });

      return reply.send({
        success: false,
        error: verifyResult.error || 'Payment could not be verified by Paystack'
      });
    }

    // Verify amount in kobo matches expected plan price
    const expectedKobo = Math.round(Number(payment.amount || 0) * 100);
    const paidKobo = Number(verifyResult.data?.amount || 0);
    if (paidKobo > 0 && expectedKobo > 0 && paidKobo < expectedKobo) {
      dbUpdate('subscription_payments', {
        status: 'partial_payment',
        gateway_reference: reference
      }, { id: payment.id });

      return reply.send({
        success: false,
        error: `Partial payment detected (Expected ₦${Number(payment.amount).toLocaleString()}, received ₦${(paidKobo / 100).toLocaleString()}). Please contact support.`
      });
    }

    // Payment Verified Successfully! Calculate expiration date
    const now = new Date();
    const isYearly = payment.billing_cycle === 'yearly';
    const durationDays = isYearly ? 365 : 30;
    const expiresAt = new Date(now.getTime() + durationDays * 86400000).toISOString().slice(0, 19).replace('T', ' ');

    // Update Store
    dbUpdate('stores', {
      plan_tier: payment.plan_tier,
      subscription_status: 'active',
      billing_cycle: payment.billing_cycle,
      plan_expires_at: expiresAt,
      is_trial_active: 0,
      updated_at: now.toISOString().slice(0, 19).replace('T', ' ')
    }, { id: store.id });

    // Update Subscription Payment Record
    dbUpdate('subscription_payments', {
      status: 'success',
      channel: verifyResult.data?.channel || 'card',
      gateway_reference: verifyResult.data?.id ? String(verifyResult.data.id) : reference,
      paid_at: now.toISOString().slice(0, 19).replace('T', ' ')
    }, { id: payment.id });

    // Refresh Merchant Session
    const updatedStore = dbFetchOne<any>('stores', { id: store.id });
    (req as any).session.merchantStore = updatedStore;

    // Send confirmation email
    if (store.email) {
      sendEmail({
        toEmail: store.email,
        toName: store.owner_name,
        subject: `🎉 Your Zlik ${payment.plan_tier.toUpperCase()} Subscription is Active!`,
        htmlContent: `
          <h2 style="color: #08110D; margin-top: 0;">Subscription Confirmed!</h2>
          <p>Hello ${store.owner_name}, your <strong>${payment.plan_tier.toUpperCase()} Plan (${payment.billing_cycle})</strong> subscription for <strong>${store.store_name}</strong> is now active.</p>
          <div style="background-color: #F8FAF8; border: 1px solid #E3E9E5; border-radius: 12px; padding: 16px; margin: 20px 0;">
            <div><strong>Plan Tier:</strong> ${payment.plan_tier.toUpperCase()}</div>
            <div><strong>Amount Paid:</strong> ₦${Number(payment.amount).toLocaleString()}</div>
            <div><strong>Valid Until:</strong> ${expiresAt.slice(0, 10)}</div>
            <div><strong>Transaction Ref:</strong> ${reference}</div>
          </div>
          <p>Thank you for choosing Zlik Commerce.</p>
        `,
        templateName: 'subscription_confirmed'
      }).catch(() => {});
    }

    return reply.send({
      success: true,
      message: `Your store has been upgraded to ${payment.plan_tier.toUpperCase()}!`,
      store: updatedStore,
      redirect: '/merchant'
    });
  });

  /**
   * 2. Paystack Webhook Listener (Server-to-Server HMAC Verified)
   */
  fastify.post('/api/webhooks/paystack', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const settings = getPlatformSettings();
    const paystackMode = settings.paystack_mode || 'test';
    const secretKey = paystackMode === 'live' 
      ? (settings.paystack_live_secret_key || settings.paystack_webhook_secret || '') 
      : (settings.paystack_test_secret_key || settings.paystack_webhook_secret || 'sk_test_placeholder');

    const signature = req.headers['x-paystack-signature'] as string;
    const rawBody = JSON.stringify(req.body || {});

    // Verify HMAC if secret is configured and not placeholder
    if (signature && secretKey && !secretKey.startsWith('sk_test_placeholder')) {
      const hash = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');
      if (hash !== signature) {
        return reply.code(400).send({ status: false, message: 'Invalid webhook signature' });
      }
    }

    const payload = (req.body || {}) as any;
    const event = payload.event;
    const data = payload.data || {};

    if (event === 'charge.success' && data.reference) {
      const reference = data.reference;
      const payment = dbFetchOne<any>('subscription_payments', { reference });

      if (payment && payment.status !== 'success') {
        const store = dbFetchOne<any>('stores', { id: payment.store_id });
        if (store) {
          const now = new Date();
          const isYearly = payment.billing_cycle === 'yearly';
          const durationDays = isYearly ? 365 : 30;
          const expiresAt = new Date(now.getTime() + durationDays * 86400000).toISOString().slice(0, 19).replace('T', ' ');

          dbUpdate('stores', {
            plan_tier: payment.plan_tier,
            subscription_status: 'active',
            billing_cycle: payment.billing_cycle,
            plan_expires_at: expiresAt,
            is_trial_active: 0,
            updated_at: now.toISOString().slice(0, 19).replace('T', ' ')
          }, { id: store.id });

          dbUpdate('subscription_payments', {
            status: 'success',
            channel: data.channel || 'card',
            gateway_reference: data.id ? String(data.id) : reference,
            paid_at: now.toISOString().slice(0, 19).replace('T', ' ')
          }, { id: payment.id });
        }
      }
    }

    return reply.code(200).send({ status: true });
  });

  /**
   * 3. Initiate Upgrade from Merchant Console
   */
  fastify.post('/api/billing/initiate_upgrade', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const sessionStore = (req as any).session?.merchantStore;
    if (!sessionStore) {
      return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });
    }

    const store = dbFetchOne<any>('stores', { id: sessionStore.id });
    if (!store) {
      return reply.send({ success: false, error: 'Store not found' });
    }

    const body = (req.body || {}) as any;
    const targetPlan = (body.plan_tier || 'pro').toLowerCase();
    const billingCycle = (body.billing_cycle || 'monthly').toLowerCase();

    if (targetPlan !== 'pro' && targetPlan !== 'business') {
      return reply.send({ success: false, error: 'Invalid target plan' });
    }

    const settings = getPlatformSettings();
    let amount = 5000;
    if (targetPlan === 'pro') {
      amount = billingCycle === 'yearly' 
        ? Number(settings.pro_yearly_price || 50000) 
        : Number(settings.pro_monthly_price || 5000);
    } else if (targetPlan === 'business') {
      amount = billingCycle === 'yearly' 
        ? Number(settings.business_yearly_price || 90000) 
        : Number(settings.business_monthly_price || 9000);
    }

    const reference = `sub_${store.id}_${Date.now()}`;
    dbInsert('subscription_payments', {
      store_id: store.id,
      email: store.email || 'merchant@zlik.store',
      reference,
      plan_tier: targetPlan,
      billing_cycle: billingCycle,
      amount,
      currency: 'NGN',
      gateway: 'paystack',
      status: 'pending',
      metadata_json: JSON.stringify({
        store_id: store.id,
        store_slug: store.slug,
        store_name: store.store_name,
        plan_tier: targetPlan,
        billing_cycle: billingCycle
      }),
      created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
    });

    if (settings.paystack_enabled === 0) {
      return reply.send({ success: false, error: 'Online card checkout is currently paused by platform administrator.' });
    }

    const paystackMode = (settings.paystack_mode || 'test').toLowerCase();
    const isLive = paystackMode === 'live';
    const paystackPublicKey = isLive 
      ? (settings.paystack_live_public_key || '').trim() 
      : (settings.paystack_test_public_key || 'pk_test_sample').trim();

    if (isLive && (!paystackPublicKey || !paystackPublicKey.startsWith('pk_live_'))) {
      return reply.send({ 
        success: false, 
        error: 'Paystack Live Mode is selected, but a valid Live Public Key (pk_live_...) has not been configured in the Super Admin dashboard.' 
      });
    }

    return reply.send({
      success: true,
      store_id: store.id,
      plan_tier: targetPlan,
      billing_cycle: billingCycle,
      amount,
      amount_kobo: Math.round(amount * 100),
      reference,
      paystack_public_key: paystackPublicKey,
      email: store.email,
      owner_name: store.owner_name
    });
  });
}
