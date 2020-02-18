'use strict';

const { spawn } = require('child_process');
const Promise = require('bluebird');

async function fixCoberturaReport(fileName) {
  // workaround for https://github.com/istanbuljs/istanbuljs/issues/527
  // sed -i 's/<computed>/\&lt;computed\&gt;/g' ./cobertura-coverage.xml
  return new Promise((resolve, reject) => {
    const stdout = [];
    const stderr = [];
    // eslint-disable-next-line no-useless-escape
    const ps = spawn('sed', ['-i', 's/<computed>/\\&lt;computed\\&gt;/g', fileName], {});
    ps.stdout.on('data', (newData) => {
      stdout.push(newData);
    });

    ps.stderr.on('data', (newData) => {
      stderr.push(newData);
    });

    // eslint-disable-next-line no-unused-vars
    ps.on('close', (code) => {
      const data = { stderr: stderr.join('\n'), stdout: stdout.join('\n'), code};
      if (code === 0) {
        resolve(data);
        return;
      }
      reject(data);
    });
  });
}

module.exports = {fixCoberturaReport};
