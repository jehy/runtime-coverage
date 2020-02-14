'use strict';

const fs = require('fs');
const path = require('path');

// eslint-disable-next-line no-unused-vars
function lol() {
  // eslint-disable-next-line no-console
  console.log(null);
}

// eslint-disable-next-line no-console
console.log(fs.readFileSync(path.join(__dirname, 'used.js'), 'utf8').split('\n')[0]);
