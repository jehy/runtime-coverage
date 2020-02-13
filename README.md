[![Build Status](https://travis-ci.com/jehy/runtime-coverage.svg?branch=master)](https://travis-ci.com/jehy/runtime-coverage) [![npm version](https://badge.fury.io/js/runtime-coverage.svg)](https://badge.fury.io/js/runtime-coverage)
[![dependencies Status](https://david-dm.org/jehy/runtime-coverage/status.svg)](https://david-dm.org/jehy/runtime-coverage)
[![devDependencies Status](https://david-dm.org/jehy/runtime-coverage/dev-status.svg)](https://david-dm.org/jehy/runtime-coverage?type=dev)
[![Known Vulnerabilities](https://snyk.io/test/github/jehy/runtime-coverage/badge.svg)](https://snyk.io/test/github/jehy/runtime-coverage)

# Runtime coverage

Enable coverage after service startup, gather coverage and disable it!

Useful for integration tests and checking for dead code branches.

## Usage

### Install

```bash

npm install runtime-coverage

```

### Start coverage

```js

const runtimeCoverage = require('runtime-coverage');
await runtimeCoverage.startCoverage();

```

### Gather and output coverage

```js

const options = {
  reporters: ['text'],
  return: true,
  all: true,
  exclude: ['**/node_modules/**'],
  };
const res = await runtimeCoverage.getCoverage(options);
console.log(res.text);

```

You can also get coverage in any format of istanbul reporters, for example cobertura.

### Options

Options for getCoverage:

 * `{Object} options` options for getting coverage
 * `{Array} [options.exclude]` exclude those files in coverage, [micromatch](https://github.com/micromatch/micromatch) array, default `**/node_modules/**`
 * `{string} [options.rootDir]` starting directory for files that need coverage info, default `process.env.PWD`
 * `{boolean} [options.all]` include files which were not used in coverage data, default `false`
 * `{boolean} [options.deleteCoverage]` delete coverage directory after output, default `true`
 * `{string} [options.coverageDirectory]` Directory for storing coverage, defaults to temporary directory
 * `{boolean} [options.return]` return coverage data, default `true`
 * `{Array} [options.reporters]` Array of reporters to use, default "text", see all possible [here](https://github.com/istanbuljs/istanbuljs/tree/master/packages/istanbul-reports/lib).

### Beware

You should start colelcting coverage before any calls to node modules being covered are made.
Also, after stopping coverage collection, you should restart the service to make 
