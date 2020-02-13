'use strict';

const { CoverageInstrumenter } = require('collect-v8-coverage');
const v8ToIstanbul = require('v8-to-istanbul');
const libCoverage = require('istanbul-lib-coverage');
const libReport = require('istanbul-lib-report');
const istanbulReports = require('istanbul-reports');
const { fileURLToPath } = require('url');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Promise = require('bluebird');
const klawSync = require('klaw-sync');
const debug = require('debug')('runtime-coverage');
const semver = require('semver');
const micromatch = require('micromatch');

const {mergeMap} = require('./v8-coverage');

let v8CoverageInstrumenter;

function match(itemPath, excludeArray) {
  // https://github.com/paulmillr/chokidar/issues/577
  const basename = path.basename(itemPath);
  if (basename[0] === '.') {
    return micromatch.isMatch(itemPath.substr(1), excludeArray);
  }
  return micromatch.isMatch(itemPath, excludeArray);
}

function getAllProjectFiles(rootDir, exclude) {
  const filterFn = (item) => {
    const basename = path.basename(item.path);
    return basename[0] !== '.' && item.path.endsWith('.js') && !match(item.path, exclude);
  };
  const files = klawSync(rootDir, {filter: filterFn, traverseAll: true, nodir: true});
  return files.map(file => file.path);
}

function normalizeOptions(options) {
  if (!options) {
    throw new Error('Options not passed!');
  }
  options.exclude = options.exclude || ['**/node_modules/**'];
  options.rootDir = options.rootDir || process.env.PWD;
  options.all = options.all || false;
  options.forceLineMode = options.forceLineMode || false;
  options.deleteCoverage = options.deleteCoverage || options.deleteCoverage === undefined;
  options.coverageDirectory = options.coverageDirectory || fs.mkdtempSync(`${os.tmpdir()}${path.sep}`);
  options.return = options.return || options.return === undefined;
  if (!options.reporters || !options.reporters.length) {
    options.reporters = ['text'];
  }
}

function createEmptyCoverageBlock(file)
{
  const fileSize = fs.lstatSync(file).size;
  return {
    functionName: '',
    ranges: [{
      startOffset: 0,
      endOffset: fileSize,
      count: 0,
    }],
    isBlockCoverage: true,
  };
}
/**
 * @param {Object}options options for getting coverage
 * @param {Array} [options.exclude] exclude those files in coverage,
 * micromatch (https://github.com/micromatch/micromatch) array, default node modules
 * @param {string} [options.rootDir] starting directory for files that need coverage info, default process.env.PWD
 * @param {boolean} [options.all] include files which were not used in coverage data, default false
 * @param {boolean} [options.deleteCoverage] delete coverage directory after output, default true
 * @param {boolean} [options.forceLineMode] force per line coverage, it works with subsequent function calls
 * @param {string} [options.coverageDirectory] Directory for storing coverage, defaults to temporary directory
 * @param {boolean} [options.return] return coverage data
 * @param {Array} [options.reporters] Array of reporters to use, default "text"
 * https://github.com/istanbuljs/istanbuljs/tree/master/packages/istanbul-reports/lib
 *
 */
async function getCoverage(options) {
  debug(`getCoverage called. Options: ${JSON.stringify(options)}`);
  normalizeOptions(options);
  debug(`normalized options: ${JSON.stringify(options)}`);
  if (!v8CoverageInstrumenter) {
    throw new Error('You need to start coverage first!');
  }
  const v8CoverageResult = await v8CoverageInstrumenter.stopInstrumenting();
  debug('stopped instrumenting');
  v8CoverageInstrumenter = null;

  const coverageData = v8CoverageResult
    .filter(res => res.url.startsWith('file://'))
    .map(res => ({ ...res, url: fileURLToPath(res.url) }))
    .filter(
      res => res.url.startsWith(options.rootDir) && !match(res.url, options.exclude),
    );

  // const tmpFind = coverageData.find(el=>el.url === '/web/my/runtime-coverage/__tests__/test-lib/used.js');
  // console.log(JSON.stringify(tmpFind, null, 3));
  const filesHaveCoverage = [];
  const reportsListCovered = await Promise.map(coverageData, async (report) => {
    filesHaveCoverage.push(report.url);
    const converter = v8ToIstanbul(report.url);
    await converter.load(); // this is required due to the async source-map dependency.
    if (options.forceLineMode) {
      const emptyFunction = report.functions.find(func => func.functionName === '');
      if (!emptyFunction) {
        report.functions.unshift(createEmptyCoverageBlock(report.url));
      }
    }
    converter.applyCoverage(report.functions);
    return converter.toIstanbul();
  }, {concurrency: 1});
  let reportsList;
  if (options.all) {
    const emptyReports = getAllProjectFiles(options.rootDir, options.exclude).filter(file => !filesHaveCoverage.includes(file));
    const reportsListEmpty = await Promise.map(emptyReports, async (file) => {
      const converter = v8ToIstanbul(file);
      await converter.load();
      converter.applyCoverage([createEmptyCoverageBlock(file)]); // apply empty coverage
      return converter.toIstanbul();
    }, {concurrency: 1});
    reportsList = reportsListCovered.concat(reportsListEmpty);
  } else {
    reportsList = reportsListCovered;
  }

  const map = mergeMap(libCoverage.createCoverageMap({}), reportsList);

  const context = libReport.createContext({
    dir: options.coverageDirectory,
    coverageMap: map,
  });

  options.reporters.forEach((reporter) => {
    const reportOptions = {};
    if (reporter.includes('text')) {
      reportOptions.file = reporter;
    }
    const report = istanbulReports.create(reporter, reportOptions);
    report.execute(context);
  });
  let res = true;
  if (options.return) {
    const files = fs.readdirSync(options.coverageDirectory).filter(f=>f !== '.' && f !== '..');
    res = files.reduce((data, filename)=>{
      const filePath = path.join(options.coverageDirectory, filename);
      if (fs.lstatSync(filePath).isDirectory()) {
        return data;
      }
      data[filename] = fs.readFileSync(filePath, 'utf8');
      if (filename.includes('cobertura-coverage.xml')) {
        // workaround for https://github.com/istanbuljs/istanbuljs/issues/527
        data[filename] = data[filename].replace(/<computed>/g, '&lt;computed&gt;');
      }
      return data;
    }, {});
  }
  if (options.deleteCoverage) {
    fs.rmdirSync(options.coverageDirectory, { recursive: true });
  }
  return res;
}

async function startCoverage() {
  if (!semver.satisfies(process.version, '>= 10.12.0')) {
    throw new Error(`Node version ${process.version} does not have coverage information!
    Please use node >= 10.12.0 or babel coverage.`);
  }
  if (v8CoverageInstrumenter) {
    debug('v8CoverageInstrumenter already started, restarting it');
    await v8CoverageInstrumenter.stopInstrumenting();
    v8CoverageInstrumenter = null;
  }
  v8CoverageInstrumenter = new CoverageInstrumenter();
  await v8CoverageInstrumenter.startInstrumenting();
  debug('started instrumenting');
  return true;
}


module.exports = {
  startCoverage,
  getCoverage,
};
