'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const runtimeCoverage = require('../src');

function requireUnCached(path2) {
  delete require.cache[require.resolve(path2)];
  // eslint-disable-next-line import/no-dynamic-require,global-require
  return require(path2);
}

describe('check coverage', ()=>{
  const standardExclude = ['**/index.js', '**/node_modules/**', '**/__tests__/test_*.js', '**/src/**'];

  it('should include noon used library when options.all is true', async ()=>{
    await runtimeCoverage.startCoverage();
    // eslint-disable-next-line global-require
    const {add} = require('./test-lib/used');
    const testFunctionResult = add(1, 2);
    assert.equal(testFunctionResult, 3);
    const options = {
      reporters: ['text'],
      return: true,
      all: true,
      exclude: standardExclude,
    };
    const res = await runtimeCoverage.getCoverage(options);
    // eslint-disable-next-line no-console
    console.log(res.text);
    // fs.writeFileSync(path.join(__dirname, '__snapshots__/allTrue.txt'), res.text);
    const expected = fs.readFileSync(path.join(__dirname, '__snapshots__/allTrue.txt'), 'utf8');
    assert.equal(res.text, expected);
  });

  it('should not include noon used library when options.all is false', async ()=>{
    await runtimeCoverage.startCoverage();
    const {add} = requireUnCached('./test-lib/used');
    const testFunctionResult = add(1, 2);
    assert.equal(testFunctionResult, 3);
    const options = {
      reporters: ['text'],
      return: true,
      exclude: standardExclude,
    };
    const res = await runtimeCoverage.getCoverage(options);
    // eslint-disable-next-line no-console
    console.log(res.text);
    // fs.writeFileSync(path.join(__dirname, '__snapshots__/allFalse.txt'), res.text);
    const expected = fs.readFileSync(path.join(__dirname, '__snapshots__/allFalse.txt'), 'utf8');
    assert.equal(res.text, expected);
  });

  it('should use rootDir for filtering coverage data', async ()=>{
    await runtimeCoverage.startCoverage();
    const {add} = requireUnCached('./test-lib/used');
    const testFunctionResult = add(1, 2);
    assert.equal(testFunctionResult, 3);
    const options = {
      reporters: ['text'],
      return: true,
      all: true,
      rootDir: path.join(__dirname, 'test-lib'),
    };
    const res = await runtimeCoverage.getCoverage(options);
    // eslint-disable-next-line no-console
    console.log(res.text);
    // fs.writeFileSync(path.join(__dirname, '__snapshots__/rootDir.txt'), res.text);
    const expected = fs.readFileSync(path.join(__dirname, '__snapshots__/rootDir.txt'), 'utf8');
    assert.equal(res.text, expected);
  });

  it('should count lines approximately fine with forceLineMode even if module was already called', async ()=>{
    await runtimeCoverage.startCoverage();
    // eslint-disable-next-line global-require
    const {add} = require('./test-lib/used');
    const testFunctionResult = add(1, 2);
    assert.equal(testFunctionResult, 3);
    const options = {
      reporters: ['text'],
      return: true,
      all: true,
      exclude: standardExclude,
      forceLineMode: true,
    };
    const res = await runtimeCoverage.getCoverage(options);
    // eslint-disable-next-line no-console
    console.log(res.text);
    // fs.writeFileSync(path.join(__dirname, '__snapshots__/forceLineMode.txt'), res.text);
    const expected = fs.readFileSync(path.join(__dirname, '__snapshots__/forceLineMode.txt'), 'utf8');
    assert.equal(res.text, expected);
  });
});
