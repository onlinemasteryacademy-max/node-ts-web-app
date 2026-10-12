/**
 * Image Asset Recovery & Persistence Consolidation Script
 * Scans all historical locations (php-web-app/uploads, src/public/uploads, dist/public/uploads)
 * and safely consolidates all images into persistent data/uploads directory without overwriting.
 */
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const projectRoot = path.resolve(__dirname, '..', '..');

const persistentUploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(rootDir, 'data', 'uploads');

// Ensure persistent directory and subfolders exist
['', 'logos', 'products', 'sounds', 'receipts'].forEach(sub => {
  const dir = path.join(persistentUploadsDir, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function copyRecursiveSafe(src, dest) {
  if (!fs.existsSync(src)) return 0;
  let copied = 0;
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.gitkeep') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      copied += copyRecursiveSafe(srcPath, destPath);
    } else {
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath);
        copied++;
      }
    }
  }
  return copied;
}

const sources = [
  path.join(rootDir, 'src', 'public', 'uploads'),
  path.join(rootDir, 'dist', 'public', 'uploads'),
  path.join(projectRoot, 'php-web-app', 'uploads'),
  path.join(projectRoot, 'uploads')
];

let totalRecovered = 0;
for (const src of sources) {
  if (fs.existsSync(src)) {
    const count = copyRecursiveSafe(src, persistentUploadsDir);
    totalRecovered += count;
  }
}

console.log(`✅ Asset Recovery complete. ${totalRecovered} assets consolidated into ${persistentUploadsDir}`);
