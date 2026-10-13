const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Views and static assets copy
copyDirSync(path.join(rootDir, 'src', 'views'), path.join(rootDir, 'dist', 'views'));
copyDirSync(path.join(rootDir, 'src', 'public'), path.join(rootDir, 'dist', 'public'));

// 2. Ensure data/uploads files are also mirrored to dist/public/uploads as secondary fallback
const persistentUploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(rootDir, 'data', 'uploads');
if (fs.existsSync(persistentUploadsDir)) {
  copyDirSync(persistentUploadsDir, path.join(rootDir, 'dist', 'public', 'uploads'));
}

console.log('✅ Assets (views, public, persistent uploads) successfully copied to dist/');

