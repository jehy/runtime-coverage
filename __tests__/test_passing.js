'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const runtimeCoverage = require('../src');
const {add} = require('./test-lib/used');

const REWRITE_SNAPSHOTS = false;

function compareSnapshot(testName, res) {
  // eslint-disable-next-line no-console
  console.log(res.text);
  const fileName = path.join(__dirname, `__snapshots__/${testName}.txt`);
  // for development
  if (REWRITE_SNAPSHOTS || !fs.existsSync(fileName)) {
    fs.writeFileSync(fileName, res.text);
  }
  const v8FileName = path.join(__dirname, `__snapshots__/${testName}.v8.json`);
  fs.writeFileSync(v8FileName, JSON.stringify(res.v8, null, 2));
  const expected = fs.readFileSync(fileName, 'utf8');
  assert.equal(res.text, expected);
}

describe('check coverage', ()=>{
  const standardExclude = ['**/index.js', '**/node_modules/**', '**/__tests__/test_*.js', '**/src/**'];

  it('should include non used library when options.all is true', async ()=>{
    await runtimeCoverage.startCoverage();
    // eslint-disable-next-line global-require
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
    // eslint-disable-next-line global-require
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
});
