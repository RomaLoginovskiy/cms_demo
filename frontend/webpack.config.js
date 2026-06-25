const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');
const webpack = require('webpack');

module.exports = (_env, argv) => {
  const isProduction = argv.mode === 'production';
  const apiUrl = process.env.REACT_APP_API_URL ?? 'https://localhost:7043';
  const basePath = process.env.REACT_APP_BASE_PATH ?? '';
  const publicPath = process.env.PUBLIC_PATH ?? '/';
  const publicAssetPath = publicPath.endsWith('/') ? publicPath : `${publicPath}/`;

  return {
    entry: './src/index.tsx',
    output: {
      path: path.resolve(__dirname, 'build'),
      filename: isProduction ? 'static/js/[name].[contenthash].js' : 'static/js/[name].js',
      publicPath,
      clean: true
    },
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    resolve: {
      extensions: ['.tsx', '.ts', '.js']
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: {
            loader: 'ts-loader',
            options: {
              compilerOptions: {
                noEmit: false
              }
            }
          },
          exclude: /node_modules/
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader']
        }
      ]
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './public/index.html',
        publicAssetPath,
        runtimeEnvPath: `${publicAssetPath}runtime-env.js`
      }),
      new webpack.DefinePlugin({
        'process.env.REACT_APP_API_URL': JSON.stringify(apiUrl),
        'process.env.REACT_APP_BASE_PATH': JSON.stringify(basePath)
      })
    ],
    devServer: {
      historyApiFallback: true,
      hot: true,
      port: 3000
    }
  };
};
