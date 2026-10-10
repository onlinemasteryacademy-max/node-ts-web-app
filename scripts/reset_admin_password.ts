import crypto from 'node:crypto';
import { getDb, dbFetchOne, dbUpdate, dbInsert } from '../src/db/db.js';
import { hashPassword } from '../src/utils/helpers.js';
import { ENV } from '../src/config/env.js';

async function resetAdminPasswordCLI() {
  const args = process.argv.slice(2);
  let newPassword = args[0];
  let adminEmail = (args[1] || ENV.SUPER_ADMIN_EMAIL || 'admin@zlik.store').toLowerCase().trim();

  if (!newPassword) {
    // Generate a strong cryptographic password if none provided
    newPassword = 'Zlik#' + crypto.randomBytes(8).toString('hex') + '!2026';
  }

  console.log('\n======================================================');
  console.log('🔒 ZLIK PLATFORM - ADMIN SECURITY CREDENTIAL ROTATION');
  console.log('======================================================\n');

  const admin = dbFetchOne<any>('super_admins', { email: adminEmail });
  const passHash = hashPassword(newPassword);
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  if (!admin) {
    console.log(`ℹ️ Admin account "${adminEmail}" not found. Creating new master Super Admin...`);
    const newId = dbInsert('super_admins', {
      email: adminEmail,
      password_hash: passHash,
      name: 'Master Super Administrator',
      role: 'super_admin',
      created_at: now
    });
    console.log(`✅ Super Admin created successfully (ID: ${newId})`);
  } else {
    dbUpdate('super_admins', { password_hash: passHash }, { id: admin.id });
    console.log(`✅ Password successfully updated for Admin: ${admin.name} (${admin.email})`);
  }

  // Record audit log
  dbInsert('admin_audit_logs', {
    admin_id: admin ? admin.id : 0,
    admin_name: 'CLI Security Tool',
    action: 'Admin Password Rotated (CLI)',
    target_type: 'super_admins',
    target_id: admin ? admin.id : 0,
    details: `Password rotated via terminal CLI tool for "${adminEmail}"`,
    ip_address: '127.0.0.1',
    created_at: now
  });

  console.log('\n------------------------------------------------------');
  console.log(`👤 Email:    ${adminEmail}`);
  console.log(`🔑 Password: ${newPassword}`);
  console.log(`🌐 Secret Login URL: http://localhost:3000/${ENV.ADMIN_SECRET_PATH}/login`);
  console.log(`🛡️ Dashboard URL:    http://localhost:3000/${ENV.ADMIN_SECRET_PATH}`);
  console.log('------------------------------------------------------');
  console.log('⚠️ Note: Traditional /admin URL is disabled (returns 404). Store these credentials securely.\n');
}

resetAdminPasswordCLI().catch(err => {
  console.error('❌ Error resetting admin password:', err);
  process.exit(1);
});
