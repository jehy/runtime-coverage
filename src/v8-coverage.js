'use strict';

const {CoverageMap} = require('istanbul-lib-coverage/lib/coverage-map');

// Code for merging reports taken from https://github.com/Eywek/v8-coverage

/**
 * Merge previous map with one report data
 * @param {CoverageMap} map
 * @param {Object} reportData
 */
function mergeReportData(map, reportData) {
  Object.keys(reportData.branchMap).forEach((k) => {
    if (!map.data.branchMap[k]) {
      map.data.branchMap[k] = reportData.branchMap[k];
    }
  });
  Object.keys(reportData.fnMap).forEach((k) => {
    if (!map.data.fnMap[k]) {
      map.data.fnMap[k] = reportData.fnMap[k];
    }
  });
  Object.keys(reportData.statementMap).forEach((k) => {
    if (!map.data.statementMap[k]) {
      map.data.statementMap[k] = reportData.statementMap[k];
    }
  });
  Object.keys(reportData.s).forEach((k) => {
    map.data.s[k] += reportData.s[k];
  });
  Object.keys(reportData.f).forEach((k) => {
    map.data.f[k] += reportData.f[k];
  });
  Object.keys(reportData.b).forEach((k) => {
    const retArray = map.data.b[k];
    const secondArray = reportData.b[k];
    if (!retArray) {
      map.data.b[k] = secondArray;
      return;
    }
    for (let i = 0; i < retArray.length; i += 1) {
      retArray[i] += secondArray[i];
    }
  });
}


/**
 * Merge previous map with one report
 * @param {CoverageMap} map
 * @param {Object} report
 */
function mergeReport(map, report) {
  let sourceMap;
  if (report instanceof CoverageMap) {
    sourceMap = report;
  } else {
    sourceMap = new CoverageMap(report);
  }
  Object.keys(sourceMap.data).forEach((k) => {
    const fc = sourceMap.data[k];
    if (map.data[k]) {
      mergeReportData(map.data[k], fc);
    } else {
      map.data[k] = fc;
    }
  });
}
/**
 * Merge previous map with reports
 * @param {CoverageMap} map
 * @param {Array} reports
 */
function mergeMap(map, reports) {
  reports.forEach((report) => {
    mergeReport(map, report);
  });
  return map;
}

module.exports = {mergeMap};
