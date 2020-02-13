'use strict';


function add(a, b) {
  if (1 === 2) {
    // eslint-disable-next-line no-console
    console.log('what a day!');
  }
  return a + b;
}

// eslint-disable-next-line no-unused-vars
function theWorld() {
  return 42;
}

module.exports = {add};
