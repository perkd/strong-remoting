// Copyright IBM Corp. 2024. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

/**
 * Modern test utilities for Promise/async testing patterns
 * 
 * This module provides utilities specifically designed for testing
 * the modernized strong-remoting codebase with Promise and async/await support.
 */

const { EventEmitter } = require('events');

/**
 * Create a Promise that resolves after a specified delay
 * @param {number} ms - Delay in milliseconds
 * @param {*} value - Value to resolve with
 * @returns {Promise} Promise that resolves after delay
 */
function delay(ms, value) {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

/**
 * Create a Promise that rejects after a specified delay
 * @param {number} ms - Delay in milliseconds
 * @param {Error|string} error - Error to reject with
 * @returns {Promise} Promise that rejects after delay
 */
function delayReject(ms, error) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const err = error instanceof Error ? error : new Error(error);
      reject(err);
    }, ms);
  });
}

/**
 * Test if a function is async (returns a Promise)
 * @param {Function} fn - Function to test
 * @returns {boolean} True if function returns a Promise
 */
function isAsync(fn) {
  if (typeof fn !== 'function') return false;
  
  try {
    const result = fn();
    return result && typeof result.then === 'function';
  } catch (error) {
    return false;
  }
}

/**
 * Wrap a callback-style function to return a Promise
 * @param {Function} fn - Callback-style function
 * @returns {Function} Promise-returning function
 */
function promisify(fn) {
  return function(...args) {
    return new Promise((resolve, reject) => {
      fn(...args, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  };
}

/**
 * Create a mock function that tracks calls and can be configured
 * @param {*} returnValue - Value to return
 * @param {boolean} shouldThrow - Whether to throw an error
 * @returns {Function} Mock function with tracking
 */
function createMock(returnValue, shouldThrow = false) {
  const mock = function(...args) {
    mock.calls.push(args);
    mock.callCount++;
    
    if (shouldThrow) {
      const error = returnValue instanceof Error ? returnValue : new Error(returnValue);
      throw error;
    }
    
    return returnValue;
  };
  
  mock.calls = [];
  mock.callCount = 0;
  mock.reset = () => {
    mock.calls = [];
    mock.callCount = 0;
  };
  
  return mock;
}

/**
 * Create an async mock function
 * @param {*} returnValue - Value to resolve with
 * @param {number} delay - Delay before resolving (ms)
 * @param {boolean} shouldReject - Whether to reject instead of resolve
 * @returns {Function} Async mock function
 */
function createAsyncMock(returnValue, delayMs = 0, shouldReject = false) {
  const mock = async function(...args) {
    mock.calls.push(args);
    mock.callCount++;
    
    if (delayMs > 0) {
      await delay(delayMs);
    }
    
    if (shouldReject) {
      const error = returnValue instanceof Error ? returnValue : new Error(returnValue);
      throw error;
    }
    
    return returnValue;
  };
  
  mock.calls = [];
  mock.callCount = 0;
  mock.reset = () => {
    mock.calls = [];
    mock.callCount = 0;
  };
  
  return mock;
}

/**
 * Create a spy that wraps an existing function
 * @param {Function} originalFn - Original function to spy on
 * @returns {Function} Spy function
 */
function createSpy(originalFn) {
  const spy = function(...args) {
    spy.calls.push(args);
    spy.callCount++;
    
    try {
      const result = originalFn.apply(this, args);
      spy.results.push({ type: 'return', value: result });
      return result;
    } catch (error) {
      spy.results.push({ type: 'throw', value: error });
      throw error;
    }
  };
  
  spy.calls = [];
  spy.callCount = 0;
  spy.results = [];
  spy.original = originalFn;
  spy.reset = () => {
    spy.calls = [];
    spy.callCount = 0;
    spy.results = [];
  };
  
  return spy;
}

/**
 * Wait for an event to be emitted
 * @param {EventEmitter} emitter - Event emitter
 * @param {string} event - Event name
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise} Promise that resolves with event data
 */
function waitForEvent(emitter, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      emitter.removeListener(event, onEvent);
      reject(new Error(`Timeout waiting for event: ${event}`));
    }, timeout);
    
    function onEvent(...args) {
      clearTimeout(timer);
      resolve(args.length === 1 ? args[0] : args);
    }
    
    emitter.once(event, onEvent);
  });
}

/**
 * Wait for multiple events to be emitted
 * @param {EventEmitter} emitter - Event emitter
 * @param {string[]} events - Array of event names
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise} Promise that resolves with array of event data
 */
function waitForEvents(emitter, events, timeout = 5000) {
  const promises = events.map(event => waitForEvent(emitter, event, timeout));
  return Promise.all(promises);
}

/**
 * Create a test context for RemoteObjects testing
 * @param {Object} options - Configuration options
 * @returns {Object} Test context
 */
function createTestContext(options = {}) {
  const context = {
    method: {
      name: options.methodName || 'testMethod',
      sharedClass: { name: options.className || 'TestClass' },
      isStatic: options.isStatic !== false,
      fn: options.fn || function() {},
      ...options.method
    },
    args: options.args || [],
    result: options.result || null,
    error: options.error || null,
    req: options.req || {},
    res: options.res || {},
    ...options.context
  };
  
  return context;
}

/**
 * Create a mock RemoteObjects instance for testing
 * @param {Object} options - Configuration options
 * @returns {Object} Mock RemoteObjects instance
 */
function createMockRemoteObjects(options = {}) {
  const remotes = new EventEmitter();
  
  // Mock methods
  remotes.invoke = createAsyncMock(options.invokeResult || 'mock result');
  remotes.invokeMethodInContext = createAsyncMock();
  remotes.connect = createMock(remotes);
  remotes.addClass = createMock();
  remotes.before = createMock();
  remotes.after = createMock();
  remotes.execHooks = createAsyncMock();
  
  // Mock properties
  remotes.options = options.options || {};
  remotes.exports = options.exports || {};
  remotes._classes = options.classes || {};
  
  return remotes;
}

/**
 * Create a test suite for async/Promise testing
 * @param {string} name - Suite name
 * @param {Function} testFn - Test function
 * @returns {Function} Test suite function
 */
function createAsyncTestSuite(name, testFn) {
  return async function() {
    console.log(`\n🧪 Running async test suite: ${name}`);
    
    try {
      await testFn();
      console.log(`✅ Async test suite passed: ${name}`);
    } catch (error) {
      console.error(`❌ Async test suite failed: ${name}`, error);
      throw error;
    }
  };
}

/**
 * Retry an async operation with exponential backoff
 * @param {Function} operation - Async operation to retry
 * @param {Object} options - Retry options
 * @returns {Promise} Promise that resolves with operation result
 */
async function retry(operation, options = {}) {
  const {
    maxAttempts = 3,
    baseDelay = 100,
    maxDelay = 1000,
    backoffFactor = 2
  } = options;
  
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxAttempts) {
        break;
      }
      
      const delayMs = Math.min(baseDelay * Math.pow(backoffFactor, attempt - 1), maxDelay);
      await delay(delayMs);
    }
  }
  
  throw lastError;
}

/**
 * Test utilities for Promise/callback dual API testing
 */
const dualApiUtils = {
  /**
   * Test that a function supports both callback and Promise modes
   * @param {Function} fn - Function to test
   * @param {Array} args - Arguments to pass to function
   * @param {*} expectedResult - Expected result
   * @returns {Promise} Promise that resolves if both modes work
   */
  async testDualApi(fn, args, expectedResult) {
    // Test callback mode
    const callbackResult = await new Promise((resolve, reject) => {
      fn(...args, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    
    // Test Promise mode
    const promiseResult = await fn(...args);
    
    // Verify results match
    if (JSON.stringify(callbackResult) !== JSON.stringify(promiseResult)) {
      throw new Error('Callback and Promise results do not match');
    }
    
    if (JSON.stringify(callbackResult) !== JSON.stringify(expectedResult)) {
      throw new Error('Result does not match expected value');
    }
    
    return callbackResult;
  },
  
  /**
   * Test that a function properly handles errors in both modes
   * @param {Function} fn - Function to test
   * @param {Array} args - Arguments to pass to function
   * @param {string|RegExp} expectedError - Expected error message or pattern
   * @returns {Promise} Promise that resolves if both modes handle errors correctly
   */
  async testDualApiError(fn, args, expectedError) {
    // Test callback mode error handling
    const callbackError = await new Promise((resolve) => {
      fn(...args, (err) => {
        resolve(err);
      });
    });
    
    // Test Promise mode error handling
    let promiseError;
    try {
      await fn(...args);
    } catch (error) {
      promiseError = error;
    }
    
    // Verify both modes threw errors
    if (!callbackError || !promiseError) {
      throw new Error('Both callback and Promise modes should throw errors');
    }
    
    // Verify error messages match expected pattern
    const checkError = (error) => {
      if (typeof expectedError === 'string') {
        return error.message.includes(expectedError);
      } else if (expectedError instanceof RegExp) {
        return expectedError.test(error.message);
      }
      return false;
    };
    
    if (!checkError(callbackError) || !checkError(promiseError)) {
      throw new Error('Error messages do not match expected pattern');
    }
    
    return { callbackError, promiseError };
  }
};

module.exports = {
  delay,
  delayReject,
  isAsync,
  promisify,
  createMock,
  createAsyncMock,
  createSpy,
  waitForEvent,
  waitForEvents,
  createTestContext,
  createMockRemoteObjects,
  createAsyncTestSuite,
  retry,
  dualApiUtils
};
