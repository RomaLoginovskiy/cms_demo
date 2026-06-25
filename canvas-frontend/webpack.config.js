const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');
const webpack = require('webpack');

module.exports = (_env, argv) => {
  const isProduction = argv.mode === 'production';
  const apiUrl = process.env.REACT_APP_API_URL ?? 'http://localhost:8080';
  const hubUrl = process.env.REACT_APP_HUB_URL ?? `${apiUrl}/hubs/board`;
  const cmsApiUrl = process.env.REACT_APP_CMS_API_URL ?? 'http://localhost:5041';

  return {
    entry: './src/index.tsx',
    output: {
      path: path.resolve(__dirname, 'build'),
      filename: isProduction ? 'static/js/[name].[contenthash].js' : 'static/js/[name].js',
      publicPath: '/',
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
        template: './public/index.html'
      }),
      new webpack.DefinePlugin({
        'process.env.REACT_APP_API_URL': JSON.stringify(apiUrl),
        'process.env.REACT_APP_HUB_URL': JSON.stringify(hubUrl),
        'process.env.REACT_APP_CMS_API_URL': JSON.stringify(cmsApiUrl)
      })
    ],
    devServer: {
      historyApiFallback: true,
      hot: true,
      port: 3000
    }
  };
};
