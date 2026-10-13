import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import fastifyFormbody from '@fastify/formbody';
import fastifyCors from '@fastify/cors';
import ejs from 'ejs';
import path from 'node:path';

import { getDb, dbFetchOne, dbFetchAll, dbInsert, dbUpdate, dbDelete } from './db/db.js';
import { getStorePlanDetails, calculateStoreRevenueMetrics, validateStoreSlugAvailability, getStoreCategoryInfo, STORE_MARKETPLACE_CATEGORIES, NIGERIAN_STATES, getEffectivePlans, getPlatformSettings } from './utils/helpers.js';
import { STORE_TEMPLATES, STORE_CATEGORIES, getStoreTemplateConfig } from './config/templates.js';
import { getSampleDataForTemplate } from './config/sampleTemplatesData.js';
import { chatRoutes } from './modules/chat/chatController.js';
import { chatWebSocketRoutes } from './modules/chat/chatWs.js';
import { ordersRoutes } from './modules/orders/ordersController.js';
import { authRoutes } from './modules/auth/authController.js';
import { adminRoutes } from './modules/admin/adminController.js';
import { adminSecurityRoutes } from './modules/admin/adminSecurityController.js';
import { providerRoutes } from './modules/verification/providerController.js';
import { bankVerificationRoutes } from './modules/verification/bankVerificationController.js';
import { verificationRoutes } from './modules/verification/verificationController.js';
import { disputesRoutes } from './modules/fraud/disputesController.js';
import { debtsRoutes } from './modules/debts/debtsController.js';
import { ledgerRoutes } from './modules/ledger/ledgerController.js';
import { marketingRoutes } from './modules/marketing/marketingController.js';
import { reviewsRoutes } from './modules/reviews/reviewsController.js';
import { getMerchantReviewsList } from './modules/reviews/reviewsService.js';
import { bulkRoutes } from './modules/bulk/bulkController.js';
import { broadcastsRoutes } from './modules/broadcasts/broadcastsController.js';
import { teamsRoutes } from './modules/teams/teamsController.js';
import { branchesRoutes } from './modules/branches/branchesController.js';
import { domainsRoutes } from './modules/domains/domainsController.js';
import { multiStoreRoutes } from './modules/stores/multiStoreController.js';
import { analyticsRoutes, recordStoreVisit, getStoreVisitorMetrics } from './modules/analytics/analyticsController.js';
import { billingRoutes } from './modules/billing/billingController.js';
import { sendEmail, sendBankAccountChangeOtp } from './modules/email/mailer.js';

import fastifyMultipart from '@fastify/multipart';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';

import { ENV } from './config/env.js';
import { initSuperAdminAccount } from './modules/admin/adminSecurity.js';
import { initMySQLPersistence } from './db/persistence.js';
import { initSecurityDataModel, getOrCreateSellerProfile, isStoreOrderGated } from './modules/security/securityService.js';
import { bankOtpStore, saveVerifiedBankAccountRecord } from './modules/verification/bankVerificationController.js';
import { validateStoreName } from './utils/storeNameValidator.js';

interface BankOtpRecord {
  otp_hash: string;
  expires_at: number;
  account_number: string;
  bank_name: string;
  account_name: string;
}
const bankChangeOtpStore = new Map<number, BankOtpRecord>();

const fastify = Fastify({
  logger: false,
  bodyLimit: 25 * 1024 * 1024 // 25MB body limit
});

// Middleware & Plugins
fastify.register(fastifyCors, { origin: true, credentials: true });
fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 10 // Up to 10 images simultaneously
  }
});
fastify.register(fastifyFormbody);
fastify.register(fastifyCookie);
fastify.register(fastifySession, {
  secret: ENV.SESSION_SECRET,
  cookie: {
    secure: process.env.COOKIE_SECURE === 'true',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 86400000 * 14 // 14 days
  }
});

fastify.register(fastifyWebsocket);

// Static Assets & Views Path Resolution (supports both tsx dev and compiled dist)
const publicDir = fs.existsSync(path.join(__dirname, 'public'))
  ? path.join(__dirname, 'public')
  : path.resolve(process.cwd(), 'src', 'public');

const viewsDir = fs.existsSync(path.join(__dirname, 'views'))
  ? path.join(__dirname, 'views')
  : path.resolve(process.cwd(), 'src', 'views');

// Persistent Uploads Directory (safe from Git pulls, re-deployments, and builds)
// By storing uploads in data/uploads (or UPLOADS_DIR), files will never be erased during git deployments!
const persistentUploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(process.cwd(), 'data', 'uploads');

if (!fs.existsSync(persistentUploadsDir)) {
  fs.mkdirSync(persistentUploadsDir, { recursive: true });
}

// Auto-seed/sync existing bundled starter assets and previous uploads into persistent directory
function syncExistingUploads(srcDir: string, destDir: string) {
  if (!fs.existsSync(srcDir)) return;
  try {
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.gitkeep') continue;
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);
      if (entry.isDirectory()) {
        if (!fs.existsSync(destPath)) {
          fs.mkdirSync(destPath, { recursive: true });
        }
        syncExistingUploads(srcPath, destPath);
      } else if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  } catch (e) {}
}

// Sync from all potential locations (src, dist, php-web-app) into persistentUploadsDir
syncExistingUploads(path.resolve(process.cwd(), 'src', 'public', 'uploads'), persistentUploadsDir);
syncExistingUploads(path.resolve(process.cwd(), 'dist', 'public', 'uploads'), persistentUploadsDir);
syncExistingUploads(path.resolve(process.cwd(), '..', 'php-web-app', 'uploads'), persistentUploadsDir);
if (fs.existsSync(path.join(__dirname, 'public', 'uploads'))) {
  syncExistingUploads(path.join(__dirname, 'public', 'uploads'), persistentUploadsDir);
}

// Ensure subfolders exist
['logos', 'products', 'sounds', 'receipts'].forEach(sub => {
  const subPath = path.join(persistentUploadsDir, sub);
  if (!fs.existsSync(subPath)) fs.mkdirSync(subPath, { recursive: true });
});

// 1. Persistent User Uploads (served directly at /uploads/ from data/uploads)
fastify.register(fastifyStatic, {
  root: persistentUploadsDir,
  prefix: '/uploads/',
  decorateReply: false
});

// 1b. Public Uploads Alias (handles legacy paths starting with /public/uploads/)
fastify.register(fastifyStatic, {
  root: persistentUploadsDir,
  prefix: '/public/uploads/',
  decorateReply: false
});

// 2. Bundled Static Assets (CSS, JS, theme preview SVGs, etc. served at /)
fastify.register(fastifyStatic, {
  root: publicDir,
  prefix: '/'
});

// View Engine (EJS)
fastify.register(fastifyView, {
  engine: { ejs },
  root: viewsDir
});

// Register API Routes
fastify.register(chatRoutes);
fastify.register(chatWebSocketRoutes);
fastify.register(ordersRoutes);
fastify.register(authRoutes);
fastify.register(adminRoutes);
fastify.register(adminSecurityRoutes);
fastify.register(providerRoutes);
fastify.register(bankVerificationRoutes);
fastify.register(verificationRoutes);
fastify.register(disputesRoutes);
fastify.register(debtsRoutes);
fastify.register(ledgerRoutes);
fastify.register(marketingRoutes);
fastify.register(reviewsRoutes);
fastify.register(bulkRoutes);
fastify.register(broadcastsRoutes);
fastify.register(teamsRoutes);
fastify.register(branchesRoutes);
fastify.register(domainsRoutes);
fastify.register(multiStoreRoutes);
fastify.register(analyticsRoutes);
fastify.register(billingRoutes);

// Direct High-Speed Image Upload API (Up to 10MB per image, single or multiple)
fastify.post('/api/upload', async (req: FastifyRequest, reply: FastifyReply) => {
  const store = (req as any).session?.merchantStore;
  const adminId = (req as any).session?.admin_id;
  if (!store && !adminId) {
    return reply.code(401).send({ success: false, error: 'Unauthorized: Login required to upload files' });
  }

  const uploadDir = persistentUploadsDir;
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const uploadedFiles: string[] = [];
  try {
    const parts = req.files();
    for await (const part of parts) {
      const ext = path.extname(part.filename || '').toLowerCase() || '.png';
      const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif'];
      if (!allowedExts.includes(ext)) {
        return reply.code(400).send({ success: false, error: `Invalid image type '${ext}'. Supported: JPG, PNG, WEBP, GIF, SVG, AVIF.` });
      }

      const randomName = `img_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
      const targetPath = path.join(uploadDir, randomName);

      await pipeline(part.file, fs.createWriteStream(targetPath));
      uploadedFiles.push(`/uploads/${randomName}`);
    }
  } catch (err: any) {
    if (err.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(413).send({ success: false, error: 'Image exceeds maximum allowed size of 10MB.' });
    }
    return reply.code(500).send({ success: false, error: 'Failed to process file upload: ' + (err.message || 'Unknown error') });
  }

  if (uploadedFiles.length === 0) {
    return reply.code(400).send({ success: false, error: 'No image files uploaded.' });
  }

  return reply.send({
    success: true,
    url: uploadedFiles[0],
    urls: uploadedFiles
  });
});

// Customer Bank Transfer Receipt Upload API (Public endpoint for checkout proofs)
fastify.post('/api/upload/receipt', async (req: FastifyRequest, reply: FastifyReply) => {
  const uploadDir = path.join(persistentUploadsDir, 'receipts');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const uploadedFiles: string[] = [];
  try {
    const parts = req.files();
    for await (const part of parts) {
      const ext = path.extname(part.filename).toLowerCase() || '.jpg';
      const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
      if (!allowedExts.includes(ext)) {
        return reply.code(400).send({ success: false, error: 'Only image files (JPG, PNG, WEBP) or PDFs are allowed for payment receipts.' });
      }

      const randomName = `receipt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
      const targetPath = path.join(uploadDir, randomName);

      await pipeline(part.file, fs.createWriteStream(targetPath));
      uploadedFiles.push(`/uploads/receipts/${randomName}`);
    }
  } catch (err: any) {
    if (err.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(400).send({ success: false, error: 'Receipt file exceeds the 10MB maximum size limit.' });
    }
    return reply.code(500).send({ success: false, error: 'Failed to process receipt upload: ' + (err.message || 'Unknown error') });
  }

  if (uploadedFiles.length === 0) {
    return reply.code(400).send({ success: false, error: 'No receipt file provided.' });
  }

  return reply.send({
    success: true,
    url: uploadedFiles[0],
    urls: uploadedFiles
  });
});

// Merchant Items & Settings API
fastify.post('/api/merchant/items', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
  const store = (req as any).session?.merchantStore;
  if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized' });

  const body = (req.body || {}) as any;
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const itemPayload: Record<string, any> = {
    store_id: store.id,
    title: body.title?.trim() || 'Untitled Product',
    category: body.category?.trim() || 'General',
    description: body.description !== undefined ? body.description : null,
    price: Math.max(0, parseFloat(body.price || 0)),
    compare_price: body.compare_price !== undefined && body.compare_price !== '' && !isNaN(parseFloat(body.compare_price)) ? parseFloat(body.compare_price) : null,
    stock_quantity: body.stock_quantity !== undefined && body.stock_quantity !== '' && !isNaN(parseInt(body.stock_quantity)) ? parseInt(body.stock_quantity) : 0,
    low_stock_threshold: body.low_stock_threshold !== undefined && body.low_stock_threshold !== '' && !isNaN(parseInt(body.low_stock_threshold)) ? parseInt(body.low_stock_threshold) : 5,
    sku: body.sku ? body.sku.trim() : null,
    badge: body.badge ? body.badge.trim() : null,
    image_url: body.image_url ? body.image_url.trim() : null,
    gallery_json: typeof body.gallery_json === 'object' ? JSON.stringify(body.gallery_json) : (body.gallery_json || null),
    variants_json: typeof body.variants_json === 'object' ? JSON.stringify(body.variants_json) : (body.variants_json || null),
    option_groups_json: typeof body.option_groups_json === 'object' ? JSON.stringify(body.option_groups_json) : (body.option_groups_json || null),
    specs_json: typeof body.specs_json === 'object' ? JSON.stringify(body.specs_json) : (body.specs_json || null),
    attributes_json: typeof body.attributes_json === 'object' ? JSON.stringify(body.attributes_json) : (body.attributes_json || null),
    is_preorder: body.is_preorder ? 1 : 0,
    preorder_dispatch_date: body.preorder_dispatch_date ? body.preorder_dispatch_date.trim() : null,
    branch_id: body.branch_id ? parseInt(body.branch_id) : null,
    video_url: body.video_url ? body.video_url.trim() : null,
    is_available: body.is_available === 0 || body.is_available === false || body.is_available === '0' ? 0 : 1,
    updated_at: now
  };

  let item: any;
  if (body.id) {
    const existing = dbFetchOne<any>('items', { id: parseInt(body.id), store_id: store.id });
    if (!existing) return reply.code(404).send({ success: false, error: 'Product not found' });
    dbUpdate('items', itemPayload, { id: existing.id });
    item = dbFetchOne('items', { id: existing.id });
  } else {
    itemPayload.created_at = now;
    const itemId = dbInsert('items', itemPayload);
    item = dbFetchOne('items', { id: itemId });
  }

  return reply.send({ success: true, item });
});

fastify.delete('/api/merchant/items', async (req: FastifyRequest<{ Querystring: any }>, reply: FastifyReply) => {
  const store = (req as any).session?.merchantStore;
  if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized' });

  const id = parseInt((req.query as any)?.id || '0');
  dbDelete('items', { id, store_id: store.id });
  return reply.send({ success: true });
});

fastify.post('/api/merchant/settings', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
  const store = (req as any).session?.merchantStore;
  if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized' });

  const body = (req.body || {}) as any;
  const updates: Record<string, any> = {};

  if (body.slug && body.slug !== store.slug) {
    const slugCheck = validateStoreSlugAvailability(body.slug, store.id);
    if (!slugCheck.valid) {
      return reply.send({ success: false, error: slugCheck.error });
    }
    const newSlug = slugCheck.normalizedSlug;
    // Archive any old deleted store that had this slug
    const deletedStore = dbFetchOne<any>('stores', { slug: newSlug, status: 'deleted' });
    if (deletedStore) {
      dbUpdate('stores', { slug: `${newSlug}_archived_${deletedStore.id}` }, { id: deletedStore.id });
    }
    updates.slug = newSlug;
  }

  if (body.template_slug !== undefined) {
    const validTemplates = Object.keys(STORE_TEMPLATES);
    if (validTemplates.includes(body.template_slug)) {
      updates.template_slug = body.template_slug;
    }
  }

  if (body.store_name) {
    const rawName = body.store_name.trim();
    const seller = getOrCreateSellerProfile(store.id);
    const isVerifiedBus = seller?.business_status === 'verified';
    const sType = seller?.seller_type === 'business' ? 'business' : 'personal';
    const nameCheck = validateStoreName(rawName, sType, isVerifiedBus);
    if (!nameCheck.valid) {
      return reply.send({ success: false, error: nameCheck.reason });
    }
    updates.store_name = rawName;
  }
  if (body.bio !== undefined) updates.bio = body.bio.trim();
  if (body.logo_url !== undefined) updates.logo_url = body.logo_url;
  if (body.cover_url !== undefined) updates.cover_url = body.cover_url;
  if (body.cover_overlay_color !== undefined) updates.cover_overlay_color = body.cover_overlay_color;
  if (body.receipt_custom_note !== undefined) updates.receipt_custom_note = body.receipt_custom_note ? body.receipt_custom_note.trim() : null;
  if (body.receipt_show_logo !== undefined) updates.receipt_show_logo = body.receipt_show_logo ? 1 : 0;
  if (body.meta_pixel_id !== undefined) updates.meta_pixel_id = body.meta_pixel_id ? body.meta_pixel_id.trim() : null;
  if (body.google_tag_id !== undefined) updates.google_tag_id = body.google_tag_id ? body.google_tag_id.trim() : null;
  if (body.tiktok_pixel_id !== undefined) updates.tiktok_pixel_id = body.tiktok_pixel_id ? body.tiktok_pixel_id.trim() : null;
  if (body.alert_sound !== undefined) updates.alert_sound = body.alert_sound;
  if (body.delivery_fee !== undefined) updates.delivery_fee = parseFloat(body.delivery_fee || 0);
  if (body.allow_bank_transfer !== undefined) updates.allow_bank_transfer = body.allow_bank_transfer ? 1 : 0;
  if (body.allow_pay_on_delivery !== undefined) updates.allow_pay_on_delivery = body.allow_pay_on_delivery ? 1 : 0;

  // Validation guard: merchant cannot disable both payment methods simultaneously
  const nextBankTransfer = updates.allow_bank_transfer !== undefined ? updates.allow_bank_transfer : (store.allow_bank_transfer !== undefined ? store.allow_bank_transfer : 1);
  const nextPOD = updates.allow_pay_on_delivery !== undefined ? updates.allow_pay_on_delivery : (store.allow_pay_on_delivery !== undefined ? store.allow_pay_on_delivery : 0);
  if (nextBankTransfer === 0 && nextPOD === 0) {
    return reply.send({
      success: false,
      error: 'You must keep at least one payment method enabled (Direct Bank Transfer or Pay on Delivery).'
    });
  }

  // Check if bank account number is being modified
  const currentBankAcct = (store.bank_account_number || '').trim();
  const rawNewBankAcct = body.bank_account_number !== undefined ? String(body.bank_account_number).trim() : currentBankAcct;
  const isChangingBankAcct = rawNewBankAcct !== '' && rawNewBankAcct !== currentBankAcct;

  if (isChangingBankAcct) {
    const otpCode = (body.otp_code || '').trim();
    if (!otpCode) {
      return reply.send({
        success: false,
        require_otp: true,
        error: 'Security authorization code is required to change your payout bank account number.'
      });
    }

    const record = bankOtpStore.get(store.id) || bankChangeOtpStore.get(store.id);
    if (!record || Date.now() > record.expires_at) {
      return reply.send({
        success: false,
        require_otp: true,
        error: 'Verification code has expired or was not requested. Please request a new code.'
      });
    }

    const inputHash = crypto.createHash('sha256').update(otpCode).digest('hex');
    if (inputHash !== record.otp_hash) {
      return reply.send({
        success: false,
        require_otp: true,
        error: 'Invalid 6-digit verification code. Please check your email and try again.'
      });
    }

    // OTP Verified! Commit bank details to stores & seller_bank_accounts
    bankOtpStore.delete(store.id);
    bankChangeOtpStore.delete(store.id);

    const bankNameVal = body.bank_name ? body.bank_name.trim() : (record.bank_name || 'Nigerian Bank');
    const bankAccountNameVal = body.bank_account_name ? body.bank_account_name.trim() : (record.account_name || store.bank_account_name || store.store_name);

    updates.bank_account_number = rawNewBankAcct;
    updates.bank_name = bankNameVal;
    updates.bank_account_name = bankAccountNameVal;

    const seller = getOrCreateSellerProfile(store.id);
    saveVerifiedBankAccountRecord({
      sellerId: seller.id,
      storeId: store.id,
      bankCode: (record as any).bank_code || '000',
      bankName: bankNameVal,
      accountNumber: rawNewBankAcct,
      accountName: bankAccountNameVal,
      isVerified: true,
      actorType: 'merchant',
      ipAddress: req.ip
    });
  } else {
    // If account number did not change, allow updating bank name and account name if provided
    if (body.bank_name !== undefined) updates.bank_name = body.bank_name ? body.bank_name.trim() : null;
    if (body.bank_account_name !== undefined) updates.bank_account_name = body.bank_account_name ? body.bank_account_name.trim() : null;
    if (body.bank_account_number !== undefined && !isChangingBankAcct) updates.bank_account_number = body.bank_account_number ? body.bank_account_number.trim() : null;
  }

  dbUpdate('stores', updates, { id: store.id });
  (req as any).session.merchantStore = { ...store, ...updates };

  return reply.send({ success: true, store: (req as any).session.merchantStore });
});

// Inbound Enterprise Inquiry API
fastify.post('/api/enterprise-inquiry', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
  const body = (req.body as any) || {};
  const name = (body.name || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const phone = (body.phone || '').trim();
  const business_name = (body.business_name || '').trim();
  const store_volume = (body.store_volume || '').trim();
  const notes = (body.notes || '').trim();

  if (!name || !email) {
    return reply.code(400).send({ success: false, error: 'Full name and email are required.' });
  }
  if (!email.includes('@')) {
    return reply.code(400).send({ success: false, error: 'Please enter a valid email address.' });
  }

  try {
    const leadId = dbInsert('enterprise_leads', {
      name,
      email,
      phone: phone || null,
      business_name: business_name || null,
      store_volume: store_volume || null,
      notes: notes || null,
      status: 'new'
    });

    // Notify Super Admin via email (non-blocking)
    const superAdminEmail = ENV.SUPER_ADMIN_EMAIL || 'admin@zlik.store';
    try {
      const adminDashboardUrl = `${ENV.APP_URL}/${ENV.ADMIN_SECRET_PATH}`;
      await sendEmail({
        toEmail: superAdminEmail,
        toName: 'Zlik Super Admin',
        subject: `🏢 New Enterprise Inquiry: ${business_name || name}`,
        htmlContent: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #E3E9E5; border-radius: 16px; background: #ffffff;">
            <div style="margin-bottom: 20px;">
              <span style="background: #ede9fe; color: #6d28d9; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 999px; text-transform: uppercase;">Enterprise Lead</span>
              <h2 style="color: #08110D; margin: 8px 0 4px 0; font-size: 20px;">New Enterprise Inquiry Received</h2>
              <p style="color: #6B756F; font-size: 13px; margin: 0;">An enterprise customer submitted an inquiry from the landing page.</p>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; line-height: 1.6; margin-bottom: 20px;">
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6B756F; width: 140px; font-weight: 600;">Contact Name</td>
                <td style="padding: 10px 0; color: #08110D; font-weight: 600;">${name}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6B756F; font-weight: 600;">Work Email</td>
                <td style="padding: 10px 0;"><a href="mailto:${email}" style="color: #087A50; font-weight: 600; text-decoration: none;">${email}</a></td>
              </tr>
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6B756F; font-weight: 600;">Phone / WhatsApp</td>
                <td style="padding: 10px 0; color: #08110D;">${phone ? `<a href="tel:${phone}" style="color: #08110D; text-decoration: none;">${phone}</a> &bull; <a href="https://wa.me/${phone.replace(/[^0-9]/g, '')}" target="_blank" style="color: #25D366; font-weight: 600; text-decoration: none;">WhatsApp Chat</a>` : 'N/A'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6B756F; font-weight: 600;">Business Name</td>
                <td style="padding: 10px 0; color: #08110D; font-weight: 600;">${business_name || 'N/A'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6B756F; font-weight: 600;">Est. Sales Volume</td>
                <td style="padding: 10px 0; color: #08110D;">${store_volume || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #6B756F; font-weight: 600; vertical-align: top;">Requirements</td>
                <td style="padding: 10px 0; color: #08110D; white-space: pre-wrap;">${notes || 'None provided'}</td>
              </tr>
            </table>

            <div style="text-align: center; padding-top: 10px;">
              <a href="${adminDashboardUrl}" style="background: #19D98B; color: #08110D; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: bold; font-size: 13px; display: inline-block;">Open Super Admin Dashboard &rarr;</a>
            </div>
          </div>
        `,
        templateName: 'enterprise_inquiry'
      });
    } catch (e: any) {
      fastify.log.warn('Could not dispatch enterprise alert email: ' + (e?.message || e));
    }

    return reply.send({ success: true, message: 'Inquiry received successfully.', leadId });
  } catch (err: any) {
    fastify.log.error(err);
    return reply.code(500).send({ success: false, error: 'Failed to record inquiry: ' + (err.message || 'Unknown database error') });
  }
});

// SSR Page Routes

// 1. Landing Page
fastify.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
  const settings = getPlatformSettings();
  const plans = getEffectivePlans();
  return reply.view('landing.ejs', { settings, plans });
});

// 1b. Terms of Service
fastify.get('/terms', async (req: FastifyRequest, reply: FastifyReply) => {
  return reply.view('terms.ejs');
});

// 1c. Privacy Policy (NDPA & NDPR Compliant)
fastify.get('/privacy', async (req: FastifyRequest, reply: FastifyReply) => {
  return reply.view('privacy.ejs');
});

// 2. Marketplace Directory
fastify.get('/marketplace', async (req: FastifyRequest, reply: FastifyReply) => {
  const rawStores = dbFetchAll<any>('stores', { status: 'active' });
  const stores = rawStores.map(s => ({
    ...s,
    category_info: getStoreCategoryInfo(s)
  }));
  return reply.view('marketplace.ejs', { stores, categories: STORE_MARKETPLACE_CATEGORIES, states: NIGERIAN_STATES });
});

// 3. Merchant Login View & Aliases
fastify.get('/login', async (req: FastifyRequest, reply: FastifyReply) => {
  return reply.redirect('/merchant/login');
});

fastify.get('/register', async (req: FastifyRequest, reply: FastifyReply) => {
  return reply.redirect('/?signup=1');
});

fastify.get('/merchant/login', async (req: FastifyRequest, reply: FastifyReply) => {
  if ((req as any).session?.merchantStore) {
    return reply.redirect('/merchant');
  }
  return reply.view('merchant/login.ejs');
});

// 4. Merchant Dashboard View
fastify.get('/merchant', async (req: FastifyRequest, reply: FastifyReply) => {
  const store = (req as any).session?.merchantStore;
  if (!store) return reply.redirect('/merchant/login');

  const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
  const orders = dbFetchAll<any>('orders', { store_id: currentStore.id }, 'id DESC');
  const items = dbFetchAll<any>('items', { store_id: currentStore.id, is_available: 1 });
  const lowStockItems = items.filter(i => i.stock_quantity > -1 && i.stock_quantity <= (i.low_stock_threshold || 5));
  const revenueMetrics = calculateStoreRevenueMetrics(orders);
  const visitorMetrics = getStoreVisitorMetrics(currentStore.id);
  const { isPro, config } = getStorePlanDetails(currentStore);
  const templateConfig = getStoreTemplateConfig(currentStore.template_slug);

  const seller = getOrCreateSellerProfile(currentStore.id);
  const isGated = isStoreOrderGated(currentStore.id);

  return reply.view('merchant/dashboard.ejs', {
    store: currentStore,
    orders,
    revenueMetrics,
    visitorMetrics,
    lowStockItems,
    isPro,
    planConfig: config,
    templateConfig,
    allTemplates: STORE_TEMPLATES,
    sellerProfile: seller,
    isGated
  });
});

// 5. Merchant Live Chat Messages View
fastify.get('/merchant/messages', async (req: FastifyRequest, reply: FastifyReply) => {
  const store = (req as any).session?.merchantStore;
  if (!store) return reply.redirect('/merchant/login');

  const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
  return reply.view('merchant/messages.ejs', { store: currentStore });
});

// 6. Merchant Items View
fastify.get('/merchant/items', async (req: FastifyRequest, reply: FastifyReply) => {
  const store = (req as any).session?.merchantStore;
  if (!store) return reply.redirect('/merchant/login');

  const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
  const items = dbFetchAll<any>('items', { store_id: currentStore.id }, 'id DESC');
  const templateConfig = getStoreTemplateConfig(currentStore.template_slug);
  const { isPro, config } = getStorePlanDetails(currentStore);

  return reply.view('merchant/items.ejs', {
    store: currentStore,
    items,
    templateConfig,
    allTemplates: STORE_TEMPLATES,
    isPro,
    planConfig: config
  });
});

// 6b. Merchant Reviews Moderation View
fastify.get('/merchant/reviews', async (req: FastifyRequest, reply: FastifyReply) => {
  const store = (req as any).session?.merchantStore;
  if (!store) return reply.redirect('/merchant/login');

  const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
  const { isPro, config } = getStorePlanDetails(currentStore);
  const items = dbFetchAll<any>('items', { store_id: currentStore.id }, 'title ASC');
  const query = (req.query || {}) as Record<string, any>;
  const filterStatus = query.status ? String(query.status) : 'all';
  const filterItemId = query.item_id ? parseInt(query.item_id, 10) : undefined;
  const filterRating = query.rating ? parseInt(query.rating, 10) : undefined;

  const data = getMerchantReviewsList(currentStore.id, {
    status: filterStatus === 'all' ? undefined : filterStatus,
    item_id: filterItemId,
    rating: filterRating
  });

  return reply.view('merchant/reviews.ejs', {
    store: currentStore,
    reviews: data.reviews,
    items,
    pending_count: data.pending_count,
    total: data.total,
    currentFilter: {
      status: filterStatus,
      item_id: filterItemId || '',
      rating: filterRating || ''
    },
    isPro,
    planConfig: config
  });
});

// 7. Merchant Sales Ledger View
fastify.get('/merchant/ledger', async (req: FastifyRequest, reply: FastifyReply) => {
  const store = (req as any).session?.merchantStore;
  if (!store) return reply.redirect('/merchant/login');

  const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
  const { isPro, config } = getStorePlanDetails(currentStore);
  const db = getDb();

  let orders: any[] = [];
  const now = new Date();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  if (!isPro) {
    // Free plan: includes today, yesterday, this week, this month, and last month
    const stmt = db.prepare(`
      SELECT * FROM orders 
      WHERE store_id = ? AND created_at >= ? 
      ORDER BY id DESC
    `);
    orders = stmt.all(currentStore.id, lastMonthStart) as any[];
  } else {
    orders = dbFetchAll<any>('orders', { store_id: currentStore.id }, 'id DESC');
  }

  const paidOrders = orders.filter(o => o.payment_status === 'paid');
  const totalSalesRevenue = paidOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
  const averageOrderValue = paidOrders.length > 0 ? (totalSalesRevenue / paidOrders.length) : 0;
  const pendingOrdersCount = orders.filter(o => o.payment_status !== 'paid').length;

  const summary = {
    total_orders: orders.length,
    paid_orders_count: paidOrders.length,
    pending_orders_count: pendingOrdersCount,
    total_revenue: totalSalesRevenue,
    average_order_value: averageOrderValue,
    is_restricted: !isPro,
    allowed_free_timeframes: ['today', 'yesterday', 'this_week', 'this_month', 'last_month']
  };

  return reply.view('merchant/ledger.ejs', {
    store: currentStore,
    orders,
    summary,
    isPro,
    planConfig: config
  });
});

// 8. Merchant Debt Tracker View
fastify.get('/merchant/debts', async (req: FastifyRequest, reply: FastifyReply) => {
  const store = (req as any).session?.merchantStore;
  if (!store) return reply.redirect('/merchant/login');

  const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
  const { isPro, config } = getStorePlanDetails(currentStore);

  const debts = dbFetchAll<any>('debts', { store_id: currentStore.id }, 'id DESC');
  const activeDebts = debts.filter(d => d.status === 'pending');
  const paidDebts = debts.filter(d => d.status === 'paid');

  const totalOutstanding = activeDebts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const totalRecovered = paidDebts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  const stats = {
    total_outstanding: totalOutstanding,
    total_recovered: totalRecovered,
    active_count: activeDebts.length,
    paid_count: paidDebts.length,
    max_active_limit: config.limits.active_debts_limit
  };

  return reply.view('merchant/debts.ejs', {
    store: currentStore,
    debts,
    stats,
    isPro,
    planConfig: config
  });
});

// 9. Merchant Settings View
fastify.get('/merchant/settings', async (req: FastifyRequest, reply: FastifyReply) => {
  const store = (req as any).session?.merchantStore;
  if (!store) return reply.redirect('/merchant/login');

  const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
  const { isPro, config } = getStorePlanDetails(currentStore);
  const templateConfig = getStoreTemplateConfig(currentStore.template_slug);

  return reply.view('merchant/settings.ejs', {
    store: currentStore,
    templateConfig,
    allTemplates: STORE_TEMPLATES,
    storeCategories: STORE_CATEGORIES,
    isPro,
    planConfig: config
  });
});

// 9b. Merchant Trust & Identity Verification View
fastify.get('/merchant/verification', async (req: FastifyRequest, reply: FastifyReply) => {
  const store = (req as any).session?.merchantStore;
  if (!store) return reply.redirect('/merchant/login');

  const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
  const seller = getOrCreateSellerProfile(currentStore.id);
  const isGated = isStoreOrderGated(currentStore.id);
  const bankAccounts = dbFetchAll<any>('seller_bank_accounts', { seller_id: seller.id });
  const verifications = dbFetchAll<any>('seller_verifications', { seller_id: seller.id });
  const businessProfile = dbFetchOne<any>('business_profiles', { seller_id: seller.id });
  const { isPro, config } = getStorePlanDetails(currentStore);

  return reply.view('merchant/verification.ejs', {
    store: currentStore,
    sellerProfile: seller,
    businessProfile,
    isGated,
    bankAccounts,
    verifications,
    isPro,
    planConfig: config
  });
});

// 8. Order Tracking View
fastify.get('/order/:ref', async (req: FastifyRequest<{ Params: { ref: string } }>, reply: FastifyReply) => {
  const ref = req.params.ref;
  const order = dbFetchOne<any>('orders', { order_ref: ref });
  if (!order) return reply.code(404).send('Order not found');

  const store = dbFetchOne<any>('stores', { id: order.store_id });
  let items: any[] = [];
  try { items = typeof order.items_json === 'string' ? JSON.parse(order.items_json) : order.items_json; } catch(e) {}

  return reply.view('order_track.ejs', { order, store, items });
});

// 9. Order Receipt View
fastify.get('/receipt/:ref', async (req: FastifyRequest<{ Params: { ref: string } }>, reply: FastifyReply) => {
  const ref = req.params.ref;
  const order = dbFetchOne<any>('orders', { order_ref: ref });
  if (!order) return reply.code(404).send('Receipt not found');

  const store = dbFetchOne<any>('stores', { id: order.store_id });
  let items: any[] = [];
  try { items = typeof order.items_json === 'string' ? JSON.parse(order.items_json) : order.items_json; } catch(e) {}

  return reply.view('receipt.ejs', { order, store, items });
});

// Helper to check if store has active, valid promo codes with timeframe/discount
const checkHasActiveCoupons = (storeId: number): boolean => {
  try {
    const coupons = dbFetchAll<any>('coupons', { store_id: storeId, status: 'active' });
    const now = new Date();
    return coupons.some(c => {
      const discountVal = parseFloat(c.discount_value || 0);
      if (isNaN(discountVal) || discountVal <= 0) return false;
      if (c.expires_at) {
        const exp = new Date(c.expires_at);
        if (isNaN(exp.getTime()) || exp < now) return false;
      }
      if (c.max_uses > 0 && c.uses_count >= c.max_uses) return false;
      return true;
    });
  } catch (e) {
    return false;
  }
};

// 10. Checkout Page View (/store/:slug/checkout or /:slug/checkout)
const renderCheckout = async (req: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) => {
  const slug = req.params.slug;
  const store = dbFetchOne<any>('stores', { slug });
  if (!store || store.status === 'deleted') return reply.code(404).send('Store not found');
  const templateConfig = getStoreTemplateConfig(store.template_slug);
  const hasActiveCoupons = checkHasActiveCoupons(store.id);
  const seller = getOrCreateSellerProfile(store.id);
  const isGated = isStoreOrderGated(store.id);
  const businessProfile = dbFetchOne<any>('business_profiles', { seller_id: seller.id });
  const activeBankAccount = dbFetchOne<any>('seller_bank_accounts', { seller_id: seller.id, is_active: 1 });
  return reply.view('checkout.ejs', {
    store,
    templateConfig,
    hasActiveCoupons,
    isGated,
    sellerProfile: seller,
    businessProfile,
    activeBankAccount
  });
};

fastify.get('/store/:slug/checkout', renderCheckout);
fastify.get('/:slug/checkout', renderCheckout);

// 11. Template Live Demo / Sample Preview View (/demo/:slug or /preview/:slug)
const renderTemplateDemo = async (req: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) => {
  const templateSlug = req.params.slug;
  const sampleData = getSampleDataForTemplate(templateSlug);
  const templateConfig = getStoreTemplateConfig(templateSlug);
  const categories = Array.from(new Set(sampleData.items.map(i => i.category || 'General')));

  return reply.view('store.ejs', {
    store: sampleData.store,
    items: sampleData.items,
    categories,
    templateConfig,
    allTemplates: STORE_TEMPLATES,
    isDemo: true,
    hasActiveCoupons: false,
    isGated: false,
    sellerProfile: null,
    businessProfile: null,
    activeBankAccount: null
  });
};

fastify.get('/demo/:slug', renderTemplateDemo);
fastify.get('/preview/:slug', renderTemplateDemo);

// 12. Public Storefront View (/store/:slug or /:slug)
const renderStorefront = async (req: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) => {
  const slug = req.params.slug;
  const store = dbFetchOne<any>('stores', { slug });
  if (!store || store.status === 'deleted') return reply.code(404).send('Store not found');

  try {
    recordStoreVisit(store.id, req.ip, req.headers['user-agent'] as string);
  } catch (e) {}

  const items = dbFetchAll<any>('items', { store_id: store.id, is_available: 1 }, 'id DESC');
  const categories = Array.from(new Set(items.map(i => i.category || 'General')));
  const planDetails = getStorePlanDetails(store);
  const templateConfig = getStoreTemplateConfig(store.template_slug);
  const hasActiveCoupons = checkHasActiveCoupons(store.id);
  const seller = getOrCreateSellerProfile(store.id);
  const isGated = isStoreOrderGated(store.id);
  const businessProfile = dbFetchOne<any>('business_profiles', { seller_id: seller.id });
  const activeBankAccount = dbFetchOne<any>('seller_bank_accounts', { seller_id: seller.id, is_active: 1 });

  return reply.view('store.ejs', {
    store,
    items,
    categories,
    templateConfig,
    allTemplates: STORE_TEMPLATES,
    isDemo: false,
    isPro: planDetails.isPro,
    showPoweredBy: Boolean(planDetails.config.features.powered_by_zlik),
    hasActiveCoupons,
    isGated,
    sellerProfile: seller,
    businessProfile,
    activeBankAccount
  });
};

fastify.get('/store/:slug', renderStorefront);
fastify.get('/:slug', renderStorefront);

// Start High-Speed Server
async function startServer() {
  const PORT = ENV.PORT;
  const HOST = ENV.HOST;

  try {
    // 1. Initialize Hostinger MySQL Persistence Bridge (Auto-creates tables & restores store owners)
    await initMySQLPersistence();

    // 2. Initialize Super Admin Credentials & Security Baseline (after schema exists and data is hydrated)
    initSuperAdminAccount();
    initSecurityDataModel();

    await fastify.listen({ port: PORT, host: HOST });
    console.log(`⚡ Zlik High-Speed Server running in [${ENV.NODE_ENV}] mode on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  } catch (err) {
    console.error('⚡ Server listen error:', err);
    process.exit(1);
  }
}

startServer().catch((err) => {
  console.error('⚡ Fatal server startup error:', err);
  process.exit(1);
});

export default fastify;
export { fastify, startServer };

