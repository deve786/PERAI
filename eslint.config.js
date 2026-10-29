// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Built output is not source. Without dist-web here, `npm run lint`
    // reported ten thousand problems in bundled code and buried the handful
    // that are actually in this project.
    ignores: ["dist/*", "dist-web/*"],
  }
]);
