const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add support for additional file extensions
config.resolver.assetExts.push(
  // Fonts
  'otf',
  'ttf',
  // Images
  'png',
  'jpg',
  'jpeg',
  'svg',
  'gif',
  'webp',
  // Videos
  'mp4',
  'webm',
  // Audio
  'mp3',
  'wav',
  'm4a',
  'aac',
  // Other
  'json'
);

// Configure source extensions
config.resolver.sourceExts.push('tsx', 'ts', 'jsx', 'js', 'json');

// Configure platforms
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

// Force react-native-paper to use compiled lib instead of raw src
// Paper's package.json has "react-native": "src/index.tsx" which causes
// Metro to bundle from source, but internal .ts imports fail to resolve.
const path = require('path');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native-paper') {
    return {
      filePath: path.resolve(__dirname, 'node_modules/react-native-paper/lib/commonjs/index.js'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
