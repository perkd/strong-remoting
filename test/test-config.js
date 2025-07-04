// Copyright IBM Corp. 2024. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

/**
 * Test configuration for native Node.js testing
 *
 * This module provides minimal utilities for native Node.js testing.
 * All assertions should use the native assert module directly.
 */

const { test, describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

/**
 * Chai-compatible expect interface using native Node.js assertions
 * This provides backward compatibility for tests migrating from chai
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
          true: () => assert.strictEqual(actual, true),
          false: () => assert.strictEqual(actual, false),
          null: () => assert.strictEqual(actual, null),
          undefined: () => assert.strictEqual(actual, undefined),
          instanceOf: (type) => assert(actual instanceof type, `Expected ${actual} to be instance of ${type.name}`),
          an: Object.assign((type) => {
            if (type === 'array') {
              assert(Array.isArray(actual), `Expected ${actual} to be an array`);
            } else if (type === 'error') {
              assert(actual instanceof Error, `Expected ${actual} to be an error`);
            } else {
              assert.strictEqual(typeof actual, type, `Expected ${actual} to be of type ${type}`);
            }
          }, {
            instanceOf: (constructor) => {
              assert(actual instanceof constructor, `Expected ${actual} to be an instance of ${constructor.name}`);
            }
          }),
          a: (type) => {
            if (type === 'array') {
              assert(Array.isArray(actual), `Expected ${actual} to be an array`);
            } else if (type === 'error') {
              assert(actual instanceof Error, `Expected ${actual} to be an error`);
            } else if (type === 'promise') {
              assert(actual instanceof Promise, `Expected ${actual} to be a Promise`);
            } else {
              assert.strictEqual(typeof actual, type, `Expected ${actual} to be of type ${type}`);
            }
          },
          ok: () => assert(actual, `Expected ${actual} to be truthy`),
          empty: () => {
            if (Array.isArray(actual)) {
              assert.strictEqual(actual.length, 0, 'Expected array to be empty');
            } else if (typeof actual === 'object' && actual !== null) {
              assert.strictEqual(Object.keys(actual).length, 0, 'Expected object to be empty');
            } else {
              assert.strictEqual(actual, '', 'Expected value to be empty');
            }
          }
        },
        have: {
          property: (prop, value) => {
            assert(actual.hasOwnProperty(prop), `Expected ${actual} to have property ${prop}`);
            if (value !== undefined) {
              assert.strictEqual(actual[prop], value, `Expected ${prop} to equal ${value}`);
            }
            return {
              eql: (expected) => assert.deepStrictEqual(actual[prop], expected),
              that: {
                equals: (expected) => assert.strictEqual(actual[prop], expected)
              }
            };
          },
          nested: {
            property: (path, value) => {
              // Handle nested property access like 'routes[0].path'
              const keys = path.split(/[\.\[\]]+/).filter(k => k);
              let current = actual;
              for (const key of keys) {
                assert(current != null, `Expected ${path} to exist`);
                current = current[key];
              }
              if (value !== undefined) {
                assert.strictEqual(current, value, `Expected ${path} to equal ${value}`);
              }
            }
          },
          length: (expected) => {
            if (Array.isArray(actual) || typeof actual === 'string') {
              assert.strictEqual(actual.length, expected, `Expected length to be ${expected}`);
            } else {
              assert.strictEqual(Object.keys(actual).length, expected, `Expected object to have ${expected} properties`);
            }
          }
        },
        eql: (expected) => assert.deepStrictEqual(actual, expected),
        not: {
          equal: (expected) => assert.notStrictEqual(actual, expected),
          eql: (expected) => assert.notDeepStrictEqual(actual, expected),
          throw: () => {
            try {
              if (typeof actual === 'function') {
                actual();
              }
              // If no error is thrown, the test passes
            } catch (error) {
              assert.fail(`Expected function not to throw, but it threw: ${error.message}`);
            }
          },
          be: {
            null: () => assert.notStrictEqual(actual, null),
            undefined: () => assert.notStrictEqual(actual, undefined),
            empty: () => {
              if (Array.isArray(actual)) {
                assert.notStrictEqual(actual.length, 0, 'Expected array not to be empty');
              } else if (typeof actual === 'object' && actual !== null) {
                assert.notStrictEqual(Object.keys(actual).length, 0, 'Expected object not to be empty');
              } else {
                assert.notStrictEqual(actual, '', 'Expected value not to be empty');
              }
            }
          },
          exist: () => assert.strictEqual(actual, null, 'Expected value not to exist'),
          have: {
            property: (prop) => assert(!actual.hasOwnProperty(prop), `Expected ${actual} not to have property ${prop}`)
          }
        },
        exist: () => assert.notStrictEqual(actual, null, 'Expected value to exist'),
        match: (regex) => assert(regex.test(actual), `Expected ${actual} to match ${regex}`),
        include: (value) => {
          if (Array.isArray(actual)) {
            assert(actual.includes(value), `Expected array to include ${value}`);
          } else if (typeof actual === 'string') {
            assert(actual.includes(value), `Expected string to include ${value}`);
          } else {
            assert(actual.hasOwnProperty(value), `Expected object to include property ${value}`);
          }
        }
      }
    };
  }
  return expect;
}

// Re-export native Node.js test functions and assert
module.exports = {
  test,
  describe,
  it,
  before,
  after,
  beforeEach,
  afterEach,
  assert,
  expect: createExpectInterface(),
};

// Global test setup
before(async () => {
  console.log('🧪 Starting test suite...');
  process.env.NODE_ENV = 'test';

  // Set up global timeout for hanging tests
  process.env.NODE_TEST_TIMEOUT = '30000'; // 30 seconds per test
});

after(async () => {
  console.log('✅ Test suite completed');

  // Force cleanup of any remaining handles
  await new Promise(resolve => setTimeout(resolve, 100));

  // Log any remaining handles that might prevent exit
  if (process._getActiveHandles && process._getActiveHandles().length > 0) {
    console.warn('⚠️  Warning: Active handles remaining:', process._getActiveHandles().length);
  }

  if (process._getActiveRequests && process._getActiveRequests().length > 0) {
    console.warn('⚠️  Warning: Active requests remaining:', process._getActiveRequests().length);
  }
});
