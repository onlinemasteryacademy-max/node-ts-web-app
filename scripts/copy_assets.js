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

copyDirSync(path.join(rootDir, 'src', 'views'), path.join(rootDir, 'dist', 'views'));
copyDirSync(path.join(rootDir, 'src', 'public'), path.join(rootDir, 'dist', 'public'));
console.log('✅ Assets (views & public) successfully copied to dist/');
