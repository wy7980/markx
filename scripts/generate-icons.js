const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const iconsDir = path.resolve(__dirname, '../src-tauri/icons');

// 确保目录存在
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

console.log('Generating icons to:', iconsDir);

// 创建一个简单的图标（紫色背景 + 白色 M）
async function generateIcon(size, filename) {
  const svg = `
    <svg width="${size}" height="${size}">
      <rect width="${size}" height="${size}" rx="${size * 0.125}" fill="#6366f1"/>
      <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" 
            font-family="Arial" font-size="${size * 0.55}" font-weight="bold" fill="white">M</text>
    </svg>
  `;
  
  const outputPath = path.join(iconsDir, filename);
  await sharp(Buffer.from(svg))
    .png()
    .toFile(outputPath);
  
  console.log(`Generated: ${filename} (${fs.statSync(outputPath).size} bytes)`);
}

async function main() {
  try {
    await generateIcon(32, '32x32.png');
    await generateIcon(128, '128x128.png');
    await generateIcon(256, '128x128@2x.png');
    await generateIcon(256, 'icon.ico');
    await generateIcon(512, 'icon.icns');
    
    console.log('\nAll icons generated!');
    console.log('Files:', fs.readdirSync(iconsDir));
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
