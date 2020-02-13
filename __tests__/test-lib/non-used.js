'use strict';

function sub(a, b) {
  if (1 === 2) {
    // eslint-disable-next-line no-console
    console.log('what a day!');
  }
  return a - b;
}

module.exports = {sub};
