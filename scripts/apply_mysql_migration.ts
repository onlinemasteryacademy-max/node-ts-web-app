import { getMySQLPool, initMySQLSchema, isMySQLConfigured } from '../src/db/mysql.js';
import { ENV } from '../src/config/env.js';

export async function applyMigration(): Promise<void> {
  console.log('======================================================');
  console.log('🔄 ZLIK MYSQL SCHEMA MIGRATION');
  console.log('======================================================\n');

  if (!isMySQLConfigured()) {
    console.error('❌ Error: MySQL credentials (DB_NAME, DB_USER) not detected in environment.');
    console.error('Please verify that DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD are set in your .env file.');
    process.exit(1);
  }

  console.log(`📡 Connecting to MySQL: ${ENV.DB_HOST}:${ENV.DB_PORT} (Database: ${ENV.DB_NAME}, User: ${ENV.DB_USER})...`);
  const pool = getMySQLPool();

  try {
    // Test connection
    const [testRows] = await pool.query('SELECT 1 + 1 AS connection_test');
    console.log('✅ Connection to MySQL established successfully.\n');

    // Run additive schema creation
    console.log('⚡ Applying additive table schemas & composite indexes...');
    await initMySQLSchema(pool);

    // Verify created tables
    const [tables] = await pool.query<any[]>('SHOW TABLES;');
    const tableNames = tables.map(t => Object.values(t)[0]);

    console.log('\n======================================================');
    console.log(`🎉 MIGRATION COMPLETE: ${tableNames.length} Tables Active in ${ENV.DB_NAME}`);
    console.log('======================================================\n');
    console.log('Active Tables:');
    tableNames.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
    console.log('\n🔒 Safety Note: All schemas are additive. Zero tables were dropped or truncated.');

    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ Migration Failed:', err.message);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('apply_mysql_migration.ts')) {
  applyMigration();
}
