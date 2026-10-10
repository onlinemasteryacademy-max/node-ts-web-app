import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distServer = path.join(__dirname, 'dist', 'server.js');

// Auto-build if dist/server.js has not been compiled yet
if (!fs.existsSync(distServer)) {
  console.log('⚡ dist/server.js not found. Triggering build...');
  try {
    execSync('npm run build', { stdio: 'inherit', cwd: __dirname });
  } catch (err) {
    console.error('❌ Build failed:', err);
    process.exit(1);
  }
}

// Launch compiled production server
await import('./dist/server.js');
