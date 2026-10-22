/* global process */

const CopyPlugin = require('copy-webpack-plugin');

const environmentFiles = {
  local: 'environment.json',
  staging: 'environment.staging.json',
  production: 'environment.production.json',
  uat: 'environment.uat.json',
};

const environmentName = process.env.NODE_ENV || 'local';
const environmentFile = environmentFiles[environmentName] || environmentFiles.local;
const source = `${process.cwd()}/environments/${environmentFile}`;
const destination = `${process.cwd()}/build/environments/environment.json`;

module.exports = {
  entry: source,
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.json$/i,
        loader: 'file-loader',
        type: 'javascript/auto',
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [{ from: source, to: destination }],
    }),
  ],
};