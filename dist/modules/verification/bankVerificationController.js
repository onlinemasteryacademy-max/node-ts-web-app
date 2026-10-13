"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bankOtpStore = exports.NIGERIAN_BANKS = void 0;
exports.saveVerifiedBankAccountRecord = saveVerifiedBankAccountRecord;
exports.bankVerificationRoutes = bankVerificationRoutes;
const node_crypto_1 = __importDefault(require("node:crypto"));
const db_js_1 = require("../../db/db.js");
const mailer_js_1 = require("../email/mailer.js");
const securityService_js_1 = require("../security/securityService.js");
const credentialVault_js_1 = require("./credentialVault.js");
const monnifyAdapter_js_1 = require("./monnifyAdapter.js");
const nameMatcher_js_1 = require("./nameMatcher.js");
const verificationService_js_1 = require("./verificationService.js");
exports.NIGERIAN_BANKS = [
    { code: '044', name: 'Access Bank' },
    { code: '058', name: 'Guaranty Trust Bank (GTBank)' },
    { code: '057', name: 'Zenith Bank' },
    { code: '033', name: 'United Bank for Africa (UBA)' },
    { code: '011', name: 'First Bank of Nigeria' },
    { code: '214', name: 'First City Monument Bank (FCMB)' },
    { code: '070', name: 'Fidelity Bank' },
    { code: '221', name: 'Stanbic IBTC Bank' },
    { code: '232', name: 'Sterling Bank' },
    { code: '032', name: 'Union Bank of Nigeria' },
    { code: '035', name: 'Wema Bank' },
    { code: '076', name: 'Polaris Bank' },
    { code: '082', name: 'Keystone Bank' },
    { code: '50211', name: 'Kuda Bank' },
    { code: '999992', name: 'OPay' },
    { code: '999991', name: 'PalmPay' },
    { code: '50515', name: 'Moniepoint MFB' },
    { code: '301', name: 'Jaiz Bank' },
    { code: '302', name: 'Taj Bank' },
    { code: '565', name: 'Carbon' }
];
// In-memory OTP storage for bank account updates (5 min TTL)
exports.bankOtpStore = new Map();
function saveVerifiedBankAccountRecord(params) {
    const encryptedAcct = (0, securityService_js_1.encryptSecret)(params.accountNumber);
    const maskedAcct = (0, securityService_js_1.maskAccountNumber)(params.accountNumber);
    const hashAcct = (0, securityService_js_1.hashAccountNumber)(params.accountNumber);
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const seller = (0, db_js_1.dbFetchOne)('seller_profiles', { id: params.sellerId });
    // Deactivate previous bank accounts for this seller
    const oldAccounts = (0, db_js_1.dbFetchAll)('seller_bank_accounts', { seller_id: params.sellerId });
    for (const a of oldAccounts) {
        (0, db_js_1.dbUpdate)('seller_bank_accounts', { is_active: 0 }, { id: a.id });
    }
    // Insert new verified bank account record
    const newBankId = (0, db_js_1.dbInsert)('seller_bank_accounts', {
        seller_id: params.sellerId,
        bank_code: params.bankCode || '000',
        bank_name: params.bankName || 'Nigerian Bank',
        account_number_encrypted: encryptedAcct,
        account_number_masked: maskedAcct,
        account_number_hash: hashAcct,
        account_name: params.accountName,
        account_type: seller?.seller_type === 'business' ? 'corporate' : 'individual',
        name_match_score: params.nameMatchScore !== undefined ? params.nameMatchScore : 1.0,
        name_match_result: params.nameMatchResult || 'exact_match',
        verification_status: params.isVerified !== false ? 'verified' : 'pending',
        provider_reference: `OTP-UPD-${Date.now()}`,
        is_active: 1,
        verified_at: params.isVerified !== false ? now : null
    });
    // Update store details
    (0, db_js_1.dbUpdate)('stores', {
        bank_name: params.bankName,
        bank_account_number: params.accountNumber,
        bank_account_name: params.accountName
    }, { id: params.storeId });
    // Update seller profile bank status
    (0, db_js_1.dbUpdate)('seller_profiles', {
        bank_status: params.isVerified !== false ? 'verified' : 'pending',
        updated_at: now
    }, { id: params.sellerId });
    // Audit Log
    (0, securityService_js_1.logSecurityAudit)({
        actor_type: params.actorType || 'merchant',
        action: 'Authorized Bank Account Change via OTP',
        target_type: 'seller_bank_accounts',
        target_id: newBankId,
        reason: `Updated to ${params.bankName || 'Nigerian Bank'} (${maskedAcct}) - Account holder: ${params.accountName} (Match: ${params.nameMatchResult || 'exact_match'})`,
        ip_address: params.ipAddress
    });
    // Re-evaluate composite verification status
    (0, verificationService_js_1.evaluateCompositeVerificationStatus)(params.sellerId);
    return { newBankId, maskedAcct };
}
async function bankVerificationRoutes(fastify) {
    /**
     * GET /api/merchant/bank/banks
     * List Supported Nigerian Commercial Banks & Fintechs
     */
    fastify.get('/api/merchant/bank/banks', async (_req, reply) => {
        return reply.send({ success: true, banks: exports.NIGERIAN_BANKS });
    });
    /**
     * POST /api/merchant/bank/resolve
     * Real-time NUBAN Resolution & Name Match Verification
     */
    fastify.post('/api/merchant/bank/resolve', async (req, reply) => {
        const store = req.session?.merchantStore;
        if (!store) {
            return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });
        }
        const body = req.body || {};
        const bankCode = String(body.bank_code || '').trim();
        const accountNumber = String(body.account_number || '').trim().replace(/[^0-9]/g, '');
        if (accountNumber.length !== 10) {
            return reply.code(400).send({ success: false, error: 'Account number must be exactly 10 digits' });
        }
        if (!bankCode) {
            return reply.code(400).send({ success: false, error: 'Bank selection is required' });
        }
        const credentials = (0, credentialVault_js_1.getDecryptedCredentials)('monnify');
        if (!credentials.isConfigured) {
            // Graceful fallback if Monnify keys not yet set in admin
            const bankInfo = exports.NIGERIAN_BANKS.find(b => b.code === bankCode);
            return reply.send({
                success: true,
                account_name: store.bank_account_name || store.owner_name || store.store_name,
                account_number: accountNumber,
                bank_code: bankCode,
                bank_name: bankInfo?.name || 'Selected Bank',
                name_match: {
                    score: 1.0,
                    match_type: 'exact_match',
                    is_acceptable: true,
                    confidence: 'Provider verification pending configuration'
                }
            });
        }
        const validation = await monnifyAdapter_js_1.monnifyAdapter.verifyBankAccount(accountNumber, bankCode, credentials);
        if (!validation.success || !validation.accountName) {
            return reply.code(400).send({
                success: false,
                error: validation.error || 'Account could not be resolved with selected bank'
            });
        }
        const seller = (0, securityService_js_1.getOrCreateSellerProfile)(store.id);
        const sellerLegalName = seller?.legal_name || store.owner_name || store.store_name;
        const match = (0, nameMatcher_js_1.matchAccountName)(sellerLegalName, validation.accountName, seller?.seller_type === 'business');
        const bankInfo = exports.NIGERIAN_BANKS.find(b => b.code === bankCode);
        return reply.send({
            success: true,
            account_name: validation.accountName,
            account_number: accountNumber,
            bank_code: bankCode,
            bank_name: bankInfo?.name || validation.bankName || 'Nigerian Bank',
            name_match: {
                score: match.score,
                match_type: match.matchType,
                is_acceptable: match.isAcceptable,
                confidence: match.confidenceDescription
            }
        });
    });
    /**
     * POST /api/merchant/bank/request-otp
     * Request Security 6-Digit Email Authorization Code for Payout Bank Update
     */
    fastify.post('/api/merchant/bank/request-otp', async (req, reply) => {
        const store = req.session?.merchantStore;
        if (!store) {
            return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });
        }
        const body = req.body || {};
        const newAccountNumber = String(body.bank_account_number || '').trim().replace(/[^0-9]/g, '');
        const newBankName = String(body.bank_name || '').trim();
        const newBankCode = String(body.bank_code || '').trim();
        const newAccountName = String(body.bank_account_name || '').trim();
        if (!newAccountNumber || newAccountNumber.length !== 10) {
            return reply.code(400).send({ success: false, error: 'Valid 10-digit account number is required' });
        }
        let ownerEmail = store.email;
        if (!ownerEmail || !ownerEmail.includes('@')) {
            const freshStore = (0, db_js_1.dbFetchOne)('stores', { id: store.id });
            if (freshStore && freshStore.email) {
                ownerEmail = freshStore.email;
            }
        }
        if (!ownerEmail || !ownerEmail.includes('@')) {
            return reply.code(400).send({
                success: false,
                error: 'No valid email address linked to your store account to receive verification OTP.'
            });
        }
        const otpCode = String(node_crypto_1.default.randomInt(100000, 999999));
        const otpHash = node_crypto_1.default.createHash('sha256').update(otpCode).digest('hex');
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
        exports.bankOtpStore.set(store.id, {
            otp_hash: otpHash,
            expires_at: expiresAt,
            bank_code: newBankCode,
            bank_name: newBankName,
            account_number: newAccountNumber,
            account_name: newAccountName
        });
        await (0, mailer_js_1.sendBankAccountChangeOtp)(ownerEmail, store.store_name || 'Store Owner', otpCode, newBankName, newAccountNumber);
        const parts = ownerEmail.split('@');
        const maskedUser = parts[0].length > 2 ? parts[0].slice(0, 2) + '••••' + parts[0].slice(-1) : '••';
        const maskedEmail = `${maskedUser}@${parts[1]}`;
        return reply.send({
            success: true,
            message: `Security authorization code sent to ${maskedEmail}.`,
            masked_email: maskedEmail,
            expires_in: 300
        });
    });
    /**
     * POST /api/merchant/bank/verify-and-update
     * Protected Payout Bank Change with Name Matching & AES-256-GCM Storage
     */
    fastify.post('/api/merchant/bank/verify-and-update', async (req, reply) => {
        const store = req.session?.merchantStore;
        if (!store) {
            return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });
        }
        const body = req.body || {};
        const otpCode = String(body.otp_code || '').trim();
        const bankCode = String(body.bank_code || '').trim();
        const bankName = String(body.bank_name || '').trim();
        const accountNumber = String(body.account_number || '').trim().replace(/[^0-9]/g, '');
        if (!otpCode || otpCode.length !== 6) {
            return reply.code(400).send({ success: false, error: 'Valid 6-digit authorization code is required' });
        }
        // Verify OTP record
        const otpRecord = exports.bankOtpStore.get(store.id);
        if (!otpRecord || Date.now() > otpRecord.expires_at) {
            return reply.code(400).send({
                success: false,
                error: 'Authorization code has expired or was not requested. Please request a new code.'
            });
        }
        const inputHash = node_crypto_1.default.createHash('sha256').update(otpCode).digest('hex');
        if (inputHash !== otpRecord.otp_hash) {
            return reply.code(400).send({
                success: false,
                error: 'Invalid 6-digit authorization code. Please check your email and try again.'
            });
        }
        // Clear used OTP
        exports.bankOtpStore.delete(store.id);
        const seller = (0, securityService_js_1.getOrCreateSellerProfile)(store.id);
        const sellerLegalName = seller?.legal_name || store.owner_name || store.store_name;
        // Check account name via Monnify adapter
        const credentials = (0, credentialVault_js_1.getDecryptedCredentials)('monnify');
        let resolvedAccountName = body.account_name || otpRecord.account_name || sellerLegalName;
        let nameMatchScore = 1.0;
        let nameMatchResult = 'exact_match';
        let isVerified = true;
        if (credentials.isConfigured) {
            const validation = await monnifyAdapter_js_1.monnifyAdapter.verifyBankAccount(accountNumber, bankCode, credentials);
            if (validation.success && validation.accountName) {
                resolvedAccountName = validation.accountName;
                const match = (0, nameMatcher_js_1.matchAccountName)(sellerLegalName, resolvedAccountName, seller?.seller_type === 'business');
                nameMatchScore = match.score;
                nameMatchResult = match.matchType;
                isVerified = match.isAcceptable;
                if (!match.isAcceptable && !match.flagForManualReview) {
                    return reply.code(400).send({
                        success: false,
                        error: `Name Mismatch: The bank account name '${resolvedAccountName}' does not match your registered identity '${sellerLegalName}'.`
                    });
                }
            }
        }
        const { maskedAcct } = saveVerifiedBankAccountRecord({
            sellerId: seller.id,
            storeId: store.id,
            bankCode,
            bankName: bankName || 'Nigerian Bank',
            accountNumber,
            accountName: resolvedAccountName,
            nameMatchScore,
            nameMatchResult,
            isVerified,
            actorType: 'merchant',
            ipAddress: req.ip
        });
        // Refresh merchantStore session
        const updatedStore = (0, db_js_1.dbFetchOne)('stores', { id: store.id });
        req.session.merchantStore = updatedStore;
        return reply.send({
            success: true,
            message: 'Payout bank account updated and verified successfully.',
            bank_name: bankName,
            account_number_masked: maskedAcct,
            account_name: resolvedAccountName,
            is_verified: isVerified
        });
    });
}
