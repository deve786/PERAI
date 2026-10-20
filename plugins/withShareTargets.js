const { AndroidConfig, withAndroidManifest, withStringsXml } = require('@expo/config-plugins');

/**
 * Registers PERAI as an Android share target for expo-sharing's receiver.
 *
 * expo-sharing's own plugin does this too, but its manifest also carries a
 * data-less SEND_MULTIPLE filter and a custom marker attribute, and the build
 * made with it would not install ("There was a problem parsing the package").
 * This writes the one SEND filter exactly as the build that did install had
 * it, plus the share_into_scheme string expo-sharing needs to turn a share
 * into a perai://expo-sharing link for Expo Router.
 */
module.exports = function withShareTargets(config, { mimeTypes = ['text/*', 'image/*'] } = {}) {
  config = withAndroidManifest(config, (cfg) => {
    const main = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    const filters = main['intent-filter'] ?? [];
    const hasSend = filters.some((f) =>
      (f.action ?? []).some((a) => a.$['android:name'] === 'android.intent.action.SEND')
    );
    if (!hasSend) {
      filters.push({
        action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
        data: mimeTypes.map((mimeType) => ({ $: { 'android:mimeType': mimeType } })),
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      });
    }
    main['intent-filter'] = filters;
    return cfg;
  });

  return withStringsXml(config, (cfg) => {
    cfg.modResults = AndroidConfig.Strings.setStringItem(
      [
        AndroidConfig.Resources.buildResourceItem({
          name: 'share_into_scheme',
          value: cfg.scheme,
          translatable: false,
        }),
      ],
      cfg.modResults
    );
    return cfg;
  });
};
