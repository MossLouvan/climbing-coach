module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@app': './src/app',
            '@domain': './src/domain',
            '@analysis': './src/analysis',
            '@viz': './src/viz',
            '@storage': './src/storage',
            '@utils': './src/utils',
            '@config': './src/config',
            '@assets': './assets',
          },
        },
      ],
      // NOTE: reanimated plugin MUST be listed last.
      'react-native-reanimated/plugin',
    ],
  };
};
