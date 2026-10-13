import { dbFetchOne, dbFetchAll, dbInsert, dbUpdate } from '../../db/db.js';
import {
  encryptSecret,
  maskAccountNumber,
  hashAccountNumber,
  logSecurityAudit,
  recordRiskEvent
} from '../security/securityService.js';
import { getDecryptedCredentials } from './credentialVault.js';
import { monnifyAdapter } from './monnifyAdapter.js';
import { BankAccountValidationResult, IdentityVerificationResult } from './providerInterface.js';

/**
 * Tokenized Name Matching Algorithm
 * Calculates similarity between Seller Legal Name and Account Name returned by Bank
 */
export function calculateNameMatchScore(nameA: string, nameB: string): { score: number; matchType: 'exact_match' | 'fuzzy_match' | 'partial_match' | 'mismatch' } {
  const normalize = (str: string) =>
    str.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 1);

  const tokensA = normalize(nameA);
  const tokensB = normalize(nameB);

  if (tokensA.length === 0 || tokensB.length === 0) {
    return { score: 0.0, matchType: 'mismatch' };
  }

  // Exact full match
  if (tokensA.join(' ') === tokensB.join(' ')) {
    return { score: 1.0, matchType: 'exact_match' };
  }

  // Count common tokens (e.g. "Chinedu Eze" vs "Eze Chinedu")
  const common = tokensA.filter(t => tokensB.includes(t));
  const overlapRatio = (common.length * 2) / (tokensA.length + tokensB.length);

  if (overlapRatio >= 0.8) {
    return { score: overlapRatio, matchType: 'fuzzy_match' };
  } else if (overlapRatio >= 0.5) {
    return { score: overlapRatio, matchType: 'partial_match' };
  } else {
    return { score: overlapRatio, matchType: 'mismatch' };
  }
}

/**
 * Resolve and verify payout bank account ownership via Monnify
 */
export async function resolveAndVerifyBankAccount(params: {
  sellerId: number;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountType?: 'individual' | 'corporate';
}): Promise<{
  success: boolean;
  bankAccount?: any;
  validationResult?: BankAccountValidationResult;
  error?: string;
}> {
  const seller = dbFetchOne<any>('seller_profiles', { id: params.sellerId });
  if (!seller) {
    return { success: false, error: 'Seller profile not found' };
  }

  const credentials = getDecryptedCredentials('monnify');
  if (!credentials.isConfigured) {
    return { success: false, error: 'Identity verification provider (Monnify) is not configured by Super Admin' };
  }

  // 1. Call Monnify account resolution
  const validation = await monnifyAdapter.verifyBankAccount(
    params.accountNumber,
    params.bankCode,
    credentials
  );

  if (!validation.success || !validation.accountName) {
    return {
      success: false,
      validationResult: validation,
      error: validation.error || 'Could not verify account name with bank'
    };
  }

  // 2. Perform Name Match between Bank Name and Seller Legal/Store Name
  const targetLegalName = seller.legal_name || seller.public_store_name || '';
  const matchResult = calculateNameMatchScore(targetLegalName, validation.accountName);

  const rawAcct = String(params.accountNumber).trim();
  const encryptedAcct = encryptSecret(rawAcct);
  const maskedAcct = maskAccountNumber(rawAcct);
  const hashAcct = hashAccountNumber(rawAcct);

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const isVerified = matchResult.matchType === 'exact_match' || matchResult.matchType === 'fuzzy_match';

  // 3. Deactivate previous active bank accounts for this seller
  const existingAccounts = dbFetchAll<any>('seller_bank_accounts', { seller_id: seller.id });
  for (const acct of existingAccounts) {
    dbUpdate('seller_bank_accounts', { is_active: 0 }, { id: acct.id });
  }

  // 4. Insert verified bank account
  const newBankId = dbInsert('seller_bank_accounts', {
    seller_id: seller.id,
    bank_code: params.bankCode,
    bank_name: params.bankName || validation.bankName || 'Nigerian Bank',
    account_number_encrypted: encryptedAcct,
    account_number_masked: maskedAcct,
    account_number_hash: hashAcct,
    account_name: validation.accountName,
    account_type: params.accountType || (seller.seller_type === 'business' ? 'corporate' : 'individual'),
    name_match_score: matchResult.score,
    name_match_result: matchResult.matchType,
    verification_status: isVerified ? 'verified' : 'pending',
    provider_reference: validation.providerReference || `MNFY-${Date.now()}`,
    is_active: 1,
    verified_at: isVerified ? now : null
  });

  // 5. Update seller profile bank status
  dbUpdate('seller_profiles', {
    bank_status: isVerified ? 'verified' : 'pending',
    updated_at: now
  }, { id: seller.id });

  // 6. Update underlying store bank details
  const store = dbFetchOne<any>('stores', { id: seller.store_id });
  if (store) {
    dbUpdate('stores', {
      bank_name: params.bankName,
      bank_account_number: rawAcct,
      bank_account_name: validation.accountName
    }, { id: store.id });
  }

  logSecurityAudit({
    actor_type: 'merchant',
    action: isVerified ? 'Verified Payout Bank Account' : 'Submitted Bank Account for Review',
    target_type: 'seller_bank_accounts',
    target_id: newBankId,
    reason: `Bank resolution name: '${validation.accountName}', match: ${matchResult.matchType} (${(matchResult.score * 100).toFixed(0)}%)`
  });

  // Check if store can be promoted to composite verified
  evaluateCompositeVerificationStatus(seller.id);

  const savedAccount = dbFetchOne<any>('seller_bank_accounts', { id: newBankId });
  return {
    success: true,
    bankAccount: savedAccount,
    validationResult: validation
  };
}

/**
 * Submit BVN or NIN Identity Verification (NDPA 2023 Compliant)
 */
export async function submitIdentityVerification(params: {
  sellerId: number;
  type: 'bvn' | 'nin';
  identifier: string;
  consentGiven: boolean;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  phoneNumber?: string;
}): Promise<{
  success: boolean;
  result?: IdentityVerificationResult;
  error?: string;
}> {
  if (!params.consentGiven) {
    return {
      success: false,
      error: 'NDPA 2023 Compliance: Explicit consent is mandatory prior to verifying identity credentials'
    };
  }

  const seller = dbFetchOne<any>('seller_profiles', { id: params.sellerId });
  if (!seller) {
    return { success: false, error: 'Seller profile not found' };
  }

  const cleanIdentifier = String(params.identifier || '').trim();
  if (cleanIdentifier.length !== 11) {
    return { success: false, error: `${params.type.toUpperCase()} must be exactly 11 digits` };
  }

  const credentials = getDecryptedCredentials('monnify');
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // Record consent in seller profile immediately
  dbUpdate('seller_profiles', {
    identity_consent_given: 1,
    consent_timestamp: now,
    updated_at: now
  }, { id: seller.id });

  // Invoke Monnify adapter (Never logging raw BVN/NIN!)
  const verifyResult = await monnifyAdapter.verifyIdentity(
    {
      bvn: params.type === 'bvn' ? cleanIdentifier : undefined,
      nin: params.type === 'nin' ? cleanIdentifier : undefined,
      firstName: params.firstName,
      lastName: params.lastName,
      dateOfBirth: params.dateOfBirth,
      phoneNumber: params.phoneNumber
    },
    credentials
  );

  const isVerified = verifyResult.status === 'verified';
  const maskedId = cleanIdentifier.slice(0, 3) + '•••••' + cleanIdentifier.slice(-2);

  // Record in seller_verifications table
  dbInsert('seller_verifications', {
    seller_id: seller.id,
    verification_type: params.type,
    provider: 'monnify',
    provider_reference: verifyResult.providerReference || `MNFY-${params.type.toUpperCase()}-${Date.now()}`,
    status: verifyResult.status,
    result_code: verifyResult.resultCode || (isVerified ? 'VERIFIED' : 'FAILED'),
    failure_reason: verifyResult.failureReason || null,
    verified_at: isVerified ? now : null,
    redacted_metadata_json: JSON.stringify({
      credentialType: params.type,
      maskedIdentifier: maskedId,
      matchScore: verifyResult.matchScore
    })
  });

  // Update seller profile identity status
  dbUpdate('seller_profiles', {
    identity_status: isVerified ? 'verified' : (verifyResult.status === 'manual_review' ? 'pending' : 'failed'),
    updated_at: now
  }, { id: seller.id });

  logSecurityAudit({
    actor_type: 'merchant',
    action: `Submitted ${params.type.toUpperCase()} Verification`,
    target_type: 'seller_profiles',
    target_id: seller.id,
    reason: `Result: ${verifyResult.status}. Reference: ${verifyResult.providerReference || 'N/A'}`
  });

  // Check if store can be promoted to composite verified
  evaluateCompositeVerificationStatus(seller.id);

  return {
    success: isVerified,
    result: verifyResult,
    error: isVerified ? undefined : (verifyResult.failureReason || 'Identity verification could not be completed')
  };
}

/**
 * Evaluate and promote composite verification status
 * A seller is 'verified' when their identity is verified AND their bank account is verified.
 */
export function evaluateCompositeVerificationStatus(sellerId: number): string {
  const seller = dbFetchOne<any>('seller_profiles', { id: sellerId });
  if (!seller) return 'unverified';

  const isIdentityVerified = seller.identity_status === 'verified';
  const isBankVerified = seller.bank_status === 'verified';

  let isBusinessVerified = true;
  if (seller.seller_type === 'business') {
    isBusinessVerified = seller.business_status === 'verified';
  }

  let compositeStatus = seller.composite_verification_status;

  if (compositeStatus === 'suspended') {
    return 'suspended';
  }

  if (isIdentityVerified && isBankVerified && isBusinessVerified) {
    compositeStatus = 'verified';
  } else if (seller.identity_status === 'pending' || seller.bank_status === 'pending') {
    compositeStatus = 'pending';
  } else {
    compositeStatus = 'unverified';
  }

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  dbUpdate('seller_profiles', {
    composite_verification_status: compositeStatus,
    updated_at: now
  }, { id: seller.id });

  // Update store verification flag
  const store = dbFetchOne<any>('stores', { id: seller.store_id });
  if (store) {
    dbUpdate('stores', {
      is_verified: compositeStatus === 'verified' ? 1 : 0
    }, { id: store.id });
  }

  return compositeStatus;
}
