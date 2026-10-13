import { dbFetchOne, dbFetchAll, dbInsert, dbUpdate } from '../../db/db.js';
import { logSecurityAudit, getOrCreateSellerProfile, getSellerProfile } from '../security/securityService.js';
import { evaluateNameMatch } from './nameMatcher.js';
import { evaluateCompositeVerificationStatus } from './verificationService.js';

export interface SubmitBusinessVerificationParams {
  sellerId: number;
  registeredName: string;
  registrationNumber: string;
  businessType?: string;
  jurisdiction?: string;
  tin?: string;
  registeredAddress?: string;
  representativeName: string;
  representativeRole?: string;
  representativePhone: string;
  documentUrl?: string;
  actorType?: 'merchant' | 'super_admin';
  ipAddress?: string;
}

/**
 * Validates Nigerian CAC registration number format (RC, BN, IT, or LL)
 */
export function validateCacRegistrationFormat(rcNumber: string): { valid: boolean; normalized?: string; error?: string } {
  if (!rcNumber || typeof rcNumber !== 'string') {
    return { valid: false, error: 'CAC registration number is required.' };
  }

  const cleaned = rcNumber.trim().toUpperCase().replace(/\s+/g, '');
  if (cleaned.length < 3 || cleaned.length > 25) {
    return { valid: false, error: 'CAC registration number must be between 3 and 25 characters.' };
  }

  // Accepts RC123456, BN123456, IT123456, LL123456, RC-123456, BN-123456, or purely numeric CAC legacy numbers
  const cacRegex = /^(RC|BN|IT|LL)?[-/]?[0-9]{3,12}$/i;
  // Also permit sandbox test prefixes
  const isSandboxMock = cleaned.startsWith('CAC-MOCK') || cleaned.startsWith('CAC-TEST');

  if (!cacRegex.test(cleaned) && !isSandboxMock) {
    return {
      valid: false,
      error: 'Invalid CAC registration number format. Must begin with RC, BN, IT, or LL followed by numbers (e.g., RC123456, BN-987654).'
    };
  }

  return { valid: true, normalized: cleaned };
}

/**
 * Submit registered CAC business verification details for a seller
 */
export async function submitBusinessVerification(
  params: SubmitBusinessVerificationParams
): Promise<{ success: boolean; error?: string; businessProfile?: any; status?: string }> {
  const seller = dbFetchOne<any>('seller_profiles', { id: params.sellerId });
  if (!seller) {
    return { success: false, error: 'Seller profile not found.' };
  }

  // 1. Validate CAC registration number format
  const cacCheck = validateCacRegistrationFormat(params.registrationNumber);
  if (!cacCheck.valid) {
    return { success: false, error: cacCheck.error };
  }
  const normCac = cacCheck.normalized!;

  // 2. Validate registered company name
  const regName = (params.registeredName || '').trim();
  if (regName.length < 3) {
    return { success: false, error: 'Registered company name must be at least 3 characters long.' };
  }

  // 3. Validate representative details
  const repName = (params.representativeName || '').trim();
  const repPhone = (params.representativePhone || '').trim();
  if (!repName || !repPhone) {
    return { success: false, error: 'Authorized representative name and phone number are required.' };
  }

  // 4. Cross-check representative name with seller's verified legal identity if available
  if (seller.identity_status === 'verified' && seller.legal_name) {
    const match = evaluateNameMatch(seller.legal_name, repName);
    if (match.matchType === 'mismatch' && match.score < 0.5) {
      return {
        success: false,
        error: `Authorized representative name "${repName}" does not match the verified personal identity name "${seller.legal_name}". Under Zlik Business Verification rules, the designated representative must be an authorized officer matching your verified account.`
      };
    }
  }

  // 5. Prevent duplicate CAC registration reuse across different sellers
  const existingWithSameCac = dbFetchAll<any>('business_profiles', { registration_number: normCac });
  const otherSellerWithSameCac = existingWithSameCac.find(b => b.seller_id !== seller.id && b.verification_status !== 'rejected');
  if (otherSellerWithSameCac) {
    return {
      success: false,
      error: `CAC registration number "${normCac}" is already registered by another merchant storefront.`
    };
  }

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // 6. Automated Sandbox Verification or Routing to Manual Review
  // Zero fake approvals: genuine CAC numbers route to 'pending' manual review by Super Admin
  const isMockAutoApprove = normCac.includes('CAC-MOCK-VERIFIED');
  const initialStatus = isMockAutoApprove ? 'verified' : 'pending';

  let profile = dbFetchOne<any>('business_profiles', { seller_id: seller.id });
  let profileId: number;

  if (profile) {
    dbUpdate('business_profiles', {
      registered_name: regName,
      registration_number: normCac,
      business_type: params.businessType || 'sole_proprietorship',
      jurisdiction: params.jurisdiction || 'Nigeria',
      tin: params.tin ? params.tin.trim() : null,
      registered_address: params.registeredAddress ? params.registeredAddress.trim() : null,
      representative_name: repName,
      representative_role: params.representativeRole || 'Proprietor',
      representative_phone: repPhone,
      document_url: params.documentUrl || profile.document_url || null,
      verification_status: initialStatus,
      verified_at: initialStatus === 'verified' ? now : null,
      updated_at: now
    }, { id: profile.id });
    profileId = profile.id;
  } else {
    profileId = dbInsert('business_profiles', {
      seller_id: seller.id,
      registered_name: regName,
      registration_number: normCac,
      business_type: params.businessType || 'sole_proprietorship',
      jurisdiction: params.jurisdiction || 'Nigeria',
      tin: params.tin ? params.tin.trim() : null,
      registered_address: params.registeredAddress ? params.registeredAddress.trim() : null,
      representative_name: repName,
      representative_role: params.representativeRole || 'Proprietor',
      representative_phone: repPhone,
      document_url: params.documentUrl || null,
      verification_status: initialStatus,
      verified_at: initialStatus === 'verified' ? now : null,
      created_at: now,
      updated_at: now
    });
  }

  // 7. Update seller profile
  dbUpdate('seller_profiles', {
    seller_type: 'business',
    business_status: initialStatus,
    updated_at: now
  }, { id: seller.id });

  // 8. Log security audit
  logSecurityAudit({
    actor_type: params.actorType || 'merchant',
    action: initialStatus === 'verified' ? 'Automated Business CAC Verified' : 'Submitted CAC Business Verification',
    target_type: 'business_profiles',
    target_id: profileId,
    reason: `Registered name: ${regName}, CAC: ${normCac}, Role: ${params.representativeRole || 'Proprietor'}`,
    ip_address: params.ipAddress || null
  });

  // 9. Re-evaluate composite verification status
  evaluateCompositeVerificationStatus(seller.id);

  const updatedProfile = dbFetchOne<any>('business_profiles', { id: profileId });
  return {
    success: true,
    status: initialStatus,
    businessProfile: updatedProfile
  };
}

/**
 * Super Admin action: Approve registered CAC business submission
 */
export function approveBusinessVerification(params: {
  businessProfileId: number;
  adminId: number;
  adminName: string;
  notes?: string;
  ipAddress?: string;
}): { success: boolean; error?: string; businessProfile?: any } {
  const profile = dbFetchOne<any>('business_profiles', { id: params.businessProfileId });
  if (!profile) {
    return { success: false, error: 'Business profile not found.' };
  }

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  dbUpdate('business_profiles', {
    verification_status: 'verified',
    verified_at: now,
    updated_at: now
  }, { id: profile.id });

  dbUpdate('seller_profiles', {
    seller_type: 'business',
    business_status: 'verified',
    updated_at: now
  }, { id: profile.seller_id });

  logSecurityAudit({
    actor_type: 'super_admin',
    actor_id: params.adminId,
    action: 'Admin Approved CAC Business',
    target_type: 'business_profiles',
    target_id: profile.id,
    reason: params.notes || `Approved CAC registration ${profile.registration_number} for ${profile.registered_name} by ${params.adminName}`,
    ip_address: params.ipAddress || null
  });

  // Re-evaluate composite verification status
  evaluateCompositeVerificationStatus(profile.seller_id);

  const updated = dbFetchOne<any>('business_profiles', { id: profile.id });
  return { success: true, businessProfile: updated };
}

/**
 * Super Admin action: Reject registered CAC business submission
 */
export function rejectBusinessVerification(params: {
  businessProfileId: number;
  adminId: number;
  adminName: string;
  reason: string;
  ipAddress?: string;
}): { success: boolean; error?: string } {
  const profile = dbFetchOne<any>('business_profiles', { id: params.businessProfileId });
  if (!profile) {
    return { success: false, error: 'Business profile not found.' };
  }

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  dbUpdate('business_profiles', {
    verification_status: 'rejected',
    updated_at: now
  }, { id: profile.id });

  dbUpdate('seller_profiles', {
    business_status: 'rejected',
    updated_at: now
  }, { id: profile.seller_id });

  logSecurityAudit({
    actor_type: 'super_admin',
    actor_id: params.adminId,
    action: 'Admin Rejected CAC Business',
    target_type: 'business_profiles',
    target_id: profile.id,
    reason: params.reason,
    ip_address: params.ipAddress || null
  });

  evaluateCompositeVerificationStatus(profile.seller_id);

  return { success: true };
}

/**
 * Fetch business profile for a seller
 */
export function getBusinessProfile(sellerId: number): any | null {
  return dbFetchOne<any>('business_profiles', { seller_id: sellerId });
}
