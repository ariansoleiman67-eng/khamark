const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { PNG } = require('pngjs');

const ROOT = path.join(__dirname, '..');
const MASTER_SRC = path.join(ROOT, 'assets/images/khamark_logo_white.png');
const masterData = fs.readFileSync(MASTER_SRC);
const masterPng = PNG.sync.read(masterData);

const BG_COLOR = { r: 166, g: 25, b: 32, a: 255 }; // Solid Khamark crimson #A61920

/**
 * High-quality area-averaging resampling for crisp downscaling
 */
function resampleLogo(targetW, targetH) {
  const result = new PNG({ width: targetW, height: targetH });
  const scaleX = masterPng.width / targetW;
  const scaleY = masterPng.height / targetH;

  for (let dy = 0; dy < targetH; dy++) {
    const syStart = dy * scaleY;
    const syEnd = (dy + 1) * scaleY;
    const syMin = Math.floor(syStart);
    const syMax = Math.min(masterPng.height - 1, Math.floor(syEnd));

    for (let dx = 0; dx < targetW; dx++) {
      const sxStart = dx * scaleX;
      const sxEnd = (dx + 1) * scaleX;
      const sxMin = Math.floor(sxStart);
      const sxMax = Math.min(masterPng.width - 1, Math.floor(sxEnd));

      let totalA = 0;
      let totalWeight = 0;

      for (let sy = syMin; sy <= syMax; sy++) {
        const yWeight = Math.min(sy + 1, syEnd) - Math.max(sy, syStart);
        if (yWeight <= 0) continue;

        for (let sx = sxMin; sx <= sxMax; sx++) {
          const xWeight = Math.min(sx + 1, sxEnd) - Math.max(sx, sxStart);
          if (xWeight <= 0) continue;

          const weight = xWeight * yWeight;
          const srcIdx = (masterPng.width * sy + sx) * 4;
          const a = masterPng.data[srcIdx + 3];

          totalA += a * weight;
          totalWeight += weight;
        }
      }

      const finalA = totalWeight > 0 ? Math.round(totalA / totalWeight) : 0;
      const dstIdx = (targetW * dy + dx) * 4;
      result.data[dstIdx] = 255;
      result.data[dstIdx + 1] = 255;
      result.data[dstIdx + 2] = 255;
      result.data[dstIdx + 3] = finalA;
    }
  }

  return result;
}

/**
 * Composite logo onto square canvas
 */
function createIconImage(canvasSize, logoWidth, transparentBg = false, isCircle = false) {
  const logoHeight = Math.round(logoWidth * (masterPng.height / masterPng.width));
  const resizedLogo = resampleLogo(logoWidth, logoHeight);

  const canvas = new PNG({ width: canvasSize, height: canvasSize });
  const startX = Math.round((canvasSize - logoWidth) / 2);
  const startY = Math.round((canvasSize - logoHeight) / 2);
  const radius = canvasSize / 2;

  // Fill canvas
  for (let y = 0; y < canvasSize; y++) {
    for (let x = 0; x < canvasSize; x++) {
      const idx = (canvasSize * y + x) * 4;
      const distSq = (x - radius + 0.5) ** 2 + (y - radius + 0.5) ** 2;

      if (transparentBg || (isCircle && distSq > radius ** 2)) {
        canvas.data[idx] = 0;
        canvas.data[idx + 1] = 0;
        canvas.data[idx + 2] = 0;
        canvas.data[idx + 3] = 0;
      } else {
        canvas.data[idx] = BG_COLOR.r;
        canvas.data[idx + 1] = BG_COLOR.g;
        canvas.data[idx + 2] = BG_COLOR.b;
        canvas.data[idx + 3] = 255;
      }
    }
  }

  // Composite resized logo onto canvas
  for (let ly = 0; ly < logoHeight; ly++) {
    const cy = startY + ly;
    if (cy < 0 || cy >= canvasSize) continue;

    for (let lx = 0; lx < logoWidth; lx++) {
      const cx = startX + lx;
      if (cx < 0 || cx >= canvasSize) continue;

      const logoIdx = (logoWidth * ly + lx) * 4;
      const canvasIdx = (canvasSize * cy + cx) * 4;

      const logoA = resizedLogo.data[logoIdx + 3] / 255;
      if (logoA === 0) continue;

      if (transparentBg) {
        canvas.data[canvasIdx] = 255;
        canvas.data[canvasIdx + 1] = 255;
        canvas.data[canvasIdx + 2] = 255;
        canvas.data[canvasIdx + 3] = resizedLogo.data[logoIdx + 3];
      } else {
        const bgR = canvas.data[canvasIdx];
        const bgG = canvas.data[canvasIdx + 1];
        const bgB = canvas.data[canvasIdx + 2];

        canvas.data[canvasIdx] = Math.round(255 * logoA + bgR * (1 - logoA));
        canvas.data[canvasIdx + 1] = Math.round(255 * logoA + bgG * (1 - logoA));
        canvas.data[canvasIdx + 2] = Math.round(255 * logoA + bgB * (1 - logoA));
        canvas.data[canvasIdx + 3] = 255;
      }
    }
  }

  return canvas;
}

console.log('Generating root assets/icon.png (1024x1024, fully opaque #A61920)...');
// 1024x1024 square with 680px centered logo (~66% width for safe margins)
const appIcon1024 = createIconImage(1024, 700, false, false);
fs.writeFileSync(path.join(ROOT, 'assets/icon.png'), PNG.sync.write(appIcon1024));

console.log('Generating iOS App-Icon-1024x1024@1x.png...');
const iosAppIconPath = path.join(ROOT, 'ios/Asankary/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png');
fs.writeFileSync(iosAppIconPath, PNG.sync.write(appIcon1024));

console.log('Generating assets/adaptive-icon.png (432x432, transparent foreground)...');
// 432x432 adaptive foreground: centered within 66% circle (logo width ~260px)
const adaptiveIcon432 = createIconImage(432, 260, true, false);
fs.writeFileSync(path.join(ROOT, 'assets/adaptive-icon.png'), PNG.sync.write(adaptiveIcon432));

console.log('Generating assets/logo.png and favicon...');
const logoImg = createIconImage(256, 200, true, false);
fs.writeFileSync(path.join(ROOT, 'assets/logo.png'), PNG.sync.write(logoImg));

const faviconImg = createIconImage(48, 38, false, false);
fs.writeFileSync(path.join(ROOT, 'assets/favicon.png'), PNG.sync.write(faviconImg));

// Android Mipmap densities
const mipmaps = [
  { dir: 'mipmap-mdpi', launcherSize: 48, fgSize: 108, logoW: 34, fgLogoW: 65 },
  { dir: 'mipmap-hdpi', launcherSize: 72, fgSize: 162, logoW: 51, fgLogoW: 98 },
  { dir: 'mipmap-xhdpi', launcherSize: 96, fgSize: 216, logoW: 68, fgLogoW: 130 },
  { dir: 'mipmap-xxhdpi', launcherSize: 144, fgSize: 324, logoW: 102, fgLogoW: 195 },
  { dir: 'mipmap-xxxhdpi', launcherSize: 192, fgSize: 432, logoW: 136, fgLogoW: 260 },
];

for (const m of mipmaps) {
  const fullDir = path.join(ROOT, 'android/app/src/main/res', m.dir);
  if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });

  console.log(`Generating Android icons for ${m.dir}...`);
  // Square launcher
  const sq = createIconImage(m.launcherSize, m.logoW, false, false);
  const sqPngPath = path.join(fullDir, 'ic_launcher_temp.png');
  fs.writeFileSync(sqPngPath, PNG.sync.write(sq));
  execSync(`cwebp -q 95 "${sqPngPath}" -o "${path.join(fullDir, 'ic_launcher.webp')}"`);
  fs.unlinkSync(sqPngPath);

  // Round launcher
  const rd = createIconImage(m.launcherSize, m.logoW, false, true);
  const rdPngPath = path.join(fullDir, 'ic_launcher_round_temp.png');
  fs.writeFileSync(rdPngPath, PNG.sync.write(rd));
  execSync(`cwebp -q 95 "${rdPngPath}" -o "${path.join(fullDir, 'ic_launcher_round.webp')}"`);
  fs.unlinkSync(rdPngPath);

  // Foreground
  const fg = createIconImage(m.fgSize, m.fgLogoW, true, false);
  const fgPngPath = path.join(fullDir, 'ic_launcher_fg_temp.png');
  fs.writeFileSync(fgPngPath, PNG.sync.write(fg));
  execSync(`cwebp -q 95 "${fgPngPath}" -o "${path.join(fullDir, 'ic_launcher_foreground.webp')}"`);
  fs.unlinkSync(fgPngPath);
}

console.log('Regenerating splash assets to guarantee 100% synchronization...');
require('./generate_splash_assets.js');

console.log('All app icons and splash assets successfully generated with Khamark Global branding!');
