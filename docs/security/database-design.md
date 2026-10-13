# Zlik — Fraud Prevention & Identity Database Design

## 1. Schema Overview

The fraud prevention and seller verification data model extends Zlik's dual-engine persistence layer (SQLite with WAL locally + Hostinger MySQL for production persistence).

All schema definitions are **additive, non-destructive, and idempotent**, guaranteeing that zero existing store records, products, or orders are disrupted.

```
                                  +-------------------+
                                  |      stores       |
                                  +-------------------+
                                            | 1:1
                                            v
                                  +-------------------+
                                  |  seller_profiles  |
                                  +-------------------+
                                    |         |
                  +-----------------+         +-----------------+
              1:N |                                         1:1 |
                  v                                             v
        +-----------------------+                     +-------------------+
        |  seller_verifications |                     | business_profiles |
        +-----------------------+                     +-------------------+
                  ^
                  |
        +------------------------------+
        | verification_provider_configs|
        +------------------------------+
                  |
                  v
        +-----------------------+
        |  integration_events   |
        +-----------------------+

        +-----------------------+         +-------------------+
        | seller_bank_accounts  | <====== |  seller_profiles  |
        +-----------------------+  1:N    +-------------------+
                                                    |
                                                    | 1:N
                                                    v
                                          +-------------------+
                                          |    risk_events    |
                                          +-------------------+

        +-----------------------+  1:N    +-------------------+
        |     fraud_reports     | ------> | fraud_case_events |
        +-----------------------+         +-------------------+

        +-----------------------+
        |  security_audit_logs  |
        +-----------------------+
```

---

## 2. Table Specifications

### 2.1 `seller_profiles`
Links directly to the store and records the legal identity persona and composite risk state.

| Column | Type (SQLite / MySQL) | Nullable | Description |
|---|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | NO | Internal surrogate primary key |
| `store_id` | INTEGER UNIQUE | NO | Foreign key reference to `stores.id` |
| `seller_type` | TEXT / VARCHAR(32) | NO | `personal` or `business` (default: `personal`) |
| `legal_name` | TEXT / VARCHAR(255) | NO | Verified legal name of individual or business |
| `public_store_name` | TEXT / VARCHAR(255) | NO | Public trading name displayed on storefront |
| `identity_status` | TEXT / VARCHAR(32) | NO | `not_started`, `pending`, `in_progress`, `verified`, `failed`, `manual_review` |
| `bank_status` | TEXT / VARCHAR(32) | NO | `not_started`, `pending`, `verified`, `failed`, `manual_review` |
| `business_status` | TEXT / VARCHAR(32) | NO | `not_started`, `pending`, `verified`, `failed`, `manual_review` (n/a for personal) |
| `composite_verification_status` | TEXT / VARCHAR(32) | NO | Overall gating status: `unverified`, `pending`, `verified`, `restricted`, `suspended` |
| `risk_level` | TEXT / VARCHAR(32) | NO | `low`, `medium`, `high`, `critical` (default: `low`) |
| `risk_score` | INTEGER | NO | Numerical risk score (0 to 100, default: 0) |
| `order_gating_enabled` | INTEGER / TINYINT | NO | `1` = order acceptance active, `0` = blocked |
| `identity_consent_given` | INTEGER / TINYINT | NO | `1` = informed consent recorded, `0` = none |
| `consent_timestamp` | TEXT / VARCHAR(32) | YES | ISO timestamp of consent grant |
| `created_at` | TEXT / DATETIME | NO | Timestamp of profile initialization |
| `updated_at` | TEXT / DATETIME | NO | Timestamp of last modification |

---

### 2.2 `seller_verifications`
Historical audit trail of all verification attempts (personal identity, bank, CAC).

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | NO | Internal primary key |
| `seller_id` | INTEGER | NO | Foreign key reference to `seller_profiles.id` |
| `verification_type` | TEXT / VARCHAR(32) | NO | `bvn_match`, `nin_match`, `bank_enquiry`, `cac_registration` |
| `provider` | TEXT / VARCHAR(32) | NO | e.g. `monnify`, `manual_admin` |
| `provider_reference` | TEXT / VARCHAR(100) | YES | Monnify transaction reference / session token |
| `status` | TEXT / VARCHAR(32) | NO | `pending`, `verified`, `failed`, `manual_review`, `expired`, `revoked` |
| `result_code` | TEXT / VARCHAR(50) | YES | Standardized code: e.g. `EXACT_MATCH`, `NAME_MISMATCH`, `TIMEOUT` |
| `failure_reason` | TEXT / VARCHAR(255) | YES | Sanitized, seller-safe explanation |
| `verified_at` | TEXT / VARCHAR(32) | YES | ISO timestamp of successful verification |
| `expires_at` | TEXT / VARCHAR(32) | YES | ISO timestamp of verification expiry (if applicable) |
| `redacted_metadata_json` | TEXT / LONGTEXT | YES | Sanitized verification payload (masked identifiers, match score) |
| `created_at` | TEXT / DATETIME | NO | Submission timestamp |
| `updated_at` | TEXT / DATETIME | NO | Status update timestamp |

---

### 2.3 `business_profiles`
Details for sellers registered as legal business entities (sole proprietorship, partnership, limited liability).

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | NO | Internal primary key |
| `seller_id` | INTEGER UNIQUE | NO | Foreign key reference to `seller_profiles.id` |
| `registered_name` | TEXT / VARCHAR(255) | NO | Full registered corporate name (CAC) |
| `registration_number` | TEXT / VARCHAR(64) | NO | RC or BN registration number |
| `business_type` | TEXT / VARCHAR(64) | NO | `sole_proprietorship`, `limited_liability`, `partnership`, etc. |
| `jurisdiction` | TEXT / VARCHAR(32) | NO | Default: `Nigeria` |
| `tin` | TEXT / VARCHAR(32) | YES | Tax Identification Number (masked) |
| `registered_address` | TEXT | YES | Official business address |
| `representative_name` | TEXT / VARCHAR(150) | NO | Authorized director or proprietor's full name |
| `representative_role` | TEXT / VARCHAR(64) | NO | e.g. `Director`, `Proprietor`, `Manager` |
| `representative_phone` | TEXT / VARCHAR(32) | NO | Contact number of authorized representative |
| `document_url` | TEXT | YES | Uploaded proof of registration certificate (PDF/Image) |
| `verification_status` | TEXT / VARCHAR(32) | NO | `pending`, `verified`, `failed`, `manual_review` |
| `verified_at` | TEXT / VARCHAR(32) | YES | Timestamp of CAC verification |
| `created_at` | TEXT / DATETIME | NO | Record creation timestamp |
| `updated_at` | TEXT / DATETIME | NO | Record update timestamp |

---

### 2.4 `seller_bank_accounts`
Maintains verified and historical payout bank accounts, name match confidence, and encryption.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | NO | Internal primary key |
| `seller_id` | INTEGER | NO | Foreign key reference to `seller_profiles.id` |
| `bank_code` | TEXT / VARCHAR(10) | NO | 3-digit CBN bank code (e.g. `058` for GTBank) |
| `bank_name` | TEXT / VARCHAR(100) | NO | Recognized financial institution name |
| `account_number_encrypted` | TEXT | NO | AES-256-GCM encrypted 10-digit account number |
| `account_number_masked` | TEXT / VARCHAR(16) | NO | Masked representation: e.g. `0123****89` |
| `account_number_hash` | TEXT / VARCHAR(64) | NO | HMAC-SHA256 hash for duplicate bank fraud detection |
| `account_name` | TEXT / VARCHAR(200) | NO | Account holder name returned by Monnify |
| `account_type` | TEXT / VARCHAR(32) | NO | `individual` or `corporate` |
| `name_match_score` | REAL / FLOAT | NO | Similarity confidence score (0.00 to 1.00) |
| `name_match_result` | TEXT / VARCHAR(32) | NO | `exact_match`, `acceptable_match`, `mismatch`, `manual_review` |
| `verification_status` | TEXT / VARCHAR(32) | NO | `pending`, `verified`, `rejected` |
| `provider_reference` | TEXT / VARCHAR(100) | YES | Monnify validation reference |
| `is_active` | INTEGER / TINYINT | NO | `1` = active receiving account, `0` = inactive/historical |
| `verified_at` | TEXT / VARCHAR(32) | YES | Timestamp of validation |
| `created_at` | TEXT / DATETIME | NO | Creation timestamp |
| `updated_at` | TEXT / DATETIME | NO | Update timestamp |

---

### 2.5 `verification_provider_configs`
Stores configuration, environment settings, and encrypted credentials for Monnify and future providers.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | NO | Internal primary key |
| `provider_key` | TEXT / VARCHAR(32) UNIQUE | NO | Unique slug: `monnify` |
| `display_name` | TEXT / VARCHAR(100) | NO | e.g. `Monnify Verification Services` |
| `environment` | TEXT / VARCHAR(20) | NO | `sandbox` or `production` (default: `sandbox`) |
| `base_url` | TEXT / VARCHAR(255) | NO | Whitelisted URL: `https://sandbox.monnify.com` or `https://api.monnify.com` |
| `api_key_encrypted` | TEXT | YES | AES-256-GCM encrypted API key |
| `secret_key_encrypted` | TEXT | YES | AES-256-GCM encrypted secret key |
| `api_key_masked` | TEXT / VARCHAR(32) | YES | Masked display: `MK_TEST_••••••••5678` |
| `contract_code` | TEXT / VARCHAR(64) | YES | Monnify contract code (if required) |
| `enabled_capabilities_json` | TEXT | NO | JSON array: `["account_enquiry", "bvn_match", "nin_match"]` |
| `status` | TEXT / VARCHAR(20) | NO | `not_configured`, `testing`, `active`, `degraded`, `disabled` |
| `last_tested_at` | TEXT / VARCHAR(32) | YES | ISO timestamp of last test connection |
| `last_test_result` | TEXT / VARCHAR(20) | YES | `success` or `failure` |
| `last_test_error` | TEXT | YES | Redacted error summary from last test |
| `created_by_admin_id` | INTEGER | YES | ID of admin who configured provider |
| `updated_by_admin_id` | INTEGER | YES | ID of admin who last updated provider |
| `created_at` | TEXT / DATETIME | NO | Creation timestamp |
| `updated_at` | TEXT / DATETIME | NO | Update timestamp |

---

### 2.6 `fraud_reports`
Case management table for customer-reported issues, impersonation complaints, and payment disputes.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | NO | Internal primary key |
| `case_reference` | TEXT / VARCHAR(32) UNIQUE | NO | Human-readable case reference: `CASE-2026-XXXXX` |
| `reporter_name` | TEXT / VARCHAR(150) | NO | Full name of reporting customer or business |
| `reporter_email` | TEXT / VARCHAR(150) | NO | Contact email |
| `reporter_phone` | TEXT / VARCHAR(32) | YES | Contact phone number |
| `reported_store_id` | INTEGER | NO | Foreign key reference to `stores.id` |
| `order_id` | INTEGER | YES | Optional foreign key reference to `orders.id` |
| `category` | TEXT / VARCHAR(64) | NO | `impersonation`, `payment_mismatch`, `paid_not_delivered`, `counterfeit`, `other` |
| `severity` | TEXT / VARCHAR(20) | NO | `low`, `medium`, `high`, `critical` |
| `status` | TEXT / VARCHAR(32) | NO | `new`, `triaged`, `under_investigation`, `awaiting_seller`, `action_taken`, `resolved`, `dismissed` |
| `description` | TEXT | NO | Detailed customer description of dispute |
| `evidence_urls_json` | TEXT | YES | Array of uploaded proof screenshots or receipts |
| `assigned_admin_id` | INTEGER | YES | Assigned reviewer from `super_admins` |
| `resolution_code` | TEXT / VARCHAR(64) | YES | e.g. `SELLER_REFUNDED`, `STORE_SUSPENDED`, `UNSUBSTANTIATED` |
| `resolution_summary` | TEXT | YES | Public/reporter closure message |
| `created_at` | TEXT / DATETIME | NO | Submission timestamp |
| `updated_at` | TEXT / DATETIME | NO | Last status update timestamp |

---

### 2.7 `fraud_case_events`
Immutable audit log tracking all events and actions taken on a fraud case.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | NO | Internal primary key |
| `case_id` | INTEGER | NO | Foreign key reference to `fraud_reports.id` |
| `actor_type` | TEXT / VARCHAR(20) | NO | `admin`, `seller`, `reporter`, `system` |
| `actor_id` | INTEGER | YES | ID of the actor (if authenticated admin or seller) |
| `event_type` | TEXT / VARCHAR(50) | NO | `status_change`, `admin_note`, `seller_response`, `store_suspended`, `order_gated` |
| `message` | TEXT | NO | Event detail or internal administrative note |
| `created_at` | TEXT / DATETIME | NO | Timestamp of event |

---

### 2.8 `risk_events`
Logs risk score changes and triggers fired by the automated risk engine.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | NO | Internal primary key |
| `seller_id` | INTEGER | NO | Foreign key reference to `seller_profiles.id` |
| `event_type` | TEXT / VARCHAR(64) | NO | `BANK_REUSE_DETECTED`, `RAPID_BANK_CHANGE`, `DISPUTE_SPIKE`, `NAME_SIMILARITY_FLAG` |
| `score_delta` | INTEGER | NO | Points added or subtracted (e.g. `+30`, `-15`) |
| `new_score` | INTEGER | NO | Resulting composite risk score |
| `reason_code` | TEXT / VARCHAR(64) | NO | Systematic reason code |
| `metadata_json` | TEXT | YES | Context details (related account hash, store slug) |
| `created_at` | TEXT / DATETIME | NO | Event timestamp |

---

### 2.9 `security_audit_logs`
High-security audit trail for sensitive administrative and security-critical actions.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | NO | Internal primary key |
| `actor_type` | TEXT / VARCHAR(32) | NO | `super_admin`, `merchant`, `system` |
| `actor_id` | INTEGER | YES | Account ID of actor |
| `action` | TEXT / VARCHAR(64) | NO | `ROTATE_MONNIFY_KEY`, `OVERRIDE_VERIFICATION`, `SUSPEND_STORE`, `UPDATE_BANK` |
| `target_type` | TEXT / VARCHAR(32) | YES | `seller`, `store`, `integration`, `dispute` |
| `target_id` | INTEGER | YES | ID of target entity |
| `reason` | TEXT | YES | Mandatory justification for administrative override |
| `ip_address` | TEXT / VARCHAR(45) | YES | Client IP address |
| `created_at` | TEXT / DATETIME | NO | Creation timestamp |

---

### 2.10 `integration_events`
Monitors provider health, response latencies, and communication outcomes.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | NO | Internal primary key |
| `provider` | TEXT / VARCHAR(32) | NO | e.g. `monnify` |
| `endpoint` | TEXT / VARCHAR(150) | NO | Endpoint called (e.g. `/api/v2/disbursements/account/validate`) |
| `request_method` | TEXT / VARCHAR(10) | NO | `GET`, `POST` |
| `status_code` | INTEGER | YES | HTTP response status code |
| `duration_ms` | INTEGER | YES | Latency in milliseconds |
| `result` | TEXT / VARCHAR(20) | NO | `success`, `failure`, `timeout`, `rate_limited` |
| `error_code` | TEXT / VARCHAR(64) | YES | Monnify response code or system error |
| `correlation_id` | TEXT / VARCHAR(64) | NO | Distributed tracing correlation UUID |
| `created_at` | TEXT / DATETIME | NO | Request timestamp |

---

## 3. Database Indexes

To ensure sub-millisecond query execution, composite indexes are established:

```sql
CREATE INDEX IF NOT EXISTS idx_seller_store ON seller_profiles(store_id);
CREATE INDEX IF NOT EXISTS idx_seller_status ON seller_profiles(composite_verification_status);
CREATE INDEX IF NOT EXISTS idx_verif_seller ON seller_verifications(seller_id, verification_type);
CREATE INDEX IF NOT EXISTS idx_verif_status ON seller_verifications(status);
CREATE INDEX IF NOT EXISTS idx_bank_seller_active ON seller_bank_accounts(seller_id, is_active);
CREATE INDEX IF NOT EXISTS idx_bank_hash ON seller_bank_accounts(account_number_hash);
CREATE INDEX IF NOT EXISTS idx_fraud_store_status ON fraud_reports(reported_store_id, status);
CREATE INDEX IF NOT EXISTS idx_fraud_severity ON fraud_reports(severity, status);
CREATE INDEX IF NOT EXISTS idx_risk_seller ON risk_events(seller_id);
CREATE INDEX IF NOT EXISTS idx_sec_audit_action ON security_audit_logs(action, created_at);
CREATE INDEX IF NOT EXISTS idx_integ_provider_result ON integration_events(provider, result, created_at);
```

---

## 4. Backfill & Data Preservation Strategy

When migrating existing stores:
1. Every active store in `stores` is backfilled into `seller_profiles` with `seller_type = 'personal'`.
2. Existing bank details (`bank_name`, `bank_account_number`, `bank_account_name`) in `stores` are migrated into `seller_bank_accounts` with `account_number_encrypted`, `account_number_masked`, and `is_active = 1`.
3. To protect ongoing businesses, existing active stores that already have confirmed orders maintain normal operation while being prompted for one-time identity verification.
4. All 10 new security tables are registered in `PERSISTENCE_TABLES` in `src/db/persistence.ts` and `src/db/mysql.ts`, ensuring continuous replication to Hostinger MySQL.
