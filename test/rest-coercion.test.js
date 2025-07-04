// Copyright IBM Corp. 2016,2017. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

// Native Node.js test imports
const path = require('node:path');
const fs = require('node:fs');
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const qs = require('qs');

const debug = require('debug')('test');
const request = require('./helpers/native-http-test'); // Native HTTP testing

const RemoteObjects = require('..');

// Helper functions
function prettyExpectation(expectedValue) {
  if (expectedValue instanceof Error)
    return 'HTTP error ' + expectedValue.message;
  if (Array.isArray(expectedValue))
    return '[' + expectedValue.map(prettyExpectation).join(', ') + ']';
  if (expectedValue instanceof Date)
    return isNaN(expectedValue.valueOf()) ?
      '<Invalid Date>' : '<Date: ' + expectedValue.toJSON() + '>';
  return JSON.stringify(expectedValue);
}

function verifyResultOnResponse(err, res, actualValue, expectedResult, done) {
  if (err && !res) return done(err);
  let actual = res.statusCode === 200 ?
    {value: actualValue} :
    {error: res.statusCode};

  const actualCtor = actual.value && typeof actual.value === 'object' &&
      actual.value.constructor;
  if (actualCtor && actualCtor !== Object && actualCtor.name) {
    actual = {};
    actual[actualCtor.name] = actualValue;
  }

  let expected = expectedResult instanceof Error ?
    {error: +expectedResult.message} :
    {value: expectedResult};

  const expectedCtor = expected.value && typeof expected.value === 'object' &&
      expected.value.constructor;
  if (expectedCtor && expectedCtor !== Object && expectedCtor.name) {
    expected = {};
    expected[expectedCtor.name] = expectedResult;
  }

  const suiteName = ctx.runtime.currentSuiteName;
  const input = ctx.runtime.currentInput;
  if (suiteName && input) {
    const reportData = ctx.runtime._reportData;
    if (!reportData[suiteName])
      reportData[suiteName] = {};
    if (input in reportData[suiteName])
      return done(new Error('DUPLICATE TEST CASE: ' + input));
    reportData[suiteName][input] = actual;
  }

  assert.deepStrictEqual(actual, expected);
  done();
}

// Global context for all test suites
const ctx = {
  remoteObjects: null,
  request: null,
  ERROR_BAD_REQUEST: new Error(400),
  prettyExpectation: prettyExpectation,
  verifyResultOnResponse: verifyResultOnResponse,
  runtime: {
    _reportData: {},
    currentSuiteName: null,
    currentInput: null,
  },
};

// Load all test suite files at the top level
function loadAllTestSuites() {
  console.log('Loading test files...');

  // Save original globals
  const originalDescribe = global.describe;
  const originalIt = global.it;
  const originalBeforeEach = global.beforeEach;
  const originalAfterEach = global.afterEach;

  // Make test functions available globally for suite files
  global.describe = describe;
  global.it = require('node:test').it;
  global.beforeEach = beforeEach;
  global.afterEach = afterEach;

  try {
    const testRoot = path.resolve(__dirname, 'rest-coercion');
    let testFiles = fs.readdirSync(testRoot);
    testFiles = testFiles.filter(function(it) {
      return /\.suite\.js$/.test(it) &&
        !!require.extensions[path.extname(it).toLowerCase()];
    });

    console.log('Found test files:', testFiles.length);
    for (const ix in testFiles) {
      const name = testFiles[ix];
      const fullPath = path.resolve(testRoot, name);
      console.log('Loading test suite %s (%s)', name, fullPath);
      debug('Loading test suite %s (%s)', name, fullPath);
      require(fullPath)(ctx);
    }
    console.log('Test files loaded');
  } finally {
    // Restore original globals
    global.describe = originalDescribe;
    global.it = originalIt;
    global.beforeEach = originalBeforeEach;
    global.afterEach = originalAfterEach;
  }
}

describe('Coercion in RestAdapter', function() {
  before(async function() {
    await setupRemoteServer();
    setupRemoteObjects();
  });
  beforeEach(setupRemoteObjects);
  afterEach(cleanupRemoteObjects);
  after(stopRemoteServer);
  after(writeReport);

  // Simple test to verify basic coercion functionality
  it('should handle basic string coercion', async function() {
    // Define a simple test class
    function TestClass() {}
    TestClass.testMethod = function(arg, callback) {
      callback(null, arg);
    };

    // Create SharedClass and define method
    const SharedClass = require('../lib/shared-class');
    const testClass = new SharedClass('TestClass', TestClass);
    testClass.defineMethod('testMethod', {
      isStatic: true,
      accepts: {arg: 'arg', type: 'string'},
      returns: {arg: 'result', type: 'string'},
      http: {path: '/test', verb: 'get'}
    });

    // Add the class to remoteObjects
    ctx.remoteObjects.addClass(testClass);

    // Test the coercion
    const response = await new Promise((resolve, reject) => {
      ctx.request.get('/TestClass/test?arg=hello')
        .expect(200)
        .end((err, res) => {
          if (err) reject(err);
          else resolve(res);
        });
    });

    assert.deepStrictEqual(response.body, {result: 'hello'});
  });

  /** *** IMPLEMENTATION DETAILS *****/

  let server; // eslint-disable-line one-var
  async function setupRemoteServer() {
    console.log('Setting up remote server...');
    const app = express();

    // Configure Express to use qs for query string parsing to support nested parameters
    app.set('query parser', (str) => qs.parse(str, { allowDots: false }));

    app.use(function(req, res, next) {
      // create the handler for each request
      ctx.remoteObjects.handler('rest').apply(ctx.remoteObjects, arguments);
    });

    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', function() {
        console.log('Server started on port:', this.address().port);
        ctx.request = request('http://127.0.0.1:' + this.address().port);
        resolve();
      });
      server.on('error', reject);
    });
  }

  async function stopRemoteServer() {
    console.log('Stopping remote server...');
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            console.error('Error closing rest-coercion server:', err);
            reject(err);
          } else {
            console.log('Server closed successfully');
            resolve();
          }
        });
      });

      // Force close any remaining connections
      if (server.closeAllConnections) {
        server.closeAllConnections();
      }

      server = null;
    }

    console.log('Server cleanup completed');
  }

  function setupRemoteObjects() {
    // Clean up any existing RemoteObjects
    if (ctx.remoteObjects && ctx.remoteObjects.disconnect) {
      ctx.remoteObjects.disconnect();
    }

    ctx.remoteObjects = RemoteObjects.create({
      errorHandler: {debug: true, log: false},
    });
  }

  async function cleanupRemoteObjects() {
    if (ctx.remoteObjects) {
      // Clear auth to prevent state leakage
      ctx.remoteObjects.auth = null;

      // Properly disconnect and clean up HTTP connections
      if (ctx.remoteObjects.disconnect) {
        ctx.remoteObjects.disconnect();
      }

      // Force cleanup of any remaining HTTP connections
      if (ctx.remoteObjects._adapter && ctx.remoteObjects._adapter.client) {
        const client = ctx.remoteObjects._adapter.client;
        if (client.destroy) {
          client.destroy();
        }
      }
    }
  }





  function writeReport() {
    const rows = [];
    const reportData = ctx.runtime._reportData;
    for (const sn in reportData) { // eslint-disable-line one-var
      const suite = reportData[sn];
      for (const tc in suite) { // eslint-disable-line one-var
        let result = suite[tc];
        result = result.error ?
          '<HTTP Error ' + result.error + '>' :
          stringify(result.value);
        rows.push([sn, tc, result].join('\t'));
      }
    }

    const report = rows.join('\n') + '\n';
    const filePath = path.resolve(__dirname, 'rest-coercion/report.csv');
    fs.writeFileSync(filePath, report);

    function stringify(value) {
      if (Array.isArray(value))
        return '[' + value.map(stringify).join(', ') + ']';
      if (value instanceof Date)
        return isNaN(value.valueOf()) ?
          '<Invalid Date>' : '<Date: ' + value.toJSON() + '>';
      if (value === undefined)
        return '<undefined>';
      return JSON.stringify(value);
    }
  }
});
