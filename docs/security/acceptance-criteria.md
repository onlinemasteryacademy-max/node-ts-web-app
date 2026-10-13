# Zlik — Security & Trust Acceptance Criteria

This document establishes the authoritative acceptance criteria, test matrices, and verification checklist for the Fraud Prevention, Seller Verification, Identity Management, and Trust System.

---

## 1. Seller Identity & Verification Criteria

| ID | Criterion | Expected Behavior | Verification Method |
|---|---|---|---|
| **AC-1.1** | Personal Seller Consent | Seller must check explicit consent box before identity verification initiates; timestamp recorded in `seller_profiles`. | Unit test & UI inspection |
| **AC-1.2** | Personal Seller Gating | Personal seller with `identity_status != 'verified'` is prohibited from publishing active payment instructions or accepting orders. | API test: `POST /api/orders` returns `403` or error indicating store is unverified |
| **AC-1.3** | Business Verification Independence | Registered business status cannot be self-assigned. Entering an RC number without validation maintains `business_status = 'pending'`. | Unit test: check status remains pending |
| **AC-1.4** | Name Matching - Exact | Exact name match ("Tunde Bakare" vs "Tunde Bakare") passes with score `1.00`. | Name matcher unit test |
| **AC-1.5** | Name Matching - Transposed | Order transposed name ("Adeyemi Babatunde" vs "Babatunde Adeyemi") passes with score $\ge 0.90$. | Name matcher unit test |
| **AC-1.6** | Name Matching - Honorifics | Honorifics stripped ("Alhaji Aliyu Bello" vs "Aliyu Bello") matches correctly. | Name matcher unit test |
| **AC-1.7** | Name Matching - Mismatch | Unrelated names ("Emeka Okonkwo" vs "Fatima Musa") yields `name_match_result = 'mismatch'` (score $< 0.70$) and rejects bank link. | Name matcher unit test |
| **AC-1.8** | Inconclusive Name Review | Minor variations ($0.75 \le \text{score} < 0.88$) transition to `manual_review` for Super Admin inspection. | Unit test |

---

## 2. Bank Account Protection Criteria

| ID | Criterion | Expected Behavior | Verification Method |
|---|---|---|---|
| **AC-2.1** | Bank Enquiry Resolution | Monnify account enquiry returns verified account name for valid bank code and account number. | Adapter test (mock & live) |
| **AC-2.2** | Bank Change Auth Re-check | Changing payout bank account requires an active authenticated merchant session. | Endpoint authorization test |
| **AC-2.3** | Bank Change 6-Digit OTP | Attempting to change bank account without valid 6-digit OTP is rejected with `require_otp: true`. | API test |
| **AC-2.4** | Bank Change Re-verification | Changing bank account triggers automatic name matching against seller profile. Mismatched account cannot become active. | API test |
| **AC-2.5** | Bank Account Encryption | Complete bank account number is stored encrypted at rest (`account_number_encrypted`) using AES-256-GCM. Never logged in plaintext. | Database inspect test |
| **AC-2.6** | Bank Masking in Responses | API responses return masked account numbers (e.g. `0123****89`). | API contract test |

---

## 3. Monnify Integration & Security Criteria

| ID | Criterion | Expected Behavior | Verification Method |
|---|---|---|---|
| **AC-3.1** | Dynamic Credential Storage | Super Admin can input API Key and Secret Key via dashboard; saved encrypted in `verification_provider_configs`. | Admin API test |
| **AC-3.2** | Masked Display | Viewing integration settings never renders raw secret keys; displays masked representation. | UI & API response inspection |
| **AC-3.3** | SSRF Defense | Configuring a non-Monnify URL (e.g. `http://localhost`, `http://169.254.169.254`, `http://evil.com`) is rejected immediately. | Configuration validation test |
| **AC-3.4** | Token Cache & Refresh | Monnify bearer token is cached in memory and refreshed before expiry; 401 response forces token invalidation and retry. | Adapter mock test |
| **AC-3.5** | Real Connection Test | "Test Connection" button makes an authentic server-to-server handshake and reports real round-trip latency. | Connection test endpoint |
| **AC-3.6** | Safe Degradation | Monnify timeout or rate limit returns safe diagnostic error without falsely approving seller. | Fault injection test |

---

## 4. Storefront Gating & Trust Indicators

| ID | Criterion | Expected Behavior | Verification Method |
|---|---|---|---|
| **AC-4.1** | Draft Store Creation | Unverified sellers can register, create products, and preview store in private draft mode. | End-to-end seller journey |
| **AC-4.2** | Checkout Order Rejection | Attempting to place an order on an unverified store returns a clear error explaining the store is undergoing verification. | Checkout API test |
| **AC-4.3** | Public Trust Badge - Personal | Verified individual displays badge: `Verified Individual Seller` with explanation tooltip and verification date. | Storefront HTML inspection |
| **AC-4.4** | Public Trust Badge - Business | Verified business displays badge: `Verified Registered Business (CAC)` with verified trade name. | Storefront HTML inspection |
| **AC-4.5** | Direct Transfer Disclosure | Checkout modal displays clear disclosure explaining peer-to-peer transfer mechanics and seller confirmation role. | Checkout HTML inspection |

---

## 5. Fraud Engine & Super Admin Console Criteria

| ID | Criterion | Expected Behavior | Verification Method |
|---|---|---|---|
| **AC-5.1** | Super Admin Access Guard | Access to `/${ENV.ADMIN_SECRET_PATH}/security` strictly requires authenticated Super Admin session. | Auth guard test |
| **AC-5.2** | Verification Queue Filters | Admins can filter queue by verification type, status, risk level, and date. | Admin query test |
| **AC-5.3** | Seller Investigation View | Admin can view seller 360-degree timeline: store profile, verifications, orders, disputes, and risk score. | Admin view test |
| **AC-5.4** | Customer Dispute Logging | Customers can submit fraud reports with case reference generation (`CASE-2026-XXXXX`). | Dispute submission API test |
| **AC-5.5** | Suspicious Bank Reuse Alert | Multiple unlinked sellers attempting to use the same bank account triggers `SUSPICIOUS_BANK_REUSE` risk event. | Risk engine test |
| **AC-5.6** | Immutable Audit Log | Every administrative status change, override, or credential update records an immutable entry in `security_audit_logs`. | Database audit log test |

---

## 6. Final Automated Verification Sign-Off Matrix

| Test Suite | Batch Covered | Scope | Result | Status |
|---|---|---|---|---|
| **Suite 25** | Batch 1 | Security Data Model, AES-256-GCM, HMAC Hashing & Dual Persistence | 100% Pass | ✅ VERIFIED |
| **Suite 26** | Batch 2 | Super Admin Security Console, Queue Filters & Investigation API | 100% Pass | ✅ VERIFIED |
| **Suite 27** | Batch 3 | Credential Vault, SSRF Outbound Guard & Dynamic Provider Storage | 100% Pass | ✅ VERIFIED |
| **Suite 28** | Batch 4 | Monnify Verification Adapter, BVN/NIN Matching & Redacted Metadata | 100% Pass | ✅ VERIFIED |
| **Suite 29** | Batch 5 | Bank Account Ownership, 6-Digit OTP Re-auth & Payout Bank Protection | 100% Pass | ✅ VERIFIED |
| **Suite 30** | Batch 6 | Seller Onboarding, NDPA Consent & Automated Storefront Gating | 100% Pass | ✅ VERIFIED |
| **Suite 31** | Batch 7 | Business Verification, CAC Formats, Store Naming Rules & Brand Protection | 100% Pass | ✅ VERIFIED |
| **Suite 32** | Batch 8 | Explainable Fraud Risk Engine, Emergency Gating & Disputes Workflow | 100% Pass | ✅ VERIFIED |
| **Suite 33** | Batch 9 | Customer Trust Badges, Direct Transfer Safety Notices & Dispute Modals | 100% Pass | ✅ VERIFIED |
| **Suite 34** | Batch 10 | Security Hardening, SSRF Exhaustive Filters & Edge Cases | 100% Pass | ✅ VERIFIED |

**Total Tests**: 951 Passed, 0 Failed (100% Success Rate across all 34 suites).  
**Build Status**: TypeScript compiler (`tsc`) exits with code 0; all views, public assets, and persistent uploads sync in ~8s.  
**System Status**: Production-Ready.

