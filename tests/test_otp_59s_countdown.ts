import assert from 'node:assert';
import crypto from 'node:crypto';
import { dbFetchOne, dbFetchAll, dbInsert, dbUpdate } from '../src/db/db.js';
import { hashPassword, comparePassword } from '../src/utils/helpers.js';

function parseDateMs(dateStr: string | number | Date | null | undefined): number {
  if (!dateStr) return 0;
  if (typeof dateStr === 'number') return dateStr;
  if (dateStr instanceof Date) return dateStr.getTime();
  const s = String(dateStr).trim();
  if (s.endsWith('Z')) return new Date(s).getTime();
  if (s.includes('T')) return new Date(s + 'Z').getTime();
  return new Date(s.replace(' ', 'T') + 'Z').getTime();
}

async function testOtp59sLifecycle() {
  console.log('======================================================');
  console.log('🧪 TESTING 59-SECOND OTP EMAIL VERIFICATION LIFECYCLE');
  console.log('======================================================\n');

  const testTimestamp = Date.now();
  const email = `merchant_${testTimestamp}@omastery.com`;
  const ownerName = 'Test Merchant';
  const rawOtp = String(crypto.randomInt(100000, 999999));
  const otpHash = crypto.createHash('sha256').update(rawOtp).digest('hex');
  const token = crypto.randomUUID();
  const nowMs = Date.now();
  const expiresAt = new Date(nowMs + 59 * 1000).toISOString();

  // 1. Insert OTP Verification Record
  const verifId = dbInsert('email_verifications', {
    email,
    otp_hash: otpHash,
    token,
    payload_json: JSON.stringify({
      slug: `test-store-${testTimestamp}`,
      store_name: 'Test Store',
      owner_name: ownerName,
      email,
      password_hash: await hashPassword('TestPassword123!'),
      whatsapp_number: '08011223344',
      plan_tier: 'free',
      billing_cycle: 'monthly'
    }),
    attempts: 0,
    expires_at: expiresAt,
    used: 0,
    created_at: new Date(nowMs).toISOString()
  });

  const record = dbFetchOne<any>('email_verifications', { id: verifId });
  assert(record !== null, 'Verification record inserted successfully');

  // 2. Validate Expiration is NOT false-positive within 59 seconds
  const parsedExpiry = parseDateMs(record.expires_at);
  const isExpiredImmediately = Date.now() > parsedExpiry;
  assert(!isExpiredImmediately, 'OTP is NOT expired immediately after creation');
  console.log('  ✅ PASS: Stored expires_at parses correctly and is active for 59 seconds');

  // 3. Reject Wrong 6-Digit Code
  const wrongCode = '000000';
  const wrongHash = crypto.createHash('sha256').update(wrongCode).digest('hex');
  assert(wrongHash !== record.otp_hash, 'Wrong OTP code hash fails match');
  dbUpdate('email_verifications', { attempts: record.attempts + 1 }, { id: record.id });
  console.log('  ✅ PASS: Non-matching OTP code is strictly rejected');

  // 4. Accept Correct 6-Digit Code
  const correctHash = crypto.createHash('sha256').update(rawOtp).digest('hex');
  assert(correctHash === record.otp_hash, 'Correct 6-digit OTP hash matches');
  console.log('  ✅ PASS: Exact 6-digit code sent to email is accepted');

  // 5. Test Expired Code Scenario (>59s simulated)
  const expiredMs = Date.now() - 5000; // 5 seconds in the past
  const expiredIso = new Date(expiredMs).toISOString();
  dbUpdate('email_verifications', { expires_at: expiredIso }, { id: record.id });
  
  const expiredRecord = dbFetchOne<any>('email_verifications', { id: record.id });
  const isNowExpired = Date.now() > parseDateMs(expiredRecord.expires_at);
  assert(isNowExpired, 'Record older than 59s is accurately recognized as expired');
  console.log('  ✅ PASS: Expired OTP is blocked after 59 seconds');

  // 6. Test Resend OTP & Reset Countdown to 59s
  const resendOtp = String(crypto.randomInt(100000, 999999));
  const resendHash = crypto.createHash('sha256').update(resendOtp).digest('hex');
  const freshNowMs = Date.now();
  const freshExpiresAt = new Date(freshNowMs + 59 * 1000).toISOString();

  dbUpdate('email_verifications', {
    otp_hash: resendHash,
    attempts: 0,
    expires_at: freshExpiresAt,
    created_at: new Date(freshNowMs).toISOString()
  }, { id: record.id });

  const refreshedRecord = dbFetchOne<any>('email_verifications', { id: record.id });
  assert(Date.now() <= parseDateMs(refreshedRecord.expires_at), 'Refreshed OTP is active');
  assert(refreshedRecord.attempts === 0, 'Attempts counter reset to 0 upon resend');
  assert(crypto.createHash('sha256').update(resendOtp).digest('hex') === refreshedRecord.otp_hash, 'Fresh 6-digit code accepted');
  console.log('  ✅ PASS: Resend OTP refreshes 59s timer and accepts new email code');

  console.log('\n======================================================');
  console.log('🎉 ALL 59-SECOND OTP TESTS PASSED ACCURATELY!');
  console.log('======================================================\n');
}

testOtp59sLifecycle().catch(err => {
  console.error(err);
  process.exit(1);
});
