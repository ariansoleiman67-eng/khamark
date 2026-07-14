const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withFmtFix = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const file = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(file, 'utf8');

      if (contents.includes('INJECTED_BY_withFmtFix_Unconditional')) {
        return config;
      }

      const patch = `    # INJECTED_BY_withFmtFix_Unconditional
    # Permanently bypass Xcode 16 consteval crash by patching fmt library directly
    fmt_base_h = File.join(__dir__, "Pods/fmt/include/fmt/base.h")
    if File.exist?(fmt_base_h)
      require 'fileutils'
      FileUtils.chmod(0644, fmt_base_h)
      fmt_content = File.read(fmt_base_h)
      fmt_content = fmt_content.gsub("#  define FMT_CONSTEVAL consteval", "#  define FMT_CONSTEVAL constexpr")
      File.write(fmt_base_h, fmt_content)
    end
`;

      const postInstallRegex = /(post_install\s+do\s+\|installer\|)/;

      if (postInstallRegex.test(contents)) {
        contents = contents.replace(postInstallRegex, "$1\n" + patch);
        fs.writeFileSync(file, contents);
      }
      return config;
    },
  ]);
};

module.exports = withFmtFix;
