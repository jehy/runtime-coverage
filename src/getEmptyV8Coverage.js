'use strict';

const Module = require('module');
const path = require('path');
const { CoverageInstrumenter } = require('collect-v8-coverage');
const { fileURLToPath } = require('url');

const {debug, shouldCover} = require('./utils');

const infiniteHandler = {
  get(obj, prop) {
    debug.emptyCov(`tried to access prop ${prop}`);
    return this;
  },
};

const infiniteProxy = new Proxy({}, infiniteHandler);

async function getEmptyV8Coverage(files, options) {
  const v8CoverageInstrumenter2 = new CoverageInstrumenter();
  await v8CoverageInstrumenter2.startInstrumenting();
  const originalRequire = Module.prototype.require;

  Module.prototype.require = (filename) => {
    debug.emptyCov(`${path.basename(filename)} Attempted to require: ${filename}`);
    return infiniteProxy;
  };
  files.forEach((file) => {
    const cache = require.cache[require.resolve(file)];
    require.cache[require.resolve(file)] = undefined;
    try {
      const tempModule = originalRequire(file);
      Object.values(tempModule)
        .forEach((someFunc)=>{
          // try to call all module funcs for maximum detailed empty coverage
          try {
            if (typeof someFunc !== 'function') {
              return;
            }
            someFunc();
          } catch (err) {
            debug.emptyCov(`func call failed: ${err}`);
          }
        });
    } catch (err) {
      debug.emptyCov(`Require failed: ${err}`);
    } finally {
      require.cache[require.resolve(file)] = cache;
    }
  });
  Module.prototype.require = originalRequire;
  const coverage = await v8CoverageInstrumenter2.stopInstrumenting();

  return coverage
    .filter(res => res.url.startsWith('file://'))
    .map((res)=>{
      return { ...res, url: fileURLToPath(res.url)};
    })
    .filter(res => res && shouldCover(res.url, options))
    .map((res) => {

      const functions = res.functions.map((func)=>{
        if (func.functionName === '') {
          return func;
        }
        return {
          ...func,
          ranges: func.ranges.map((range)=>{
            return {...range, count: 0};
          }),
        };
      });

      return { ...res, functions};
    });
}

process.on('message', async (message) => {
  try {
    const coverageResult = await getEmptyV8Coverage(message.files, message.options);
    process.send(coverageResult);
  } catch (err) {
    process.send(err);
    process.exit(1);
  }
  process.exit(0);
});
