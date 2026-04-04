const sharp = require('sharp');
const pngToIco = require('png-to-ico').default;
const fs = require('fs');
const path = require('path');

const iconsDir = path.resolve(__dirname, '../src-tauri/icons');

// 确保目录存在
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

console.log('Generating icons to:', iconsDir);

// 创建一个简单的图标（紫色背景 + 白色 M）
async function generatePng(size, filename) {
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
  return outputPath;
}

async function generateIco() {
  // 生成多个尺寸的 PNG
  const sizes = [16, 32, 48, 64, 128, 256];
  const pngBuffers = await Promise.all(
    sizes.map(async (size) => {
      const svg = `
        <svg width="${size}" height="${size}">
          <rect width="${size}" height="${size}" rx="${size * 0.125}" fill="#6366f1"/>
          <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" 
                font-family="Arial" font-size="${size * 0.55}" font-weight="bold" fill="white">M</text>
        </svg>
      `;
      return sharp(Buffer.from(svg)).png().toBuffer();
    })
  );
  
  // 转换为 ICO
  const icoBuffer = await pngToIco(pngBuffers);
  const icoPath = path.join(iconsDir, 'icon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`Generated: icon.ico (${fs.statSync(icoPath).size} bytes)`);
}

async function generateIcns() {
  // macOS ICNS - 使用 PNG 作为占位（实际需要 icns 工具）
  // 对于 CI，我们可以使用 tauri 的自动生成
  const pngPath = await generatePng(512, 'icon.icns');
  console.log('Generated: icon.icns (PNG placeholder)');
}

async function main() {
  try {
    await generatePng(32, '32x32.png');
    await generatePng(128, '128x128.png');
    await generatePng(256, '128x128@2x.png');
    await generateIco();
    await generateIcns();
    
    console.log('\nAll icons generated!');
    console.log('Files:', fs.readdirSync(iconsDir));
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
