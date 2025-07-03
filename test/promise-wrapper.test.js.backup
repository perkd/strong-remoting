// Copyright IBM Corp. 2024. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

const expect = require('chai').expect;
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
    it('should maintain callback behavior when callback provided', function(done) {
      function originalFn(arg1, arg2, callback) {
        setTimeout(() => callback(null, arg1 + arg2), 10);
      }
      
      const wrappedFn = createDualApiWrapper(originalFn);
      
      wrappedFn('hello', 'world', (err, result) => {
        expect(err).to.be.null;
        expect(result).to.equal('helloworld');
        done();
      });
    });
    
    it('should return Promise when no callback provided', async function() {
      function originalFn(arg1, arg2, callback) {
        setTimeout(() => callback(null, arg1 + arg2), 10);
      }
      
      const wrappedFn = createDualApiWrapper(originalFn);
      const result = await wrappedFn('hello', 'world');
      
      expect(result).to.equal('helloworld');
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
        expect(err.message).to.equal('Test error');
      }
    });
    
    it('should handle multiple return values', async function() {
      function originalFn(callback) {
        setTimeout(() => callback(null, 'first', 'second', 'third'), 10);
      }
      
      const wrappedFn = createDualApiWrapper(originalFn);
      const result = await wrappedFn();
      
      expect(result).to.deep.equal(['first', 'second', 'third']);
    });
    
    it('should handle no return values', async function() {
      function originalFn(callback) {
        setTimeout(() => callback(null), 10);
      }
      
      const wrappedFn = createDualApiWrapper(originalFn);
      const result = await wrappedFn();
      
      expect(result).to.be.undefined;
    });
  });
  
  describe('createInvokeWrapper', function() {
    it('should handle invoke with callback', function(done) {
      function originalInvoke(method, ctorArgs, args, callback) {
        setTimeout(() => callback(null, `invoked ${method}`), 10);
      }
      
      const wrappedInvoke = createInvokeWrapper(originalInvoke);
      
      wrappedInvoke('testMethod', [], [], (err, result) => {
        expect(err).to.be.null;
        expect(result).to.equal('invoked testMethod');
        done();
      });
    });
    
    it('should handle invoke with Promise', async function() {
      function originalInvoke(method, ctorArgs, args, callback) {
        setTimeout(() => callback(null, `invoked ${method}`), 10);
      }
      
      const wrappedInvoke = createInvokeWrapper(originalInvoke);
      const result = await wrappedInvoke('testMethod', [], []);
      
      expect(result).to.equal('invoked testMethod');
    });
    
    it('should handle variable arguments correctly', async function() {
      function originalInvoke(method, ctorArgs, args, callback) {
        // Simulate the actual invoke signature handling
        const lastArg = arguments[arguments.length - 1];
        const actualCallback = typeof lastArg === 'function' ? lastArg : callback;
        setTimeout(() => actualCallback(null, `invoked ${method}`), 10);
      }
      
      const wrappedInvoke = createInvokeWrapper(originalInvoke);
      
      // Test different argument patterns
      const result1 = await wrappedInvoke('method1');
      const result2 = await wrappedInvoke('method2', []);
      const result3 = await wrappedInvoke('method3', [], []);
      
      expect(result1).to.equal('invoked method1');
      expect(result2).to.equal('invoked method2');
      expect(result3).to.equal('invoked method3');
    });
  });
  
  describe('wrapHookFunction', function() {
    it('should handle callback-style hooks', function(done) {
      function callbackHook(ctx, next) {
        ctx.modified = true;
        next();
      }
      
      const wrappedHook = wrapHookFunction(callbackHook);
      const ctx = {};
      
      wrappedHook(ctx, (err) => {
        expect(err).to.be.undefined;
        expect(ctx.modified).to.be.true;
        done();
      });
    });
    
    it('should handle async hooks', function(done) {
      async function asyncHook(ctx) {
        await new Promise(resolve => setTimeout(resolve, 10));
        ctx.modified = true;
      }
      
      const wrappedHook = wrapHookFunction(asyncHook);
      const ctx = {};
      
      wrappedHook(ctx, (err) => {
        expect(err).to.be.undefined;
        expect(ctx.modified).to.be.true;
        done();
      });
    });
    
    it('should handle synchronous hooks', function(done) {
      function syncHook(ctx) {
        ctx.modified = true;
      }
      
      const wrappedHook = wrapHookFunction(syncHook);
      const ctx = {};
      
      wrappedHook(ctx, (err) => {
        expect(err).to.be.undefined;
        expect(ctx.modified).to.be.true;
        done();
      });
    });
    
    it('should handle hook errors', function(done) {
      function errorHook(ctx) {
        throw new Error('Hook error');
      }
      
      const wrappedHook = wrapHookFunction(errorHook);
      const ctx = {};
      
      wrappedHook(ctx, (err) => {
        expect(err).to.be.an('error');
        expect(err.message).to.equal('Hook error');
        done();
      });
    });
    
    it('should handle async hook rejections', function(done) {
      async function rejectingHook(ctx) {
        throw new Error('Async hook error');
      }
      
      const wrappedHook = wrapHookFunction(rejectingHook);
      const ctx = {};
      
      wrappedHook(ctx, (err) => {
        expect(err).to.be.an('error');
        expect(err.message).to.equal('Async hook error');
        done();
      });
    });
  });
  
  describe('isAsyncFunction', function() {
    it('should detect async functions', function() {
      async function asyncFn() {}
      function normalFn() {}
      const arrowAsync = async () => {};
      const arrowNormal = () => {};

      expect(isAsyncFunction(asyncFn)).to.be.true;
      expect(isAsyncFunction(arrowAsync)).to.be.true;
      expect(isAsyncFunction(normalFn)).to.be.false;
      expect(isAsyncFunction(arrowNormal)).to.be.false;
    });

    it('should handle edge cases', function() {
      expect(isAsyncFunction(null)).to.be.false;
      expect(isAsyncFunction(undefined)).to.be.false;
      expect(isAsyncFunction('not a function')).to.be.false;
    });
  });
  
  describe('promisifyMethod', function() {
    it('should enhance object methods with Promise support', async function() {
      const testObj = {
        testMethod(arg, callback) {
          setTimeout(() => callback(null, `result: ${arg}`), 10);
        }
      };
      
      const original = promisifyMethod(testObj, 'testMethod');
      
      // Test callback mode still works
      testObj.testMethod('callback', (err, result) => {
        expect(result).to.equal('result: callback');
      });
      
      // Test Promise mode
      const promiseResult = await testObj.testMethod('promise');
      expect(promiseResult).to.equal('result: promise');
      
      // Verify original is stored
      expect(testObj._original_testMethod).to.equal(original);
    });
    
    it('should handle invoke methods specially', async function() {
      const testObj = {
        invoke(method, ctorArgs, args, callback) {
          setTimeout(() => callback(null, `invoked: ${method}`), 10);
        }
      };
      
      promisifyMethod(testObj, 'invoke');
      
      const result = await testObj.invoke('testMethod', [], []);
      expect(result).to.equal('invoked: testMethod');
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
      
      expect(testObj.testMethod).to.not.equal(original);
      
      restoreMethod(testObj, 'testMethod');
      
      expect(testObj.testMethod).to.equal(original);
      expect(testObj._original_testMethod).to.be.undefined;
    });
  });
  
  describe('Integration tests', function() {
    it('should maintain exact callback behavior', function(done) {
      function complexMethod(arg1, arg2, options, callback) {
        // Simulate complex argument handling like in strong-remoting
        if (typeof options === 'function') {
          callback = options;
          options = {};
        }
        
        setTimeout(() => {
          callback(null, {
            arg1: arg1,
            arg2: arg2,
            options: options
          });
        }, 10);
      }
      
      const wrapped = createDualApiWrapper(complexMethod);
      
      // Test with options
      wrapped('a', 'b', {test: true}, (err, result) => {
        expect(result.arg1).to.equal('a');
        expect(result.arg2).to.equal('b');
        expect(result.options.test).to.be.true;
        done();
      });
    });
    
    it('should handle Promise mode with complex arguments', async function() {
      function complexMethod(arg1, arg2, options, callback) {
        if (typeof options === 'function') {
          callback = options;
          options = {};
        }
        
        setTimeout(() => {
          callback(null, {
            arg1: arg1,
            arg2: arg2,
            options: options
          });
        }, 10);
      }
      
      const wrapped = createDualApiWrapper(complexMethod);
      
      const result = await wrapped('a', 'b', {test: true});
      expect(result.arg1).to.equal('a');
      expect(result.arg2).to.equal('b');
      expect(result.options.test).to.be.true;
    });
  });
});
