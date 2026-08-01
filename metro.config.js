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

// Inline requires: move each `require()` to its first point of use instead of
// evaluating every import when a module is first required.
//
// Without this, opening the admin area evaluated the whole admin subtree in one
// blocking chunk: AdminNavigator statically imports 27 screens and
// AdminTabNavigator 5 more (~30k lines, incl. expo-print / expo-sharing). The
// React.lazy() around AdminNavigator only defers that work to the moment admin
// opens — it doesn't shrink it. With inline requires, a screen's module body runs
// when it actually renders.
//
// Expo's default is `inlineRequires: false`, so this must be opted into. We wrap
// the existing getTransformOptions rather than replacing it, to preserve whatever
// else Expo sets there.
const baseGetTransformOptions = config.transformer.getTransformOptions;
config.transformer.getTransformOptions = async (entryPoints, options, getDependenciesOf) => {
  const base = await baseGetTransformOptions(entryPoints, options, getDependenciesOf);
  return {
    ...base,
    transform: {
      ...base.transform,
      inlineRequires: true,
    },
  };
};

module.exports = config;
