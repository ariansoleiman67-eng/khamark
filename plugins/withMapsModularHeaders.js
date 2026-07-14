const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withMapsModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const file = path.join(config.modRequest.platformProjectRoot, 'Podfile');

      if (!fs.existsSync(file)) {
        return config;
      }

      let contents = fs.readFileSync(file, 'utf8');

      // Only inject once
      if (contents.includes('INJECTED_BY_withMapsModularHeaders')) {
        return config;
      }

      // The code to inject inside the existing post_install block
      const codeToInject = [
        '    # INJECTED_BY_withMapsModularHeaders',
        '    installer.pods_project.targets.each do |target|',
        '      target.build_configurations.each do |build_config|',
        '        # Fix: folly/coro/Coroutine.h file not found',
        '        defs = build_config.build_settings["GCC_PREPROCESSOR_DEFINITIONS"] || ["$(inherited)"]',
        '        unless defs.include?("FOLLY_HAS_COROUTINES=0")',
        '          defs << "FOLLY_HAS_COROUTINES=0"',
        '          build_config.build_settings["GCC_PREPROCESSOR_DEFINITIONS"] = defs',
        '        end',
        '        # Fix: react-native-maps non-modular header includes',
        '        if target.name == "react-native-maps" || target.name == "react-native-google-maps"',
        '          build_config.build_settings["CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES"] = "YES"',
        '        end',
        '      end',
        '    end',
      ].join("\n");

      // Find the existing post_install block and inject right after the opening line
      const postInstallRegex = /(post_install\s+do\s+\|installer\|)/;

      if (postInstallRegex.test(contents)) {
        contents = contents.replace(postInstallRegex, "$1\n" + codeToInject);
        fs.writeFileSync(file, contents);
      }

      return config;
    },
  ]);
};
