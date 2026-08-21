// Copyright IBM Corp. 2024. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

// Native Node.js test imports
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

// Use native assert directly
const {
  createDualApiWrapper,
  createInvokeWrapper,
  wrapHookFunction,
  isAsyncFunction,
  promisifyMethod,
  restoreMethod,
  enhanceRemoteObjects,
} = require('../lib/promise-wrapper');

describe('Promise Wrapper', function() {
  describe('createDualApiWrapper', function() {
    it('should maintain callback behavior when callback provided', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
        
        function originalFn(arg1, arg2, callback) {
          setTimeout(() => callback(null, arg1 + arg2), 10);
        }
        
        const wrappedFn = createDualApiWrapper(originalFn);
        
        wrappedFn('hello', 'world', (err, result) => {
          try {
            assert.strictEqual(err, null);
            assert.strictEqual(result, 'helloworld');
            done();
          } catch (error) {
            done(error);
          }
        });
      });
    });
    
    it('should return Promise when no callback provided', async function() {
      function originalFn(arg1, arg2, callback) {
        setTimeout(() => callback(null, arg1 + arg2), 10);
      }
      
      const wrappedFn = createDualApiWrapper(originalFn);
      const result = await wrappedFn('hello', 'world');
      
      assert.strictEqual(result, 'helloworld');
    });
    
    it('should handle errors in Promise mode', async function() {
      function originalFn(shouldError, callback) {
        setTimeout(() => {
          if (shouldError) {
            callback(new Error('Test error'));
          } else {
            callback(null, 'success');
          }
        }, 10);
      }
      
      const wrappedFn = createDualApiWrapper(originalFn);
      
      try {
        await wrappedFn(true);
        expect.fail('Should have thrown an error');
      } catch (err) {
        assert.strictEqual(err.message, 'Test error');
      }
    });
    
    it('should handle multiple return values', async function() {
      function originalFn(callback) {
        setTimeout(() => callback(null, 'first', 'second', 'third'), 10);
      }
      
      const wrappedFn = createDualApiWrapper(originalFn);
      const result = await wrappedFn();
      
      assert.deepStrictEqual(result, ['first', 'second', 'third']);
    });
    
    it('should handle no return values', async function() {
      function originalFn(callback) {
        setTimeout(() => callback(null), 10);
      }
      
      const wrappedFn = createDualApiWrapper(originalFn);
      const result = await wrappedFn();
      
      assert.strictEqual(result, undefined);
    });
  });
  
  describe('createInvokeWrapper', function() {
    it('should handle invoke with callback', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
        
        function originalInvoke(method, ctorArgs, args, callback) {
          setTimeout(() => callback(null, `invoked ${method}`), 10);
        }
        
        const wrappedInvoke = createInvokeWrapper(originalInvoke);
        
        wrappedInvoke('testMethod', [], [], (err, result) => {
          try {
            assert.strictEqual(err, null);
            assert.strictEqual(result, 'invoked testMethod');
            done();
          } catch (error) {
            done(error);
          }
        });
      });
    });
    
    it('should handle invoke with Promise', async function() {
      function originalInvoke(method, ctorArgs, args, callback) {
        setTimeout(() => callback(null, `invoked ${method}`), 10);
      }
      
      const wrappedInvoke = createInvokeWrapper(originalInvoke);
      const result = await wrappedInvoke('testMethod', [], []);
      
      assert.strictEqual(result, 'invoked testMethod');
    });
    
    it('should handle variable arguments correctly', async function() {
      function originalInvoke(method, ctorArgs, args, callback) {
        setTimeout(() => callback(null, `invoked ${method} with ${args.length} args`), 10);
      }
      
      const wrappedInvoke = createInvokeWrapper(originalInvoke);
      
      const result1 = await wrappedInvoke('method1', [], []);
      const result2 = await wrappedInvoke('method2', [], ['arg1']);
      const result3 = await wrappedInvoke('method3', [], ['arg1', 'arg2']);
      
      assert.strictEqual(result1, 'invoked method1 with 0 args');
      assert.strictEqual(result2, 'invoked method2 with 1 args');
      assert.strictEqual(result3, 'invoked method3 with 2 args');
    });
  });
  
  describe('isAsyncFunction', function() {
    it('should detect async functions', function() {
      async function asyncFn() {}
      function normalFn() {}
      const arrowAsync = async () => {};
      const arrowNormal = () => {};
      
      assert.strictEqual(isAsyncFunction(asyncFn), true);
      assert.strictEqual(isAsyncFunction(arrowAsync), true);
      assert.strictEqual(isAsyncFunction(normalFn), false);
      assert.strictEqual(isAsyncFunction(arrowNormal), false);
      assert.strictEqual(isAsyncFunction(null), false);
      assert.strictEqual(isAsyncFunction(undefined), false);
      assert.strictEqual(isAsyncFunction('not a function'), false);
    });
  });
  
  describe('promisifyMethod', function() {
    it('should enhance object methods with Promise support', async function() {
      const testObj = {
        testMethod(arg, callback) {
          setTimeout(() => callback(null, `result: ${arg}`), 10);
        }
      };
      
      promisifyMethod(testObj, 'testMethod');
      
      const result = await testObj.testMethod('test');
      assert.strictEqual(result, 'result: test');
    });
    
    it('should enhance invoke method specifically', async function() {
      const testObj = {
        invoke(method, ctorArgs, args, callback) {
          setTimeout(() => callback(null, `invoked: ${method}`), 10);
        }
      };
      
      promisifyMethod(testObj, 'invoke');
      
      const result = await testObj.invoke('testMethod', [], []);
      assert.strictEqual(result, 'invoked: testMethod');
    });
  });
  
  describe('restoreMethod', function() {
    it('should restore original method behavior', function() {
      const testObj = {
        testMethod(callback) {
          callback(null, 'original');
        }
      };
      
      const original = testObj.testMethod;
      promisifyMethod(testObj, 'testMethod');
      
      // Method should be enhanced
      assert.notStrictEqual(testObj.testMethod, original);
      
      restoreMethod(testObj, 'testMethod');
      
      assert.strictEqual(testObj.testMethod, original);
      assert.strictEqual(testObj._original_testMethod, undefined);
    });
  });
});
