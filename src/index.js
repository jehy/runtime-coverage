'use strict';

const { CoverageInstrumenter } = require('collect-v8-coverage');
const v8ToIstanbul = require('v8-to-istanbul');
const libCoverage = require('istanbul-lib-coverage');
const libReport = require('istanbul-lib-report');
const istanbulReports = require('istanbul-reports');
const { fileURLToPath } = require('url');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { fork } = require('child_process');
const Promise = require('bluebird');
const klawSync = require('klaw-sync');
const semver = require('semver');

const {mergeMap} = require('./v8-coverage');
const {debug, shouldCover} = require('./utils');
const fixReport = require('./fixReport');

let v8CoverageInstrumenter;

async function getEmptyV8Coverage(files, options) {
  const getEmptyV8CoverageProcess = fork(path.join(__dirname, 'getEmptyV8Coverage'), [], {env: {}, execArgv: []});
  getEmptyV8CoverageProcess.send({ files, options });
  let replyReceived = false;
  try {
    // we need to await here, otherwise finally won't work
    // eslint-disable-next-line sonarjs/prefer-immediate-return
    const result = await new Promise((resolve, reject) => {
      getEmptyV8CoverageProcess
        .on('message', (message) => {
          replyReceived = true;
          if (message instanceof Error) {
            reject(message);
            return;
          }
          resolve(message);
        })
        .on('error', err => reject(err))
        .on('exit', (code, signal) => reject(new Error(`process closed before data was sent! code: ${code} signal: ${signal}`)));
    });
    return result;
  }  finally {
    if (!replyReceived) {
      debug.emptyCov('Reply not received, killing empty coverage process');
      getEmptyV8CoverageProcess.kill('SIGTERM');
    }
  }
}


function getAllProjectFiles(options) {
  const filterFunc = file=>shouldCover(file.path, options);
  const files = klawSync(options.rootDir, {filter: filterFunc, traverseAll: true, nodir: true});
  return files.map(file => file.path);
}

function normalizeOptions(options) {
  if (!options) {
    throw new Error('Options not passed!');
  }
  options.exclude = options.exclude || ['**/node_modules/**'];
  options.rootDir = path.normalize(options.rootDir || process.env.PWD);
  options.all = options.all || false;
  options.forceLineMode = options.forceLineMode || false;
  options.streamTimeout = options.streamTimeout || 60 * 1000;
  options.deleteCoverage = options.deleteCoverage || options.deleteCoverage === undefined;
  options.coverageDirectory = path.normalize(options.coverageDirectory || fs.mkdtempSync(`${os.tmpdir()}${path.sep}`));
  options.return = options.return || options.return === undefined;
  options.forceReload = options.forceReload || options.forceReload === undefined;
  if (!options.reporters || !options.reporters.length) {
    options.reporters = ['text'];
  }
  if (options.coverageDirectory === options.rootDir) {
    throw new Error(`Coverage directory ${options.coverageDirectory} should be different from project directory!`);
  }
  if (options.coverageDirectory.split(path.sep).length < 3) {
    throw new Error(`Suspicious coverage dir ${options.coverageDirectory}`);
  }
}

function createEmptyCoverageBlock(file) {
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

async function runReporters(options, map, coverageData) {
  const context = libReport.createContext({
    dir: options.coverageDirectory,
    coverageMap: map,
  });

  options.reporters.forEach((reporter) => {
    if (reporter === 'v8') {
      return;// we will deal with it later
    }
    const reportOptions = {
      file: reporter,
    };
    const report = istanbulReports.create(reporter, reportOptions);
    report.execute(context);
  });
  let res = true;
  const allStreamsClosed = [];
  if (options.return) {
    const files = fs.readdirSync(options.coverageDirectory).filter(f=>f !== '.' && f !== '..');
    res = await Promise.reduce(files,  async (data, filename)=>{
      const filePath = path.join(options.coverageDirectory, filename);
      if (fs.lstatSync(filePath).isDirectory()) {
        // ignore dirs
        return data;
      }
      debug.reporters(`got filename ${filename}`);
      if (filename.includes('cobertura')) {
        await fixReport.fixCoberturaReport(filePath);
        debug.reporters(`fixed cobertura file ${filename}`);
        // data[filename] = data[filename].replace(/<computed>/g, '&lt;computed&gt;');
      }
      if (options.stream) {
        const stream = fs.createReadStream(filePath, {encoding: 'utf8', emitClose: true});
        data[filename] = stream;
        const streamClosed = new Promise((resolve, reject)=>{
          stream.once('error', err=>reject(err));
          stream.once('close', ()=>resolve());
        });
        allStreamsClosed.push(streamClosed);
        streamClosed.timeout(options.streamTimeout).catch(Promise.TimeoutError, ()=>{
          debug.reporters(`No one uses stream ${filePath}, destroying it...`);
          stream.destroy();
        }).catch((err)=>{
          debug.reporters('failed to destroy stream', err);
        });
      } else {
        data[filename] = await fs.readFile(filePath, 'utf8');
      }
      return data;
    }, {});
  }
  if (options.deleteCoverage) {
    Promise.all(allStreamsClosed).catch((err)=>{
      debug.reporters('Failed read coverage data in stream', err);
    }).finally(async ()=>{
      try {
        await fs.remove(options.coverageDirectory);
        debug.reporters('coverage directory removed');
      } catch (err) {
        debug.reporters('Failed to remove coverage directory', err);
      }
    });
  }
  if (options.reporters.includes('v8')) {
    // for debug only, don't bother with a stream, either way it's already in memory
    res.v8 = coverageData;
  }
  return res;
}

function MergeFullCoverage(coverageData, emptyCoverage) {
  coverageData.forEach((report)=>{
    const emptyReport = emptyCoverage.find((rep)=>{
      return rep.url === report.url;
    });
    if (!emptyReport) {
      debug.mergeCov(`No empty report for ${report.url}, smth went wrong?`);
      return;
    }
    Object.values(emptyReport.functions).forEach((missingFunc)=>{
      const coveredFunc = report.functions.find(el=>el.functionName === missingFunc.functionName);
      if (!coveredFunc) {
        debug.mergeCov(`Adding func "${missingFunc.functionName}"`);
        if (missingFunc.functionName === '') {
          report.functions.unshift(missingFunc);
        } else {
          report.functions.push(missingFunc);
        }
      }  else {
        debug.mergeCov(`checking ranges for adding func "${missingFunc.functionName}":`);
        debug.mergeCov(`missing: ${JSON.stringify(missingFunc.ranges)}`);
        debug.mergeCov(`existing func ranges: ${JSON.stringify(coveredFunc.ranges)}`);
        // check missing ranges
        const coveredRanges = Object.values(coveredFunc.ranges).map(el=>`${el.startOffset}-${el.endOffset}`);
        Object.values(missingFunc.ranges).forEach((range)=>{
          debug.mergeCov(`checking if range hash ${Object.values(range).join('-')} is in ${JSON.stringify(coveredRanges)}`);
          if (!coveredRanges.includes(`${range.startOffset}-${range.endOffset}`)) {
            coveredFunc.ranges.push(range);
            debug.mergeCov(`Pushed range ${range.startOffset}-${range.endOffset}`);
          }
        });
      }
    });
  });
}


/**
 * @param {Object}options options for getting coverage
 * @param {Array} [options.exclude] exclude those files in coverage,
 * micromatch (https://github.com/micromatch/micromatch) array, default node modules
 * @param {string} [options.rootDir] starting directory for files that need coverage info, default process.env.PWD
 * @param {boolean} [options.all] include files which were not used in coverage data, default false
 * @param {boolean} [options.deleteCoverage] delete coverage directory after output, default true
 * @param {boolean} [options.forceLineMode] force per line coverage, it works with subsequent function calls
 * @param {boolean} [options.forceReload] reload modules to get full coverage data
 * @param {string} [options.coverageDirectory] Directory for storing coverage, defaults to temporary directory
 * @param {boolean} [options.return] return coverage data
 * @param {boolean} [options.stream] return coverage data as streams
 * @param {boolean} [options.streamTimeout] destroy stream if not used during timeout
 * @param {Array} [options.reporters] Array of reporters to use, default "text"
 * https://github.com/istanbuljs/istanbuljs/tree/master/packages/istanbul-reports/lib
 *
 */
async function getCoverage(options) {
  debug.getCov(`getCoverage called. Options: ${JSON.stringify(options)}`);
  normalizeOptions(options);
  debug.getCov(`normalized options: ${JSON.stringify(options)}`);
  if (!v8CoverageInstrumenter) {
    throw new Error('You need to start coverage first!');
  }
  const v8CoverageResult = await v8CoverageInstrumenter.stopInstrumenting();
  debug.getCov('stopped instrumenting');
  v8CoverageInstrumenter = null;

  const coverageData = v8CoverageResult
    .filter(res => res.url.startsWith('file://'))
    .map(res => ({ ...res, url: fileURLToPath(res.url) }))
    .filter(res => shouldCover(res.url, options));
  v8CoverageResult.length = 0; // we don't need it any more

  const coveredFiles = coverageData.map(data=>data.url);
  if (options.forceReload) {
    // get empty coverage data for merging later
    const emptyCoverage = await getEmptyV8Coverage(coveredFiles, options);
    MergeFullCoverage(coverageData, emptyCoverage);
  }
  // process actual coverage together with empty from prev step(if options.forceReload)
  const reportsListCovered = await Promise.map(coverageData, async (report) => {
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
  if (!options.reporters.includes('v8')) {
    // drop it, not needed any more
    coverageData.length = 0;
  }
  let reportsList;
  // generate dummy empty coverage for non required files
  if (options.all) {
    const emptyReports = getAllProjectFiles(options)
      .filter(file => !coveredFiles.includes(file));
    const reportsListEmpty = await Promise.map(emptyReports, async (file) => {
      const converter = v8ToIstanbul(file);
      try {
        // Since some packages are build and their source is removed, they
        // can leave unsatisfied dependants. So just ignore it.
        await converter.load();
      } catch (err) {
        debug.getCov('Error on converter.load() for all files', JSON.stringify(err));
        return false;
      }
      converter.applyCoverage([createEmptyCoverageBlock(file)]); // apply empty coverage
      return converter.toIstanbul();
    }, {concurrency: 1});
    reportsList = reportsListCovered.concat(reportsListEmpty.filter(Boolean));
  } else {
    reportsList = reportsListCovered;
  }

  const map = mergeMap(libCoverage.createCoverageMap({}), reportsList);
  // we don't need them any more. V8 should clean it up either way, but just to be sure...
  reportsListCovered.length = 0;
  reportsList.length = 0;
  return runReporters(options, map, coverageData);
}


async function startCoverage() {
  if (!semver.satisfies(process.version, '>= 10.12.0')) {
    throw new Error(`Node version ${process.version} does not have coverage information!
    Please use node >= 10.12.0 or babel coverage.`);
  }
  if (v8CoverageInstrumenter) {
    debug.startCov('v8CoverageInstrumenter already started, restarting it');
    await v8CoverageInstrumenter.stopInstrumenting();
    v8CoverageInstrumenter = null;
  }
  v8CoverageInstrumenter = new CoverageInstrumenter();
  await v8CoverageInstrumenter.startInstrumenting();
  debug.startCov('started instrumenting');
  return true;
}


module.exports = {
  startCoverage,
  getCoverage,
};
