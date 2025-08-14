const path = require('path');
const rspack = require('@rspack/core');

module.exports = {
  entry: {
    popup: './src/popup/popup.js',
    background: './src/background/background.js'
  },
  
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'builtin:swc-loader',
          options: {
            jsc: {
              target: 'es2020',
              parser: {
                syntax: 'ecmascript'
              }
            }
          }
        }
      },
      {
        test: /\.css$/,
        use: [
          rspack.CssExtractRspackPlugin.loader,
          'css-loader'
        ]
      }
    ]
  },
  
  plugins: [
    new rspack.CssExtractRspackPlugin({
      filename: 'css/[name].css'
    }),
    
    new rspack.HtmlRspackPlugin({
      template: './src/popup/popup.html',
      filename: 'popup.html',
      chunks: ['popup']
    }),
    
    new rspack.HtmlRspackPlugin({
      template: './src/pages/privacy.html',
      filename: 'privacy.html',
      chunks: []
    })
  ],
  
  optimization: {
    minimize: true,
    splitChunks: false, // Chrome extensions don't support code splitting well
    minimizer: [
      // Rspack's built-in SWC minifier
    ]
  },
  
  resolve: {
    extensions: ['.js', '.json']
  }
};