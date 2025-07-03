// Copyright IBM Corp. 2024. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

/**
 * Migration utilities for converting Mocha tests to native Node.js tests
 * 
 * This module provides utilities to help migrate existing Mocha-based tests
 * to use the native Node.js test runner while maintaining compatibility.
 */

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

/**
 * Chai-compatible expect interface using Node.js assertions
 */
function createExpectInterface() {
  function expect(actual) {
    return {
      to: {
        equal: (expected) => assert.strictEqual(actual, expected),
        deep: {
          equal: (expected) => assert.deepStrictEqual(actual, expected)
        },
        be: {
          null: () => assert.strictEqual(actual, null),
          undefined: () => assert.strictEqual(actual, undefined),
          true: () => assert.strictEqual(actual, true),
          false: () => assert.strictEqual(actual, false),
          an: (type) => {
            if (type === 'error') {
              assert(actual instanceof Error, `Expected an error, got ${typeof actual}`);
            } else if (type === 'array') {
              assert(Array.isArray(actual), `Expected an array, got ${typeof actual}`);
            } else if (type === 'object') {
              assert(typeof actual === 'object' && actual !== null, `Expected an object, got ${typeof actual}`);
            } else {
              assert.strictEqual(typeof actual, type, `Expected type ${type}, got ${typeof actual}`);
            }
          },
          a: function(type) { return this.an(type); },
          ok: () => assert(actual, 'Expected value to be truthy'),
          empty: () => {
            if (Array.isArray(actual)) {
              assert.strictEqual(actual.length, 0, 'Expected array to be empty');
            } else if (typeof actual === 'string') {
              assert.strictEqual(actual.length, 0, 'Expected string to be empty');
            } else if (typeof actual === 'object' && actual !== null) {
              assert.strictEqual(Object.keys(actual).length, 0, 'Expected object to be empty');
            } else {
              assert.fail('Cannot check emptiness of non-array/string/object');
            }
          }
        },
        exist: () => assert(actual != null, 'Expected value to exist'),
        include: (substring) => {
          if (typeof actual === 'string') {
            assert(actual.includes(substring), `Expected "${actual}" to include "${substring}"`);
          } else if (Array.isArray(actual)) {
            assert(actual.includes(substring), `Expected array to include ${substring}`);
          } else {
            throw new Error('include() only works with strings and arrays');
          }
        },
        match: (pattern) => {
          if (typeof actual === 'string') {
            assert(pattern.test(actual), `Expected "${actual}" to match ${pattern}`);
          } else {
            throw new Error('match() only works with strings');
          }
        },
        throw: (pattern) => {
          assert(typeof actual === 'function', 'Expected a function to test for throwing');
          let threw = false;
          let error;
          try {
            actual();
          } catch (e) {
            threw = true;
            error = e;
          }
          assert(threw, 'Expected function to throw');
          if (pattern) {
            if (typeof pattern === 'string') {
              assert(error.message.includes(pattern), `Expected error message to include "${pattern}"`);
            } else if (pattern instanceof RegExp) {
              assert(pattern.test(error.message), `Expected error message to match ${pattern}`);
            }
          }
        }
      },
      not: {
        to: {
          equal: (expected) => assert.notStrictEqual(actual, expected),
          deep: {
            equal: (expected) => assert.notDeepStrictEqual(actual, expected)
          },
          be: {
            null: () => assert.notStrictEqual(actual, null),
            undefined: () => assert.notStrictEqual(actual, undefined),
            empty: () => {
              if (Array.isArray(actual)) {
                assert.notStrictEqual(actual.length, 0, 'Expected array not to be empty');
              } else if (typeof actual === 'string') {
                assert.notStrictEqual(actual.length, 0, 'Expected string not to be empty');
              } else if (typeof actual === 'object' && actual !== null) {
                assert.notStrictEqual(Object.keys(actual).length, 0, 'Expected object not to be empty');
              }
            }
          },
          include: (substring) => {
            if (typeof actual === 'string') {
              assert(!actual.includes(substring), `Expected "${actual}" not to include "${substring}"`);
            } else if (Array.isArray(actual)) {
              assert(!actual.includes(substring), `Expected array not to include ${substring}`);
            }
          }
        }
      }
    };
  }
  
  expect.fail = (message) => assert.fail(message);
  
  return expect;
}

/**
 * Convert a Mocha-style done callback test to async/await
 * @param {Function} testFn - Test function that uses done callback
 * @returns {Function} Async test function
 */
function convertDoneTest(testFn) {
  return function(t) {
    return new Promise((resolve, reject) => {
      const done = (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };
      
      try {
        // Check if test function expects done callback
        if (testFn.length > 0) {
          testFn.call(this, done);
        } else {
          // Synchronous test
          testFn.call(this);
          resolve();
        }
      } catch (error) {
        reject(error);
      }
    });
  };
}

/**
 * Create a test suite that's compatible with both Mocha and Node.js test runner
 * @param {string} name - Suite name
 * @param {Function} suiteFn - Suite function
 * @returns {Function} Compatible test suite
 */
function createCompatibleSuite(name, suiteFn) {
  return describe(name, () => {
    try {
      suiteFn();
    } catch (error) {
      console.error(`Error in test suite "${name}":`, error);
      throw error;
    }
  });
}

/**
 * Create a test that's compatible with both Mocha and Node.js test runner
 * @param {string} name - Test name
 * @param {Function} testFn - Test function
 * @param {Object} options - Test options
 * @returns {Function} Compatible test
 */
function createCompatibleTest(name, testFn, options = {}) {
  const testOptions = {
    timeout: options.timeout || 5000,
    skip: options.skip || false,
    only: options.only || false,
    ...options
  };
  
  return it(name, testOptions, (t) => {
    // Handle different test patterns
    if (testFn.length > 0) {
      // Test expects done callback
      return convertDoneTest(testFn)(t);
    } else {
      // Async or sync test
      const result = testFn.call(this);
      if (result && typeof result.then === 'function') {
        return result;
      }
      return result;
    }
  });
}

/**
 * Migration helper for common Mocha patterns
 */
const migrationHelpers = {
  /**
   * Convert Mocha's this.timeout() to Node.js test options
   * @param {number} ms - Timeout in milliseconds
   * @returns {Object} Test options
   */
  timeout: (ms) => ({ timeout: ms }),
  
  /**
   * Convert Mocha's this.skip() to Node.js test skip
   * @returns {Object} Test options
   */
  skip: () => ({ skip: true }),
  
  /**
   * Convert Mocha's this.only() to Node.js test only
   * @returns {Object} Test options
   */
  only: () => ({ only: true }),
  
  /**
   * Convert Mocha's this.slow() - no-op for Node.js test runner
   * @param {number} ms - Slow threshold (ignored)
   * @returns {Object} Empty options
   */
  slow: (ms) => ({}),
  
  /**
   * Convert Mocha's this.retries() - no-op for Node.js test runner
   * @param {number} count - Retry count (ignored)
   * @returns {Object} Empty options
   */
  retries: (count) => ({})
};

/**
 * Global setup for migrated tests
 */
function setupMigrationEnvironment() {
  // Set up global test environment
  global.expect = createExpectInterface();
  
  // Suppress deprecation warnings during tests
  const originalEmit = process.emit;
  process.emit = function(name, data, ...args) {
    if (name === 'warning' && data.name === 'DeprecationWarning') {
      return false;
    }
    return originalEmit.apply(process, arguments);
  };
  
  // Set test environment
  process.env.NODE_ENV = 'test';
}

/**
 * Cleanup after migrated tests
 */
function cleanupMigrationEnvironment() {
  // Restore original process.emit
  delete global.expect;
}

/**
 * Wrapper for migrating entire test files
 * @param {Function} testFileFn - Function containing the test file content
 * @returns {Function} Migrated test file
 */
function migrateTestFile(testFileFn) {
  return function() {
    setupMigrationEnvironment();
    
    try {
      testFileFn();
    } finally {
      cleanupMigrationEnvironment();
    }
  };
}

/**
 * Helper to create parameterized tests (similar to Mocha's data-driven tests)
 * @param {string} testName - Base test name
 * @param {Array} testCases - Array of test case objects
 * @param {Function} testFn - Test function that receives test case data
 */
function createParameterizedTests(testName, testCases, testFn) {
  testCases.forEach((testCase, index) => {
    const name = testCase.name || `${testName} (case ${index + 1})`;
    it(name, () => testFn(testCase));
  });
}

/**
 * Helper to create async test with timeout
 * @param {string} name - Test name
 * @param {number} timeout - Timeout in milliseconds
 * @param {Function} testFn - Async test function
 */
function createAsyncTest(name, timeout, testFn) {
  return it(name, { timeout }, async (t) => {
    try {
      await testFn(t);
    } catch (error) {
      console.error(`Error in async test "${name}":`, error);
      throw error;
    }
  });
}

module.exports = {
  createExpectInterface,
  convertDoneTest,
  createCompatibleSuite,
  createCompatibleTest,
  migrationHelpers,
  setupMigrationEnvironment,
  cleanupMigrationEnvironment,
  migrateTestFile,
  createParameterizedTests,
  createAsyncTest,
  
  // Re-export Node.js test functions for convenience
  describe,
  it,
  before,
  after,
  beforeEach,
  afterEach,
  assert
};
