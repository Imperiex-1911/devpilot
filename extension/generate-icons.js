// Run this once to generate placeholder icons: node generate-icons.js
// Requires: npm install canvas (in the extension folder, dev only)
// Or just place 16x16, 48x48, 128x128 PNG files in icons/ manually.

// For a quick placeholder without dependencies, here is a base64-encoded
// simple green circle PNG for each size. Decode and save as the icon files.

const fs = require('fs');
const path = require('path');

// Minimal valid 1x1 green PNG (base64) — Chrome will scale it
// Replace with real icons before publishing to Chrome Web Store
const GREEN_PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const sizes = [16, 48, 128];
const iconsDir = path.join(__dirname, 'icons');

if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

sizes.forEach(size => {
  const file = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(file, Buffer.from(GREEN_PNG_1x1, 'base64'));
  console.log(`Created ${file}`);
});

console.log('Done! Replace with real icons before publishing.');
