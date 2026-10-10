import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getDb, initSchema } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const phpJsonPath = path.resolve(__dirname, '../../../php-web-app/data/db_store.json');
const phpDbPath = path.resolve(__dirname, '../../../php-web-app/data/odivo.sqlite');

export function runSeed(): void {
  const targetDbPath = path.resolve(__dirname, '../../data/odivo.sqlite');
  if (fs.existsSync(targetDbPath)) {
    try {
      fs.unlinkSync(targetDbPath);
    } catch (e) {}
  }

  const db = getDb();
  initSchema(db);

  if (fs.existsSync(phpJsonPath)) {
    console.log('⚡ Seeding database from db_store.json...');
    const jsonData = JSON.parse(fs.readFileSync(phpJsonPath, 'utf8'));
    
    for (const [table, rows] of Object.entries(jsonData)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      try {
        db.exec(`DELETE FROM ${table}`);
        const cols = Object.keys(rows[0]);
        const placeholders = cols.map(() => '?').join(', ');
        const insertStmt = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`);
        
        for (const row of rows) {
          const params = cols.map(c => {
            const val = row[c];
            if (val === undefined || val === null) return null;
            if (typeof val === 'object') return JSON.stringify(val);
            if (typeof val === 'boolean') return val ? 1 : 0;
            return val;
          });
          insertStmt.run(...params);
        }
        console.log(`✓ Seeded '${table}': ${rows.length} rows.`);
      } catch (e: any) {
        console.log(`⚠️ Note for '${table}': ${e.message}`);
      }
    }
  }

  // Also sync any newer chat messages from SQLite WAL if present
  if (fs.existsSync(phpDbPath)) {
    try {
      const phpDb = new DatabaseSync(phpDbPath);
      const chatMsgs = phpDb.prepare('SELECT * FROM chat_messages').all() as Record<string, any>[];
      if (chatMsgs.length > 0) {
        db.exec('DELETE FROM chat_messages');
        const cols = Object.keys(chatMsgs[0]);
        const placeholders = cols.map(() => '?').join(', ');
        const insertStmt = db.prepare(`INSERT INTO chat_messages (${cols.join(', ')}) VALUES (${placeholders})`);
        for (const msg of chatMsgs) {
          const params = cols.map(c => msg[c]);
          insertStmt.run(...params);
        }
        console.log(`✓ Synced 'chat_messages' from SQLite DB: ${chatMsgs.length} messages.`);
      }
    } catch (err: any) {}
  }

  console.log('🎉 Database fully seeded and synchronized!');
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  runSeed();
}
