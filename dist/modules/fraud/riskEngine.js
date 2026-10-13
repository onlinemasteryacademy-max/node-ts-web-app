"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RISK_REASON_CODES = void 0;
exports.evaluateSellerRisk = evaluateSellerRisk;
exports.checkBankAccountReuse = checkBankAccountReuse;
const db_js_1 = require("../../db/db.js");
const securityService_js_1 = require("../security/securityService.js");
/**
 * Standard explainable risk reason codes
 */
exports.RISK_REASON_CODES = {
    BANK_REUSE_DETECTED: 'BANK_REUSE_DETECTED',
    CUSTOMER_DISPUTE_SPIKE: 'CUSTOMER_DISPUTE_SPIKE',
    VELOCITY_SPIKE_NEW_SELLER: 'VELOCITY_SPIKE_NEW_SELLER',
    SEVERE_NAME_MISMATCH: 'SEVERE_NAME_MISMATCH',
    SUSPICIOUS_BRAND_NAME: 'SUSPICIOUS_BRAND_NAME',
    MANUAL_ADMIN_ADJUSTMENT: 'MANUAL_ADMIN_ADJUSTMENT',
    DISPUTE_CLEARED: 'DISPUTE_CLEARED'
};
/**
 * Evaluates comprehensive fraud risk signals for a seller and updates score
 */
function evaluateSellerRisk(sellerId) {
    const seller = (0, db_js_1.dbFetchOne)('seller_profiles', { id: sellerId });
    if (!seller) {
        return { score: 0, level: 'low', triggers: [] };
    }
    const triggers = [];
    let baseScore = 0;
    // Signal 1: Bank Account Reuse across different sellers
    const activeBank = (0, db_js_1.dbFetchOne)('seller_bank_accounts', { seller_id: seller.id, is_active: 1 });
    if (activeBank && activeBank.account_number_hash) {
        const matchingAccounts = (0, db_js_1.dbFetchAll)('seller_bank_accounts', {
            account_number_hash: activeBank.account_number_hash,
            is_active: 1
        });
        const duplicateSellers = matchingAccounts.filter(a => a.seller_id !== seller.id);
        if (duplicateSellers.length > 0) {
            triggers.push({
                reasonCode: exports.RISK_REASON_CODES.BANK_REUSE_DETECTED,
                description: `Payout bank account (${activeBank.bank_name} ${activeBank.account_number_masked}) is linked to ${duplicateSellers.length} other seller accounts.`,
                scoreDelta: 35
            });
            baseScore += 35;
        }
    }
    // Signal 2: Recent Customer Disputes & Fraud Reports (Last 14 days)
    const fraudReports = (0, db_js_1.dbFetchAll)('fraud_reports', { reported_store_id: seller.store_id });
    const activeReports = fraudReports.filter(r => r.status !== 'dismissed');
    if (activeReports.length >= 2) {
        const delta = Math.min(40, activeReports.length * 15);
        triggers.push({
            reasonCode: exports.RISK_REASON_CODES.CUSTOMER_DISPUTE_SPIKE,
            description: `${activeReports.length} customer fraud dispute reports filed against this storefront.`,
            scoreDelta: delta
        });
        baseScore += delta;
    }
    else if (activeReports.length === 1) {
        triggers.push({
            reasonCode: exports.RISK_REASON_CODES.CUSTOMER_DISPUTE_SPIKE,
            description: `1 customer fraud dispute report filed against this storefront.`,
            scoreDelta: 15
        });
        baseScore += 15;
    }
    // Signal 3: Rapid High-Value Order Velocity on Unverified Storefront (First 48 hours)
    const store = (0, db_js_1.dbFetchOne)('stores', { id: seller.store_id });
    if (store && seller.composite_verification_status !== 'verified') {
        const storeCreatedMs = new Date(store.created_at || Date.now()).getTime();
        const ageHours = (Date.now() - storeCreatedMs) / (1000 * 60 * 60);
        if (ageHours <= 72) {
            const orders = (0, db_js_1.dbFetchAll)('orders', { store_id: store.id });
            const totalClaimedGmv = orders
                .filter(o => o.payment_status === 'claimed' || o.payment_status === 'paid')
                .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
            if (totalClaimedGmv >= 250000 || orders.length >= 10) {
                triggers.push({
                    reasonCode: exports.RISK_REASON_CODES.VELOCITY_SPIKE_NEW_SELLER,
                    description: `Unverified new storefront received ₦${totalClaimedGmv.toLocaleString()} across ${orders.length} orders within 72 hours of registration.`,
                    scoreDelta: 20
                });
                baseScore += 20;
            }
        }
    }
    // Signal 4: Severe Bank Account Name Mismatch
    if (activeBank && activeBank.name_match_result === 'mismatch') {
        triggers.push({
            reasonCode: exports.RISK_REASON_CODES.SEVERE_NAME_MISMATCH,
            description: `Payout bank account name "${activeBank.account_name}" mismatched against seller identity.`,
            scoreDelta: 25
        });
        baseScore += 25;
    }
    const finalScore = Math.max(0, Math.min(100, baseScore));
    let level = 'low';
    if (finalScore >= 75)
        level = 'critical';
    else if (finalScore >= 50)
        level = 'high';
    else if (finalScore >= 25)
        level = 'medium';
    // Record risk events for new triggers if score changed significantly
    if (finalScore !== seller.risk_score) {
        (0, db_js_1.dbUpdate)('seller_profiles', {
            risk_score: finalScore,
            risk_level: level,
            updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
        }, { id: seller.id });
        // Auto-gate orders if risk escalates to critical (>= 75)
        if (finalScore >= 75 && Number(seller.order_gating_enabled) === 0) {
            (0, db_js_1.dbUpdate)('seller_profiles', { order_gating_enabled: 1 }, { id: seller.id });
            (0, securityService_js_1.logSecurityAudit)({
                actor_type: 'system',
                action: 'Automated Order Gating (Critical Risk Threshold)',
                target_type: 'seller_profiles',
                target_id: seller.id,
                reason: `Risk score escalated to ${finalScore}/100 (${level}). Order gating engaged automatically for customer safety.`
            });
        }
    }
    return {
        score: finalScore,
        level,
        triggers
    };
}
/**
 * Check if a bank account hash is reused across different sellers
 */
function checkBankAccountReuse(accountHash, currentSellerId) {
    if (!accountHash)
        return { isReused: false, otherSellerIds: [] };
    const existingAccounts = (0, db_js_1.dbFetchAll)('seller_bank_accounts', {
        account_number_hash: accountHash,
        is_active: 1
    });
    const otherSellerIds = existingAccounts
        .filter(a => a.seller_id !== currentSellerId)
        .map(a => a.seller_id);
    return {
        isReused: otherSellerIds.length > 0,
        otherSellerIds
    };
}
