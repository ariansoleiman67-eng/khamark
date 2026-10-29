const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = path.join(__dirname, '..');
const MASTER_SRC = path.join(ROOT, 'assets/images/khamark_logo_white.png');
const masterData = fs.readFileSync(MASTER_SRC);
const masterPng = PNG.sync.read(masterData);

const BG_COLOR = { r: 166, g: 25, b: 32, a: 255 }; // #A61920

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
 * Creates a square splash canvas with solid crimson #A61920 and centered white logo
 */
function createSplashImage(canvasSize, logoWidth, transparentBg = false) {
  const logoHeight = Math.round(logoWidth * (masterPng.height / masterPng.width));
  const resizedLogo = resampleLogo(logoWidth, logoHeight);

  const canvas = new PNG({ width: canvasSize, height: canvasSize });
  const startX = Math.round((canvasSize - logoWidth) / 2);
  const startY = Math.round((canvasSize - logoHeight) / 2);

  // Fill background
  for (let y = 0; y < canvasSize; y++) {
    for (let x = 0; x < canvasSize; x++) {
      const idx = (canvasSize * y + x) * 4;
      if (transparentBg) {
        canvas.data[idx] = 0;
        canvas.data[idx + 1] = 0;
        canvas.data[idx + 2] = 0;
        canvas.data[idx + 3] = 0;
      } else {
        canvas.data[idx] = BG_COLOR.r;
        canvas.data[idx + 1] = BG_COLOR.g;
        canvas.data[idx + 2] = BG_COLOR.b;
        canvas.data[idx + 3] = BG_COLOR.a;
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

        // Alpha blend white (255,255,255) onto #A61920 (166,25,32)
        canvas.data[canvasIdx] = Math.round(255 * logoA + bgR * (1 - logoA));
        canvas.data[canvasIdx + 1] = Math.round(255 * logoA + bgG * (1 - logoA));
        canvas.data[canvasIdx + 2] = Math.round(255 * logoA + bgB * (1 - logoA));
        canvas.data[canvasIdx + 3] = 255;
      }
    }
  }

  return canvas;
}

// 1. Generate iOS splash assets (transparent background so SplashScreenBackground is completely seamless)
console.log('Generating iOS SplashScreenLegacy assets...');
const iosDir = path.join(ROOT, 'ios/Asankary/Images.xcassets/SplashScreenLegacy.imageset');

// 1x: 1024x1024 with 548px logo (53.51%)
const img1x = createSplashImage(1024, 548, true);
fs.writeFileSync(path.join(iosDir, 'image.png'), PNG.sync.write(img1x));

// 2x: 2048x2048 with 1096px logo
const img2x = createSplashImage(2048, 1096, true);
fs.writeFileSync(path.join(iosDir, 'image@2x.png'), PNG.sync.write(img2x));

// 3x: 3072x3072 with 1644px logo
const img3x = createSplashImage(3072, 1644, true);
fs.writeFileSync(path.join(iosDir, 'image@3x.png'), PNG.sync.write(img3x));

// 2. Generate root assets/splash-icon.png (2048x2048 high res, transparent)
console.log('Generating assets/splash-icon.png...');
fs.writeFileSync(path.join(ROOT, 'assets/splash-icon.png'), PNG.sync.write(img2x));

// 3. Generate Android splashscreen_logo.png for all densities (with safe circular crop padding, transparent)
console.log('Generating Android splashscreen_logo assets...');
const androidTargets = [
  { dir: 'android/app/src/main/res/drawable-mdpi', size: 288, logoW: 138 },
  { dir: 'android/app/src/main/res/drawable-hdpi', size: 432, logoW: 207 },
  { dir: 'android/app/src/main/res/drawable-xhdpi', size: 576, logoW: 276 },
  { dir: 'android/app/src/main/res/drawable-xxhdpi', size: 864, logoW: 414 },
  { dir: 'android/app/src/main/res/drawable-xxxhdpi', size: 1152, logoW: 552 },
];

for (const target of androidTargets) {
  const fullDir = path.join(ROOT, target.dir);
  if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });
  const aImg = createSplashImage(target.size, target.logoW, true);
  fs.writeFileSync(path.join(fullDir, 'splashscreen_logo.png'), PNG.sync.write(aImg));
}

console.log('All splash assets generated successfully!');
