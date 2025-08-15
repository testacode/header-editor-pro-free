const path = require('path');
const rspack = require('@rspack/core');

module.exports = {
  entry: {
    popup: './src/popup/popup.js',
    background: './src/background/background.js'
  },
  
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'js/[name].js',
    clean: true
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
    
    new rspack.CopyRspackPlugin({
      patterns: [
        {
          from: 'src/manifest.json',
          to: 'manifest.json'
        },
        {
          from: 'src/assets/icons',
          to: 'icons'
        }
      ]
    })
  ],
  
  optimization: {
    minimize: true,
    splitChunks: false // Chrome extensions don't support code splitting well
  },
  
  resolve: {
    extensions: ['.js', '.json']
  }
};