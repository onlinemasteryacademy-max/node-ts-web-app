import crypto from 'node:crypto';
import { dbFetchOne, dbFetchAll, dbInsert, dbUpdate } from '../../db/db.js';
import { hashPassword, comparePassword, normalizePhoneNumber } from '../../utils/helpers.js';
import { sendAffiliateWelcomeEmail } from '../email/mailer.js';

export interface AffiliateRecord {
  id: number;
  referral_code: string;
  full_name: string;
  email: string;
  phone: string;
  password_hash: string;
  bank_name?: string | null;
  bank_code?: string | null;
  account_number?: string | null;
  account_name?: string | null;
  wallet_balance: number;
  total_earned: number;
  total_withdrawn: number;
  tier: 'standard' | 'pro';
  commission_rate: number;
  status: 'active' | 'suspended';
  created_at?: string;
  updated_at?: string;
}

export interface AffiliateReferralRecord {
  id: number;
  affiliate_id: number;
  store_id: number;
  store_name: string;
  store_slug: string;
  owner_name: string;
  owner_email: string;
  cookie_session_id?: string | null;
  signup_date: string;
  commission_expires_at: string; // 365 days from signup
  status: 'active' | 'expired';
  total_commissions_generated: number;
  created_at?: string;
}

/**
 * Generate a clean, unique alphanumeric referral code from name
 */
export function generateAffiliateCode(fullName: string): string {
  const base = fullName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8) || 'partner';
  const rand = crypto.randomInt(100, 999);
  let candidate = `${base}${rand}`;
  let attempts = 0;

  while (dbFetchOne<any>('affiliates', { referral_code: candidate }) && attempts < 20) {
    candidate = `${base}${crypto.randomInt(1000, 9999)}`;
    attempts++;
  }

  return candidate;
}

/**
 * Register a new Affiliate partner
 */
export async function registerAffiliate(params: {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  tier?: 'standard' | 'pro';
  commissionRate?: number;
}): Promise<{ success: boolean; affiliate?: AffiliateRecord; error?: string }> {
  const fullName = (params.fullName || '').trim();
  const email = (params.email || '').toLowerCase().trim();
  const phone = (params.phone || '').trim();
  const password = (params.password || '').trim();
  const tier: 'standard' | 'pro' = params.tier || 'standard';
  const commissionRate = params.commissionRate !== undefined 
    ? Number(params.commissionRate) 
    : (tier === 'pro' ? 0.70 : 0.30);

  if (!fullName || !email || !phone || !password) {
    return { success: false, error: 'Full name, email address, phone number, and password are required' };
  }

  if (!email.includes('@') || !email.includes('.')) {
    return { success: false, error: 'Please enter a valid email address' };
  }

  if (password.length < 5) {
    return { success: false, error: 'Password or PIN must be at least 5 characters' };
  }

  // Check existing affiliate by email
  const existingByEmail = dbFetchOne<any>('affiliates', { email });
  if (existingByEmail) {
    return { success: false, error: 'An affiliate partner account already exists with this email address. Please sign in.' };
  }

  // Check existing by normalized phone
  const phoneNorm = normalizePhoneNumber(phone);
  const allAffs = dbFetchAll<any>('affiliates');
  const existingByPhone = allAffs.find(a => {
    const aNorm = normalizePhoneNumber(a.phone);
    return aNorm === phoneNorm || (phoneNorm.length >= 7 && aNorm.endsWith(phoneNorm.slice(-10)));
  });
  if (existingByPhone) {
    return { success: false, error: 'An affiliate partner account already exists with this phone number. Please sign in.' };
  }

  const referralCode = generateAffiliateCode(fullName);
  const passHash = await hashPassword(password);
  const now = new Date().toISOString();

  const id = dbInsert('affiliates', {
    referral_code: referralCode,
    full_name: fullName,
    email,
    phone,
    password_hash: passHash,
    wallet_balance: 0.00,
    total_earned: 0.00,
    total_withdrawn: 0.00,
    tier,
    commission_rate: commissionRate,
    status: 'active',
    created_at: now,
    updated_at: now
  });

  const affiliate = dbFetchOne<AffiliateRecord>('affiliates', { id })!;
  return { success: true, affiliate };
}

/**
 * Affiliate Login (supports email or phone + password)
 */
export async function loginAffiliate(
  identifier: string,
  password: string
): Promise<{ success: boolean; affiliate?: AffiliateRecord; error?: string }> {
  const ident = (identifier || '').trim();
  const pass = (password || '').trim();

  if (!ident || !pass) {
    return { success: false, error: 'Please enter your email or phone number and password' };
  }

  let affiliate: any = null;

  if (ident.includes('@')) {
    affiliate = dbFetchOne<any>('affiliates', { email: ident.toLowerCase() });
  }

  if (!affiliate) {
    const phoneNorm = normalizePhoneNumber(ident);
    const allAffs = dbFetchAll<any>('affiliates');
    affiliate = allAffs.find(a => {
      const aNorm = normalizePhoneNumber(a.phone);
      return aNorm === phoneNorm || (phoneNorm.length >= 7 && aNorm.endsWith(phoneNorm.slice(-10)));
    });
  }

  if (!affiliate) {
    // Try matching referral code
    affiliate = dbFetchOne<any>('affiliates', { referral_code: ident.toLowerCase() });
  }

  if (!affiliate) {
    return { success: false, error: 'No affiliate account found with these credentials' };
  }

  if (affiliate.status === 'suspended') {
    return { success: false, error: 'Your affiliate account has been suspended. Please contact support.' };
  }

  const matches = await comparePassword(pass, affiliate.password_hash);
  if (!matches) {
    return { success: false, error: 'Incorrect password' };
  }

  return { success: true, affiliate };
}

/**
 * Update Affiliate Payout Bank Account Details
 */
export function updateAffiliateBankDetails(
  affiliateId: number,
  bankName: string,
  accountNumber: string,
  accountName: string,
  bankCode?: string
): { success: boolean; affiliate?: AffiliateRecord; error?: string } {
  const bName = (bankName || '').trim();
  const accNum = (accountNumber || '').trim();
  const accName = (accountName || '').trim();

  if (!bName || !accNum || !accName) {
    return { success: false, error: 'Bank name, 10-digit account number, and account name are required' };
  }

  if (!/^\d{10}$/.test(accNum)) {
    return { success: false, error: 'Please enter a valid 10-digit NUBAN account number' };
  }

  const affiliate = dbFetchOne<AffiliateRecord>('affiliates', { id: affiliateId });
  if (!affiliate) {
    return { success: false, error: 'Affiliate not found' };
  }

  dbUpdate('affiliates', {
    bank_name: bName,
    bank_code: bankCode || null,
    account_number: accNum,
    account_name: accName,
    updated_at: new Date().toISOString()
  }, { id: affiliateId });

  const updated = dbFetchOne<AffiliateRecord>('affiliates', { id: affiliateId })!;
  return { success: true, affiliate: updated };
}

/**
 * Bind Referred Store to Affiliate with exactly 12 Months Commission Expiry
 */
export function bindReferredStore(
  storeId: number,
  referralCode: string,
  cookieSessionId?: string
): { success: boolean; referral?: AffiliateReferralRecord; error?: string } {
  if (!referralCode) return { success: false, error: 'Referral code required' };

  const affiliate = dbFetchOne<AffiliateRecord>('affiliates', { referral_code: referralCode.trim() });
  if (!affiliate || affiliate.status !== 'active') {
    return { success: false, error: 'Invalid or inactive affiliate referral code' };
  }

  const store = dbFetchOne<any>('stores', { id: storeId });
  if (!store) {
    return { success: false, error: 'Store not found' };
  }

  // Check if store was already bound
  const existingRef = dbFetchOne<any>('affiliate_referrals', { store_id: storeId });
  if (existingRef) {
    return { success: false, error: 'Store already bound to a referral' };
  }

  // 12 months (365 days) from signup
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const referralId = dbInsert('affiliate_referrals', {
    affiliate_id: affiliate.id,
    store_id: store.id,
    store_name: store.store_name,
    store_slug: store.slug,
    owner_name: store.owner_name,
    owner_email: store.email || '',
    cookie_session_id: cookieSessionId || null,
    signup_date: now.toISOString(),
    commission_expires_at: expiresAt.toISOString(),
    status: 'active',
    total_commissions_generated: 0.00,
    created_at: now.toISOString()
  });

  // Stamp store record with affiliate ID
  dbUpdate('stores', { referred_by_affiliate_id: affiliate.id }, { id: store.id });

  const referral = dbFetchOne<AffiliateReferralRecord>('affiliate_referrals', { id: referralId })!;
  return { success: true, referral };
}

/**
 * Fetch Full Dashboard Overview for an Affiliate Partner
 */
export function getAffiliateDashboardData(affiliateId: number) {
  const affiliate = dbFetchOne<AffiliateRecord>('affiliates', { id: affiliateId });
  if (!affiliate) return null;

  const referrals = dbFetchAll<AffiliateReferralRecord>('affiliate_referrals', { affiliate_id: affiliateId });
  const commissions = dbFetchAll<any>('affiliate_commissions', { affiliate_id: affiliateId });
  const payouts = dbFetchAll<any>('affiliate_payouts', { affiliate_id: affiliateId });

  const nowMs = Date.now();

  const formattedReferrals = referrals.map(r => {
    const expiryMs = new Date(r.commission_expires_at).getTime();
    const daysRemaining = Math.max(0, Math.ceil((expiryMs - nowMs) / (1000 * 60 * 60 * 24)));
    const isExpired = nowMs > expiryMs;

    return {
      ...r,
      days_remaining: daysRemaining,
      is_active: !isExpired,
      commission_window_label: isExpired ? 'Expired (1 Year Reached)' : `${daysRemaining} days left`
    };
  });

  return {
    affiliate: {
      id: affiliate.id,
      full_name: affiliate.full_name,
      email: affiliate.email,
      phone: affiliate.phone,
      referral_code: affiliate.referral_code,
      wallet_balance: affiliate.wallet_balance || 0,
      total_earned: affiliate.total_earned || 0,
      total_withdrawn: affiliate.total_withdrawn || 0,
      bank_name: affiliate.bank_name,
      bank_code: affiliate.bank_code,
      account_number: affiliate.account_number,
      account_name: affiliate.account_name,
      status: affiliate.status
    },
    metrics: {
      total_referrals: referrals.length,
      active_referrals: formattedReferrals.filter(r => r.is_active).length,
      wallet_balance: affiliate.wallet_balance || 0,
      total_earned: affiliate.total_earned || 0,
      total_withdrawn: affiliate.total_withdrawn || 0,
      can_withdraw: (affiliate.wallet_balance || 0) >= 10000 && Boolean(affiliate.account_number)
    },
    referrals: formattedReferrals.sort((a, b) => b.id - a.id),
    commissions: commissions.sort((a, b) => b.id - a.id).slice(0, 50),
    payouts: payouts.sort((a, b) => b.id - a.id)
  };
}

/**
 * Process 70% Affiliate Commission on Verified Subscription Payment
 * Only awards commission if the payment occurs within 12 months (365 days) of referral
 */
export function processSubscriptionCommission(
  storeId: number,
  subscriptionAmount: number,
  paymentReference: string
): { awarded: boolean; commissionAmount?: number; reason?: string } {
  if (!storeId || !subscriptionAmount || subscriptionAmount <= 0 || !paymentReference) {
    return { awarded: false, reason: 'Invalid parameters' };
  }

  // Idempotency check: prevent duplicate commission credits for the same transaction reference
  const existingComm = dbFetchOne<any>('affiliate_commissions', { payment_reference: paymentReference });
  if (existingComm) {
    return { awarded: false, reason: 'Commission already processed for this payment reference' };
  }

  const referral = dbFetchOne<AffiliateReferralRecord>('affiliate_referrals', { store_id: storeId });
  if (!referral) {
    return { awarded: false, reason: 'Store was not referred by any affiliate' };
  }

  const affiliate = dbFetchOne<AffiliateRecord>('affiliates', { id: referral.affiliate_id });
  if (!affiliate || affiliate.status !== 'active') {
    return { awarded: false, reason: 'Affiliate account is inactive or not found' };
  }

  // 12-Month Rule Check: referrals only earn for up to 365 days
  const nowMs = Date.now();
  const expiryMs = new Date(referral.commission_expires_at).getTime();
  if (nowMs > expiryMs) {
    dbUpdate('affiliate_referrals', { status: 'expired' }, { id: referral.id });
    return { awarded: false, reason: '12-month commission earning window has expired' };
  }

  // Dynamic commission calculation based on affiliate's assigned rate & tier
  const affiliateRate = Number(affiliate.commission_rate);
  const commissionRate = (!isNaN(affiliateRate) && affiliateRate > 0)
    ? affiliateRate
    : (affiliate.tier === 'pro' ? 0.70 : 0.30);
  const commissionAmount = Math.round(subscriptionAmount * commissionRate);

  // Record commission event
  dbInsert('affiliate_commissions', {
    affiliate_id: affiliate.id,
    referral_id: referral.id,
    store_id: storeId,
    payment_reference: paymentReference,
    subscription_amount: subscriptionAmount,
    commission_rate: commissionRate,
    commission_amount: commissionAmount,
    status: 'approved',
    earned_at: new Date(nowMs).toISOString()
  });

  // Increment affiliate wallet balance and total earned
  const newBalance = (Number(affiliate.wallet_balance) || 0) + commissionAmount;
  const newEarned = (Number(affiliate.total_earned) || 0) + commissionAmount;
  dbUpdate('affiliates', {
    wallet_balance: newBalance,
    total_earned: newEarned,
    updated_at: new Date(nowMs).toISOString()
  }, { id: affiliate.id });

  // Increment referral total generated
  const newRefTotal = (Number(referral.total_commissions_generated) || 0) + commissionAmount;
  dbUpdate('affiliate_referrals', {
    total_commissions_generated: newRefTotal
  }, { id: referral.id });

  return { awarded: true, commissionAmount };
}

/**
 * Request Affiliate Payout (Minimum Withdrawal: ₦10,000)
 */
export function requestAffiliatePayout(
  affiliateId: number,
  requestedAmount?: number
): { success: boolean; payoutId?: number; amount?: number; error?: string } {
  const affiliate = dbFetchOne<AffiliateRecord>('affiliates', { id: affiliateId });
  if (!affiliate) {
    return { success: false, error: 'Affiliate account not found' };
  }

  if (!affiliate.account_number || !affiliate.bank_name || !affiliate.account_name) {
    return { success: false, error: 'Please update your Nigerian bank account details before requesting a payout.' };
  }

  const currentBalance = Number(affiliate.wallet_balance) || 0;
  const amountToWithdraw = requestedAmount ? Number(requestedAmount) : currentBalance;

  // Enforce ₦10,000 Minimum Payout Rule
  const MIN_WITHDRAWAL = 10000;
  if (amountToWithdraw < MIN_WITHDRAWAL) {
    return { 
      success: false, 
      error: `Minimum withdrawal amount is ₦${MIN_WITHDRAWAL.toLocaleString()}. Your current balance is ₦${currentBalance.toLocaleString()}.` 
    };
  }

  if (amountToWithdraw > currentBalance) {
    return { 
      success: false, 
      error: `Insufficient balance. You requested ₦${amountToWithdraw.toLocaleString()} but have ₦${currentBalance.toLocaleString()} available.` 
    };
  }

  const now = new Date().toISOString();

  // Insert payout request
  const payoutId = dbInsert('affiliate_payouts', {
    affiliate_id: affiliate.id,
    amount: amountToWithdraw,
    bank_name: affiliate.bank_name,
    account_number: affiliate.account_number,
    account_name: affiliate.account_name,
    status: 'pending',
    created_at: now,
    updated_at: now
  });

  // Deduct from wallet balance
  const remainingBalance = currentBalance - amountToWithdraw;
  dbUpdate('affiliates', {
    wallet_balance: remainingBalance,
    updated_at: now
  }, { id: affiliate.id });

  return { success: true, payoutId, amount: amountToWithdraw };
}

/**
 * Super Admin: Get all affiliates with summary metrics
 */
export function getAllAffiliatesForAdmin() {
  const affiliates = dbFetchAll<AffiliateRecord>('affiliates');
  const referrals = dbFetchAll<AffiliateReferralRecord>('affiliate_referrals');
  const commissions = dbFetchAll<any>('affiliate_commissions');
  const payouts = dbFetchAll<any>('affiliate_payouts');

  return affiliates.map(aff => {
    const affReferrals = referrals.filter(r => Number(r.affiliate_id) === aff.id);
    const activeRefs = affReferrals.filter(r => r.status === 'active' && new Date(r.commission_expires_at).getTime() > Date.now());
    const affCommissions = commissions.filter(c => Number(c.affiliate_id) === aff.id);
    const affPayouts = payouts.filter(p => Number(p.affiliate_id) === aff.id);
    const totalWithdrawn = affPayouts
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const pendingPayout = affPayouts
      .filter(p => p.status === 'pending')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    return {
      ...aff,
      referral_count: affReferrals.length,
      active_referral_count: activeRefs.length,
      total_sales_count: affCommissions.length,
      total_withdrawn: totalWithdrawn,
      pending_payout: pendingPayout,
      referrals: affReferrals
    };
  });
}

/**
 * Super Admin: Get all payout requests with affiliate details
 */
export function getAllAffiliatePayoutsForAdmin() {
  const payouts = dbFetchAll<any>('affiliate_payouts');
  const affiliates = dbFetchAll<AffiliateRecord>('affiliates');
  const affMap = new Map<number, AffiliateRecord>(affiliates.map(a => [a.id, a]));

  return payouts.map(p => {
    const aff = affMap.get(Number(p.affiliate_id));
    return {
      ...p,
      affiliate_name: aff?.full_name || 'Unknown Affiliate',
      affiliate_email: aff?.email || '',
      affiliate_phone: aff?.phone || '',
      affiliate_code: aff?.referral_code || ''
    };
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/**
 * Super Admin: Approve Payout and Mark as Paid
 */
export function approveAffiliatePayout(
  payoutId: number,
  notes?: string,
  txRef?: string
): { success: boolean; payout?: any; error?: string } {
  const payout = dbFetchOne<any>('affiliate_payouts', { id: payoutId });
  if (!payout) {
    return { success: false, error: 'Payout request not found' };
  }

  if (payout.status !== 'pending') {
    return { success: false, error: `Payout request is already ${payout.status}` };
  }

  const now = new Date().toISOString();
  dbUpdate('affiliate_payouts', {
    status: 'paid',
    admin_notes: notes || 'Approved & processed by Super Admin',
    transaction_reference: txRef || `TX_PAYOUT_${payoutId}_${Date.now()}`,
    paid_at: now,
    updated_at: now
  }, { id: payoutId });

  const updated = dbFetchOne<any>('affiliate_payouts', { id: payoutId });
  return { success: true, payout: updated };
}

/**
 * Super Admin: Reject Payout and Refund to Affiliate Wallet
 */
export function rejectAffiliatePayout(
  payoutId: number,
  reason: string
): { success: boolean; payout?: any; error?: string } {
  const payout = dbFetchOne<any>('affiliate_payouts', { id: payoutId });
  if (!payout) {
    return { success: false, error: 'Payout request not found' };
  }

  if (payout.status !== 'pending') {
    return { success: false, error: `Payout request is already ${payout.status}` };
  }

  const affiliate = dbFetchOne<AffiliateRecord>('affiliates', { id: payout.affiliate_id });
  if (affiliate) {
    // Refund amount back to affiliate's wallet
    const refundedBalance = (Number(affiliate.wallet_balance) || 0) + Number(payout.amount);
    dbUpdate('affiliates', {
      wallet_balance: refundedBalance,
      updated_at: new Date().toISOString()
    }, { id: affiliate.id });
  }

  const now = new Date().toISOString();
  dbUpdate('affiliate_payouts', {
    status: 'rejected',
    rejection_reason: reason || 'Declined by Super Admin',
    updated_at: now
  }, { id: payoutId });

  const updated = dbFetchOne<any>('affiliate_payouts', { id: payoutId });
  return { success: true, payout: updated };
}

/**
 * Super Admin: Create a Single Affiliate with custom Tier and Commission Rate
 */
export async function createAffiliateByAdmin(params: {
  fullName?: string;
  full_name?: string;
  email: string;
  phone?: string;
  password?: string;
  tier?: 'standard' | 'pro';
  commissionRate?: number; // e.g. 0.70 or 70
  commission_rate?: number;
  sendEmailNotification?: boolean;
}): Promise<{ success: boolean; affiliate?: AffiliateRecord; rawPassword?: string; error?: string }> {
  const fullName = (params.fullName || params.full_name || '').trim();
  const email = (params.email || '').toLowerCase().trim();
  const phone = (params.phone || '').trim() || `080${crypto.randomInt(10000000, 99999999)}`;
  
  if (!fullName || !email) {
    return { success: false, error: 'Full name and email address are required' };
  }

  // Parse commission rate (handles 70 or 0.70)
  const rawRateInput = params.commissionRate !== undefined ? params.commissionRate : params.commission_rate;
  let rawRate = rawRateInput !== undefined ? Number(rawRateInput) : 0.70;
  if (rawRate > 1) {
    rawRate = rawRate / 100;
  }
  const tier: 'standard' | 'pro' = params.tier || (rawRate >= 0.70 ? 'pro' : 'standard');

  // Password: use provided or generate secure temporary password
  const rawPassword = params.password ? params.password.trim() : `zlik${crypto.randomInt(1000, 9999)}`;

  const regResult = await registerAffiliate({
    fullName,
    email,
    phone,
    password: rawPassword,
    tier,
    commissionRate: rawRate
  });

  if (!regResult.success) {
    return { success: false, error: regResult.error };
  }

  // Send onboarding email notification
  if (params.sendEmailNotification !== false && regResult.affiliate) {
    try {
      await sendAffiliateWelcomeEmail({
        email: regResult.affiliate.email,
        fullName: regResult.affiliate.full_name,
        referralCode: regResult.affiliate.referral_code,
        initialPassword: rawPassword,
        tier: regResult.affiliate.tier,
        commissionRate: regResult.affiliate.commission_rate
      });
    } catch (mailErr) {
      console.warn('Affiliate welcome email send warning:', mailErr);
    }
  }

  return { success: true, affiliate: regResult.affiliate, rawPassword };
}

/**
 * Super Admin: Bulk Onboard Affiliates from CSV (Default 70% Pro Affiliates)
 */
export async function bulkCreateAffiliatesFromCsv(
  csvContent: string,
  defaultTier: 'standard' | 'pro' = 'pro',
  defaultCommissionRate: number = 0.70
): Promise<{
  success: boolean;
  totalParsed: number;
  createdCount: number;
  skippedCount: number;
  errors: string[];
  affiliates: any[];
  created: any[];
}> {
  if (!csvContent || !csvContent.trim()) {
    return { success: false, totalParsed: 0, createdCount: 0, skippedCount: 0, errors: ['CSV content is empty'], affiliates: [], created: [] };
  }

  const lines = csvContent
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) {
    return { success: false, totalParsed: 0, createdCount: 0, skippedCount: 0, errors: ['No data rows found in CSV'], affiliates: [], created: [] };
  }

  // Parse header
  let startIndex = 0;
  const firstLine = lines[0].toLowerCase();
  const hasHeader = firstLine.includes('name') || firstLine.includes('email') || firstLine.includes('phone');
  if (hasHeader) {
    startIndex = 1;
  }

  let createdCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];
  const createdAffiliates: any[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const rawLine = lines[i];
    // Split by comma or semicolon, handling quoted strings
    const parts = rawLine.split(/[,;\t]/).map(p => p.trim().replace(/^["']|["']$/g, ''));
    if (parts.length < 2) {
      continue;
    }

    const fullName = parts[0] || '';
    const email = (parts[1] || '').toLowerCase();
    const phone = parts[2] || `080${crypto.randomInt(10000000, 99999999)}`;
    let commissionRate = defaultCommissionRate;

    if (parts[3]) {
      const parsedRate = parseFloat(parts[3]);
      if (!isNaN(parsedRate)) {
        commissionRate = parsedRate > 1 ? parsedRate / 100 : parsedRate;
      }
    }

    const tier: 'standard' | 'pro' = commissionRate >= 0.70 ? 'pro' : defaultTier;
    const tempPassword = `pro${crypto.randomInt(1000, 9999)}`;

    const res = await registerAffiliate({
      fullName,
      email,
      phone,
      password: tempPassword,
      tier,
      commissionRate
    });

    if (res.success && res.affiliate) {
      createdCount++;
      createdAffiliates.push({
        id: res.affiliate.id,
        name: res.affiliate.full_name,
        email: res.affiliate.email,
        code: res.affiliate.referral_code,
        tier: res.affiliate.tier,
        rate: res.affiliate.commission_rate,
        commission_rate: res.affiliate.commission_rate,
        commissionRate: res.affiliate.commission_rate,
        tempPassword
      });

      // Send Welcome Credentials Email
      try {
        await sendAffiliateWelcomeEmail({
          email: res.affiliate.email,
          fullName: res.affiliate.full_name,
          referralCode: res.affiliate.referral_code,
          initialPassword: tempPassword,
          tier: res.affiliate.tier,
          commissionRate: res.affiliate.commission_rate
        });
      } catch (e) {
        // Safe to continue loop
      }
    } else {
      skippedCount++;
      errors.push(`Row ${i + 1} (${email || fullName}): ${res.error || 'Failed to register'}`);
    }
  }

  return {
    success: createdCount > 0 || skippedCount === 0,
    totalParsed: lines.length - startIndex,
    createdCount,
    skippedCount,
    errors,
    affiliates: createdAffiliates,
    created: createdAffiliates
  };
}


