const { merge } = require('webpack-merge');
const rspack = require('@rspack/core');
const baseConfig = require('./rspack.config.base');

module.exports = merge(baseConfig, {
  output: {
    path: __dirname + '/dist/firefox',
    filename: 'js/[name].js',
    clean: true
  },
  
  plugins: [
    new rspack.CopyRspackPlugin({
      patterns: [
        {
          from: 'src/manifest/manifest.firefox.json',
          to: 'manifest.json'
        },
        {
          from: 'src/assets/icons',
          to: 'icons'
        }
      ]
    })
  ]
});