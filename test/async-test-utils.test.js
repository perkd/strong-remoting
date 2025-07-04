// Copyright IBM Corp. 2024. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

/**
 * Tests for modern async test utilities
 * 
 * This file demonstrates and tests the async test utilities
 * using the native Node.js test runner.
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('events');

// Import our test utilities
const {
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
} = require('./helpers/async-test-utils');

describe('Async Test Utilities', () => {
  describe('delay and delayReject', () => {
    it('should resolve after specified delay', async () => {
      const start = Date.now();
      const result = await delay(50, 'test value');
      const elapsed = Date.now() - start;
      
      assert.strictEqual(result, 'test value');
      assert(elapsed >= 45, 'Should delay for at least 45ms');
    });

    it('should reject after specified delay', async () => {
      const start = Date.now();
      
      try {
        await delayReject(50, 'test error');
        assert.fail('Should have rejected');
      } catch (error) {
        const elapsed = Date.now() - start;
        assert.strictEqual(error.message, 'test error');
        assert(elapsed >= 45, 'Should delay for at least 45ms');
      }
    });
  });

  describe('isAsync', () => {
    it('should detect async functions', () => {
      async function asyncFn() { return 'async'; }
      function syncFn() { return 'sync'; }
      function promiseFn() { return Promise.resolve('promise'); }
      
      assert.strictEqual(isAsync(asyncFn), true);
      assert.strictEqual(isAsync(syncFn), false);
      assert.strictEqual(isAsync(promiseFn), true);
      assert.strictEqual(isAsync('not a function'), false);
    });
  });

  describe('promisify', () => {
    it('should convert callback function to Promise', async () => {
      function callbackFn(value, callback) {
        setTimeout(() => callback(null, value.toUpperCase()), 10);
      }
      
      const promiseFn = promisify(callbackFn);
      const result = await promiseFn('hello');
      
      assert.strictEqual(result, 'HELLO');
    });

    it('should handle callback errors', async () => {
      function errorFn(callback) {
        setTimeout(() => callback(new Error('callback error')), 10);
      }
      
      const promiseFn = promisify(errorFn);
      
      try {
        await promiseFn();
        assert.fail('Should have thrown');
      } catch (error) {
        assert.strictEqual(error.message, 'callback error');
      }
    });
  });

  describe('createMock', () => {
    it('should create a mock function that tracks calls', () => {
      const mock = createMock('return value');
      
      const result1 = mock('arg1', 'arg2');
      const result2 = mock('arg3');
      
      assert.strictEqual(result1, 'return value');
      assert.strictEqual(result2, 'return value');
      assert.strictEqual(mock.callCount, 2);
      assert.deepStrictEqual(mock.calls[0], ['arg1', 'arg2']);
      assert.deepStrictEqual(mock.calls[1], ['arg3']);
    });

    it('should support throwing errors', () => {
      const mock = createMock('error message', true);
      
      assert.throws(() => mock(), /error message/);
      assert.strictEqual(mock.callCount, 1);
    });

    it('should support reset functionality', () => {
      const mock = createMock('value');
      
      mock('test');
      assert.strictEqual(mock.callCount, 1);
      
      mock.reset();
      assert.strictEqual(mock.callCount, 0);
      assert.strictEqual(mock.calls.length, 0);
    });
  });

  describe('createAsyncMock', () => {
    it('should create an async mock function', async () => {
      const mock = createAsyncMock('async result', 10);
      
      const start = Date.now();
      const result = await mock('arg1');
      const elapsed = Date.now() - start;
      
      assert.strictEqual(result, 'async result');
      assert(elapsed >= 5, 'Should have some delay');
      assert.strictEqual(mock.callCount, 1);
      assert.deepStrictEqual(mock.calls[0], ['arg1']);
    });

    it('should support async rejection', async () => {
      const mock = createAsyncMock('error message', 10, true);
      
      try {
        await mock();
        assert.fail('Should have rejected');
      } catch (error) {
        assert.strictEqual(error.message, 'error message');
        assert.strictEqual(mock.callCount, 1);
      }
    });
  });

  describe('createSpy', () => {
    it('should spy on existing function', () => {
      function originalFn(x, y) {
        return x + y;
      }
      
      const spy = createSpy(originalFn);
      
      const result = spy(2, 3);
      
      assert.strictEqual(result, 5);
      assert.strictEqual(spy.callCount, 1);
      assert.deepStrictEqual(spy.calls[0], [2, 3]);
      assert.deepStrictEqual(spy.results[0], { type: 'return', value: 5 });
    });

    it('should track thrown errors', () => {
      function throwingFn() {
        throw new Error('test error');
      }
      
      const spy = createSpy(throwingFn);
      
      assert.throws(() => spy(), /test error/);
      assert.strictEqual(spy.callCount, 1);
      assert.strictEqual(spy.results[0].type, 'throw');
      assert.strictEqual(spy.results[0].value.message, 'test error');
    });
  });

  describe('waitForEvent', () => {
    it('should wait for event to be emitted', async () => {
      const emitter = new EventEmitter();
      
      // Emit event after delay
      setTimeout(() => emitter.emit('test', 'event data'), 50);
      
      const result = await waitForEvent(emitter, 'test');
      assert.strictEqual(result, 'event data');
    });

    it('should timeout if event not emitted', async () => {
      const emitter = new EventEmitter();
      
      try {
        await waitForEvent(emitter, 'never-emitted', 100);
        assert.fail('Should have timed out');
      } catch (error) {
        assert(error.message.includes('Timeout waiting for event'));
      }
    });
  });

  describe('waitForEvents', () => {
    it('should wait for multiple events', async () => {
      const emitter = new EventEmitter();
      
      // Emit events after delays
      setTimeout(() => emitter.emit('event1', 'data1'), 30);
      setTimeout(() => emitter.emit('event2', 'data2'), 60);
      
      const results = await waitForEvents(emitter, ['event1', 'event2']);
      assert.deepStrictEqual(results, ['data1', 'data2']);
    });
  });

  describe('createTestContext', () => {
    it('should create test context with defaults', () => {
      const context = createTestContext();
      
      assert.strictEqual(context.method.name, 'testMethod');
      assert.strictEqual(context.method.sharedClass.name, 'TestClass');
      assert.strictEqual(context.method.isStatic, true);
      assert.deepStrictEqual(context.args, []);
    });

    it('should create test context with custom options', () => {
      const context = createTestContext({
        methodName: 'customMethod',
        className: 'CustomClass',
        args: ['arg1', 'arg2'],
        result: 'custom result'
      });
      
      assert.strictEqual(context.method.name, 'customMethod');
      assert.strictEqual(context.method.sharedClass.name, 'CustomClass');
      assert.deepStrictEqual(context.args, ['arg1', 'arg2']);
      assert.strictEqual(context.result, 'custom result');
    });
  });

  describe('createMockRemoteObjects', () => {
    it('should create mock RemoteObjects instance', () => {
      const remotes = createMockRemoteObjects();
      
      assert(typeof remotes.invoke === 'function');
      assert(typeof remotes.invokeMethodInContext === 'function');
      assert(typeof remotes.connect === 'function');
      assert(typeof remotes.addClass === 'function');
      assert(typeof remotes.before === 'function');
      assert(typeof remotes.after === 'function');
      assert(typeof remotes.execHooks === 'function');
    });

    it('should support custom configuration', () => {
      const remotes = createMockRemoteObjects({
        invokeResult: 'custom result',
        options: { custom: true }
      });
      
      assert.strictEqual(remotes.options.custom, true);
    });
  });

  describe('retry', () => {
    it('should succeed on first attempt', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        return 'success';
      };
      
      const result = await retry(operation);
      
      assert.strictEqual(result, 'success');
      assert.strictEqual(attempts, 1);
    });

    it('should retry on failure and eventually succeed', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('temporary failure');
        }
        return 'success';
      };
      
      const result = await retry(operation, { maxAttempts: 3, baseDelay: 10 });
      
      assert.strictEqual(result, 'success');
      assert.strictEqual(attempts, 3);
    });

    it('should fail after max attempts', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        throw new Error('persistent failure');
      };
      
      try {
        await retry(operation, { maxAttempts: 2, baseDelay: 10 });
        assert.fail('Should have failed');
      } catch (error) {
        assert.strictEqual(error.message, 'persistent failure');
        assert.strictEqual(attempts, 2);
      }
    });
  });

  describe('dualApiUtils', () => {
    it('should test dual API compatibility', async () => {
      function dualApiFn(value, callback) {
        const result = value.toUpperCase();
        
        if (callback) {
          setTimeout(() => callback(null, result), 10);
        } else {
          return Promise.resolve(result);
        }
      }
      
      const result = await dualApiUtils.testDualApi(dualApiFn, ['hello'], 'HELLO');
      assert.strictEqual(result, 'HELLO');
    });

    it('should test dual API error handling', async () => {
      function errorFn(shouldError, callback) {
        if (shouldError) {
          const error = new Error('test error');
          if (callback) {
            setTimeout(() => callback(error), 10);
          } else {
            return Promise.reject(error);
          }
        }
      }
      
      const { callbackError, promiseError } = await dualApiUtils.testDualApiError(
        errorFn, 
        [true], 
        'test error'
      );
      
      assert.strictEqual(callbackError.message, 'test error');
      assert.strictEqual(promiseError.message, 'test error');
    });
  });
});
