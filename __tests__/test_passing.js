'use strict';

const os = require('os');
const assert = require('assert');
const fs = require('fs-extra');
const path = require('path');
const sinon = require('sinon');
const runtimeCoverage = require('../src');
const {add} = require('./test-lib/used');
const fixReport = require('../src/fixReport');

const REWRITE_SNAPSHOTS = false;

function createTempFile(data) {
  const tmpDir = fs.mkdtempSync(`${os.tmpdir()}${path.sep}`);
  const tmpFileName = `${tmpDir}tmp.txt`;
  fs.writeFileSync(tmpFileName, data);
  return {tmpDir, tmpFileName};
}

function compareSnapshot(testName, res) {
  const normalized = res.text.replace(/timestamp=".*"/g, 'timestamp=""').split(process.env.PWD).join('');
  // eslint-disable-next-line no-console
  console.log(normalized);
  const fileName = path.join(__dirname, `__snapshots__/${testName}.txt`);
  // for development
  if (REWRITE_SNAPSHOTS || !fs.existsSync(fileName)) {
    fs.writeFileSync(fileName, normalized);
  }
  const v8FileName = path.join(__dirname, `__snapshots__/${testName}.v8.json`);
  fs.writeFileSync(v8FileName, JSON.stringify(res.v8, null, 2));
  const expected = fs.readFileSync(fileName, 'utf8');
  assert.equal(normalized, expected);
}

describe('check coverage', ()=>{
  const standardExclude = ['**/index.js', '**/node_modules/**', '**/__tests__/test_*.js', '**/src/**'];
  const sandbox = sinon.createSandbox();
  afterEach(() => {
    sandbox.restore();
  });
  it('should include non used library when options.all is true', async ()=>{
    await runtimeCoverage.startCoverage();
    const testFunctionResult = add(1, 2);
    assert.equal(testFunctionResult, 3);
    const options = {
      reporters: ['text', 'v8'],
      return: true,
      all: true,
      exclude: standardExclude,
    };
    const res = await runtimeCoverage.getCoverage(options);
    compareSnapshot('allTrue', res);
  });

  it('sadly fails coverage on subsequent calls...', async () => {
    await runtimeCoverage.startCoverage();
    // eslint-disable-next-line global-require
    const testFunctionResult = add(1, 3);
    assert.equal(testFunctionResult, 4);
    const options = {
      reporters: ['text', 'v8'],
      return: true,
      all: true,
      exclude: standardExclude,
      forceReload: false,
    };
    const res = await runtimeCoverage.getCoverage(options);
    compareSnapshot('FAIL', res);
  });

  it('Does not fail if forceReload', async () => {
    await runtimeCoverage.startCoverage();
    const testFunctionResult = add(1, 3);
    assert.equal(testFunctionResult, 4);
    const options = {
      reporters: ['text', 'v8'],
      return: true,
      all: true,
      exclude: standardExclude,
    };
    const res = await runtimeCoverage.getCoverage(options);
    compareSnapshot('allTrueReloaded', res);
  });

  it('should not include non used library when options.all is false', async ()=>{
    await runtimeCoverage.startCoverage();
    const testFunctionResult = add(3, 2);
    assert.equal(testFunctionResult, 5);
    const options = {
      reporters: ['text', 'v8'],
      return: true,
      exclude: standardExclude,
      forceReload: true,
    };
    const res = await runtimeCoverage.getCoverage(options);
    compareSnapshot('allFalse', res);
  });

  it('should use rootDir for filtering coverage data', async ()=>{
    await runtimeCoverage.startCoverage();
    const testFunctionResult = add(1, 2);
    assert.equal(testFunctionResult, 3);
    const options = {
      reporters: ['text', 'v8'],
      return: true,
      all: true,
      rootDir: path.join(__dirname, 'test-lib'),
    };
    const res = await runtimeCoverage.getCoverage(options);
    compareSnapshot('rootDir', res);
  });

  it('should count lines approximately fine with forceLineMode even if module was already called', async ()=>{
    await runtimeCoverage.startCoverage();
    const testFunctionResult = add(1, 2);
    assert.equal(testFunctionResult, 3);
    const options = {
      reporters: ['text', 'v8'],
      return: true,
      all: true,
      exclude: standardExclude,
      forceLineMode: true,
      forceReload: false,
    };
    const res = await runtimeCoverage.getCoverage(options);
    compareSnapshot('forceLineMode', res);
  });

  it('should work even if file with calls is covered', async ()=>{
    await runtimeCoverage.startCoverage();
    // eslint-disable-next-line global-require
    require('./test-lib/complex');
    const options = {
      reporters: ['text', 'v8'],
      return: true,
      exclude: standardExclude,
    };
    const res = await runtimeCoverage.getCoverage(options);
    compareSnapshot('complex', res);
  });

  it('should work with cobertura, fix it, give a stream and self destroy extra stream', async ()=>{
    const spy = sandbox.spy(fixReport, 'fixCoberturaReport');
    await runtimeCoverage.startCoverage();
    const options = {
      reporters: ['cobertura', 'json'],
      return: true,
      stream: true,
      streamTimeout: 2 * 1000,
      exclude: standardExclude,
    };
    const testFunctionResult = add(1, 2);
    assert.equal(testFunctionResult, 3);
    const res = await runtimeCoverage.getCoverage(options);
    const data = [];
    const stream = res.cobertura;
    stream.on('data', chunk => data.push(chunk));
    await new Promise((resolve, reject)=>{
      stream.on('end', () => resolve());
      stream.on('error', err => reject(err));
    });
    assert(spy.called);
    compareSnapshot('stream', {text: data.join(), v8: res.v8});
  });

  it('should really fix cobertura report', async ()=>{
    const dataToFix = '<some tag>some data</some tag><computed>lalala</computed>';
    const {tmpDir, tmpFileName} = createTempFile(dataToFix);
    await fixReport.fixCoberturaReport(tmpFileName);
    const newData = await fs.readFile(tmpFileName);
    await fs.remove(tmpDir);
    assert.equal(newData, '<some tag>some data</some tag>&lt;computed&gt;lalala</computed>');
  });
});
