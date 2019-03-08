const path = require('path');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const analyze = !!process.env.ANALYZE

module.exports = {
  entry: './src/index.ts',
  module: {
    rules: [
      {
        test: /\.ts?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: "tsconfig.browser.json"
            }
          }
        ]
      },
      {
        test: /\.js$/,
        use: {
          loader: 'babel-loader'
        }
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  output: {
    filename: 'blockstack.js',
    path: path.resolve(__dirname, 'dist'),
    library: 'blockstack',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  plugins: [].concat(analyze ? new BundleAnalyzerPlugin() : [])
};