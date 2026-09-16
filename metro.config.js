// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite ships its web build as a WebAssembly module. Metro treats .wasm
// as source unless it is registered as an asset, so bundling for web fails
// without this. Append rather than assign -- replacing assetExts would drop
// image and font handling.
config.resolver.assetExts.push('wasm');

module.exports = config;
