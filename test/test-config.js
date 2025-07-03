// Copyright IBM Corp. 2024. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

/**
 * Test configuration and utilities for native Node.js testing
 * 
 * This module provides compatibility utilities to migrate from Mocha to native Node.js testing
 * while maintaining the same test structure and assertions.
 */

const { test, describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

// Re-export native Node.js test functions for compatibility
module.exports = {
  test,
  describe,
  it,
  before,
  after,
  beforeEach,
  afterEach,
  assert,
  
  // Mocha-style timeout support
  timeout: function(ms) {
    // Node.js test runner uses AbortSignal for timeouts
    // This is a compatibility helper
    return { timeout: ms };
  },
  
  // Enhanced assertion helpers
  expect: createExpectInterface(),
  
  // Test utilities
  createTestSuite,
  runAsyncTest,
  createMockContext,
};

/**
 * Create a Chai-compatible expect interface using Node.js assertions
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
            } else {
              assert.strictEqual(typeof actual, type);
            }
          },
          a: function(type) { return this.an(type); }
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
        }
      },
      not: {
        to: {
          equal: (expected) => assert.notStrictEqual(actual, expected),
          be: {
            null: () => assert.notStrictEqual(actual, null),
            undefined: () => assert.notStrictEqual(actual, undefined)
          }
        }
      }
    };
  }
  
  expect.fail = (message) => assert.fail(message);
  
  return expect;
}

/**
 * Create a test suite with enhanced error handling and async support
 */
function createTestSuite(name, testFn) {
  return describe(name, () => {
    try {
      testFn();
    } catch (error) {
      console.error(`Error in test suite "${name}":`, error);
      throw error;
    }
  });
}

/**
 * Run an async test with proper error handling
 */
function runAsyncTest(name, testFn, options = {}) {
  const testOptions = {
    timeout: options.timeout || 5000,
    ...options
  };
  
  return it(name, testOptions, async (t) => {
    try {
      await testFn(t);
    } catch (error) {
      console.error(`Error in test "${name}":`, error);
      throw error;
    }
  });
}

/**
 * Create a mock context for testing
 */
function createMockContext(overrides = {}) {
  return {
    method: { name: 'testMethod' },
    args: [],
    result: null,
    error: null,
    ...overrides
  };
}

/**
 * Compatibility layer for done-style callbacks in async tests
 */
function withDoneCallback(testFn) {
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
        testFn.call(this, done);
      } catch (error) {
        reject(error);
      }
    });
  };
}

// Export done callback helper
module.exports.withDoneCallback = withDoneCallback;

/**
 * Enhanced test runner configuration
 */
const testConfig = {
  // Default timeout for all tests
  timeout: 5000,
  
  // Test patterns
  testPattern: '**/*.test.js',
  
  // Coverage configuration
  coverage: {
    enabled: true,
    reporter: ['text', 'html'],
    threshold: {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80
    }
  },
  
  // Test environment setup
  setup: {
    // Global test setup
    beforeAll: [],
    afterAll: [],
    
    // Per-test setup
    beforeEach: [],
    afterEach: []
  }
};

module.exports.testConfig = testConfig;

/**
 * Register global test hooks
 */
function registerGlobalHooks() {
  // Global setup
  before(async () => {
    console.log('🧪 Starting test suite...');
    
    // Set up test environment
    process.env.NODE_ENV = 'test';
    
    // Suppress deprecation warnings in tests
    process.removeAllListeners('warning');
    process.on('warning', (warning) => {
      if (warning.name === 'DeprecationWarning') {
        // Suppress deprecation warnings during tests
        return;
      }
      console.warn(warning);
    });
  });
  
  // Global cleanup
  after(async () => {
    console.log('✅ Test suite completed');
  });
}

// Auto-register global hooks
registerGlobalHooks();

/**
 * Utility to convert Mocha-style tests to Node.js test runner
 */
function convertMochaTest(mochaTestFn) {
  return function nodeTestFn(t) {
    // Create a mock context that mimics Mocha's test context
    const mockContext = {
      timeout: (ms) => {
        // Node.js test runner timeout handling
        if (t && t.signal) {
          const controller = new AbortController();
          setTimeout(() => controller.abort(), ms);
          return controller.signal;
        }
      },
      skip: () => t && t.skip && t.skip(),
      slow: () => {}, // No-op for Node.js test runner
      retries: () => {}, // No-op for Node.js test runner
    };
    
    return mochaTestFn.call(mockContext);
  };
}

module.exports.convertMochaTest = convertMochaTest;
