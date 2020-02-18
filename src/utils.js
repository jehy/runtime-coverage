'use strict';

const Debug = require('debug');
const micromatch = require('micromatch');
const path = require('path');

const debug = {
  reporters: Debug('runtime-coverage:debug-reporters'),
  emptyCov: Debug('runtime-coverage:empty-coverage'),
  mergeCov: Debug('runtime-coverage:merge-full-coverage'),
  getCov: Debug('runtime-coverage:get-coverage'),
  startCov: Debug('runtime-coverage:get-coverage'),
};

function match(itemPath, excludeArray) {
  // HACK for https://github.com/paulmillr/chokidar/issues/577
  const basename = path.basename(itemPath);
  if (basename[0] === '.') {
    return micromatch.isMatch(itemPath.replace(basename, basename.substr(1)), excludeArray);
  }
  return micromatch.isMatch(itemPath, excludeArray);
}

function shouldCover(fileName, options) {
  return fileName.startsWith(options.rootDir) && fileName.endsWith('.js') && !match(fileName, options.exclude);
}

module.exports = {debug, shouldCover};
