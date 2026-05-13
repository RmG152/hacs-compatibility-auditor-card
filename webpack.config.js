const path = require('path');
const zlib = require('zlib');
const fs = require('fs');

const outputDir = 'dist';

class GzipPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tapAsync('GzipPlugin', (compilation, callback) => {
      const { path: outputPath } = compilation.options.output;
      const filename = compilation.getAsset('hacs-compatibility-auditor-card.js');
      if (!filename) {
        callback();
        return;
      }
      const fullPath = path.resolve(outputPath, 'hacs-compatibility-auditor-card.js');
      const gzipPath = fullPath + '.gz';
      const input = fs.createReadStream(fullPath);
      const output = fs.createWriteStream(gzipPath);
      const gzip = zlib.createGzip({ level: 9 });
      input.pipe(gzip).pipe(output);
      output.on('finish', callback);
      output.on('error', callback);
    });
  }
}

module.exports = {
  entry: './src/index.ts',
  output: {
    filename: 'hacs-compatibility-auditor-card.js',
    path: path.resolve(__dirname, outputDir),
    libraryTarget: 'module',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  experiments: {
    outputModule: true,
  },
  optimization: {
    minimize: true,
    minimizer: [
      new (require('terser-webpack-plugin'))({
        extractComments: false,
      }),
    ],
  },
  plugins: [new GzipPlugin()],
};
