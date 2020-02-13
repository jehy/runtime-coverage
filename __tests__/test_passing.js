'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function requireUnCached(path2) {
  delete require.cache[require.resolve(path2)];
  // eslint-disable-next-line import/no-dynamic-require,global-require
  return require(path2);
}

describe('check coverage', ()=>{
  it('should include noon used library when options.all is true', async ()=>{
    const runtimeCoverage = requireUnCached('../index');
    await runtimeCoverage.startCoverage();
    // eslint-disable-next-line global-require
    const {add} = require('./test-lib/used');
    const testFunctionResult = add(1, 2);
    assert.equal(testFunctionResult, 3);
    const options = {
      reporters: ['text'],
      return: true,
      all: true,
      exclude: ['**/index.js', '**/node_modules/**', '**/__tests__/test_*.js'],
    };
    const res = await runtimeCoverage.getCoverage(options);
    // eslint-disable-next-line no-console
    console.log(res.text);
    // fs.writeFileSync(path.join(__dirname, '__snapshots__/allTrue.txt'), res.text);
    const expected = fs.readFileSync(path.join(__dirname, '__snapshots__/allTrue.txt'), 'utf8');
    assert.equal(res.text, expected);
  });

  it('should not include noon used library when options.all is false', async ()=>{
    const runtimeCoverage = requireUnCached('../index');
    await runtimeCoverage.startCoverage();
    const {add} = requireUnCached('./test-lib/used');
    const testFunctionResult = add(1, 2);
    assert.equal(testFunctionResult, 3);
    const options = {
      reporters: ['text'],
      return: true,
      exclude: ['**/index.js', '**/node_modules/**', '**/__tests__/test_*.js'],
    };
    const res = await runtimeCoverage.getCoverage(options);
    // eslint-disable-next-line no-console
    console.log(res.text);
    // fs.writeFileSync(path.join(__dirname, '__snapshots__/allFalse.txt'), res.text);
    const expected = fs.readFileSync(path.join(__dirname, '__snapshots__/allFalse.txt'), 'utf8');
    assert.equal(res.text, expected);
  });

  it('should use rootDir for filtering coverage data', async ()=>{
    const runtimeCoverage = requireUnCached('../index');
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
});
