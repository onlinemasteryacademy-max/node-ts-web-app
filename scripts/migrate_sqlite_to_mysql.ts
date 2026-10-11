import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { getMySQLPool, initMySQLSchema, isMySQLConfigured } from '../src/db/mysql.js';
import { ENV } from '../src/config/env.js';

export async function migrateSqliteToMySQL(): Promise<void> {
  console.log('🔄 Starting Safe SQLite -> MySQL Migration...');

  // 1. Locate Source SQLite Database
  const sqliteDbPath = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.resolve(__dirname, '../data/odivo.sqlite');

  if (!fs.existsSync(sqliteDbPath)) {
    console.log(`ℹ️ No existing SQLite database found at: ${sqliteDbPath}. Starting fresh.`);
    return;
  }

  // 2. Create Timestamped Backup of SQLite Database
  const backupDir = path.resolve(__dirname, '../data/backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `odivo_backup_${timestamp}.sqlite`);
  fs.copyFileSync(sqliteDbPath, backupPath);
  console.log(`🔒 Created backup of SQLite database at: ${backupPath}`);

  // 3. Verify MySQL Configuration
  if (!isMySQLConfigured()) {
    console.error('❌ Error: MySQL environment variables (DB_NAME, DB_USER) are not set. Cannot connect to Hostinger MySQL.');
    return;
  }

  const pool = getMySQLPool();

  try {
    // 4. Initialize Non-Destructive MySQL Schema
    console.log('⚡ Initializing MySQL schema (additive)...');
    await initMySQLSchema(pool);

    const sqliteDb = new DatabaseSync(sqliteDbPath);

    // List of tables to migrate idempotently
    const tablesToMigrate = [
      'platform_settings',
      'super_admins',
      'stores',
      'customers',
      'items',
      'orders',
      'debts',
      'coupons',
      'chat_conversations',
      'chat_messages',
      'branches',
      'staff_accounts',
      'reviews',
      'subscription_payments',
      'email_verifications',
      'notification_events',
      'payment_claims'
    ];

    const migrationSummary: Record<string, number> = {};

    for (const table of tablesToMigrate) {
      let rows: any[] = [];
      try {
        rows = sqliteDb.prepare(`SELECT * FROM ${table}`).all() as any[];
      } catch (err) {
        // Table might not exist in SQLite, safe to skip
        continue;
      }

      if (!rows || rows.length === 0) {
        migrationSummary[table] = 0;
        continue;
      }

      let insertedCount = 0;

      for (const row of rows) {
        const cols = Object.keys(row);
        const placeholders = cols.map(() => '?').join(', ');
        
        // Build ON DUPLICATE KEY UPDATE clause safely
        const updateClause = cols
          .filter(c => c !== 'id' && c !== 'created_at')
          .map(c => `\`${c}\` = VALUES(\`${c}\`)`)
          .join(', ');

        const sql = `
          INSERT INTO \`${table}\` (${cols.map(c => `\`${c}\``).join(', ')})
          VALUES (${placeholders})
          ${updateClause ? `ON DUPLICATE KEY UPDATE ${updateClause}` : ''}
        `;

        const values = cols.map(c => {
          const val = row[c];
          if (val === undefined || val === null) return null;
          if (typeof val === 'object') return JSON.stringify(val);
          return val;
        });

        try {
          await pool.query(sql, values);
          insertedCount++;
        } catch (insertErr: any) {
          console.warn(`⚠️ Note importing row in '${table}': ${insertErr.message}`);
        }
      }

      migrationSummary[table] = insertedCount;
    }

    console.log('\n🎉 Safe Idempotent Migration Complete! Summary of preserved records:');
    for (const [tbl, count] of Object.entries(migrationSummary)) {
      if (count > 0) {
        console.log(`  ✓ ${tbl}: ${count} record(s) synced to MySQL`);
      }
    }
  } catch (err: any) {
    console.error('❌ Migration error:', err.message);
  }
}

if (process.argv[1] && process.argv[1].endsWith('migrate_sqlite_to_mysql.ts')) {
  migrateSqliteToMySQL().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
