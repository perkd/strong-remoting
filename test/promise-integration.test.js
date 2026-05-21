// Copyright IBM Corp. 2024. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

// Native Node.js test imports
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const RemoteObjects = require('../');
const SharedClass = require('../lib/shared-class');
const ContextBase = require('../lib/context-base');
const TypeRegistry = require('../lib/type-registry');
const express = require('express');
const http = require('http');

describe('Promise Integration', function() {
  let remotes;

  before(function() {
    // Create RemoteObjects instance
    remotes = RemoteObjects.create();

    // Verify Promise enhancement was applied
    assert.strictEqual(typeof remotes._original_invoke, 'function');
    assert.strictEqual(typeof remotes._original_invokeMethodInContext, 'function');
  });

  describe('Promise Enhancement Verification', function() {
    it('should enhance RemoteObjects with Promise support', function() {
      assert.strictEqual(typeof remotes.invoke, 'function');
      assert.strictEqual(typeof remotes._original_invoke, 'function');
      assert.strictEqual(typeof remotes.invokeMethodInContext, 'function');
      assert.strictEqual(typeof remotes._original_invokeMethodInContext, 'function');
    });

    it('should detect callback vs Promise mode correctly', function() {
      // Mock the adapter connection check and original invoke to test wrapper behavior
      remotes.serverAdapter = { invoke: () => {} }; // Mock adapter
      let callbackMode = false;
      let promiseMode = false;

      remotes._original_invoke = function(method, ctorArgs, args, callback) {
        if (typeof callback === 'function') {
          callbackMode = true;
          callback(null, 'callback result');
        }
      };

      // Test callback mode
      remotes.invoke('test', [], [], function(err, result) {
        assert.strictEqual(callbackMode, true);
        assert.strictEqual(result, 'callback result');
      });

      // Test Promise mode detection
      const promise = remotes.invoke('test', [], []);
      assert(promise instanceof Promise);
      promiseMode = true;

      assert.strictEqual(callbackMode, true);
      assert.strictEqual(promiseMode, true);
    });

    it('should handle Promise rejection correctly', async function() {
      // Mock the original invoke to test error handling
      remotes._original_invoke = function(method, ctorArgs, args, callback) {
        setTimeout(() => callback(new Error('Test error')), 10);
      };

      try {
        await remotes.invoke('test', [], []);
        assert.fail('Should have thrown an error');
      } catch (err) {
        assert(err instanceof Error);
        assert.strictEqual(err.message, 'Test error');
      }
    });

    it('should handle Promise resolution correctly', async function() {
      // Mock the original invoke to test success handling
      remotes._original_invoke = function(method, ctorArgs, args, callback) {
        setTimeout(() => callback(null, 'success result'), 10);
      };

      const result = await remotes.invoke('test', [], []);
      assert.strictEqual(result, 'success result');
    });

    it('should handle multiple return values in Promise mode', async function() {
      // Mock the original invoke to test multiple results
      remotes._original_invoke = function(method, ctorArgs, args, callback) {
        setTimeout(() => callback(null, 'first', 'second', 'third'), 10);
      };

      const result = await remotes.invoke('test', [], []);
      assert(Array.isArray(result));
      assert.deepStrictEqual(result, ['first', 'second', 'third']);
    });
  });

  describe('invokeMethodInContext Promise API', function() {
    it('should support callback mode', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      // Mock the adapter connection check and original invokeMethodInContext
      remotes.serverAdapter = { invoke: () => {} }; // Mock adapter
      remotes._original_invokeMethodInContext = function(ctx, callback) {
        setTimeout(() => callback(), 10);
      };

      // Create a proper context object with getScope method
      const method = {
        name: 'test',
        ctor: function() {},
        invoke: function(scope, args, remotingOptions, ctx, cb) {
          // Mock invoke method
          setTimeout(() => cb(null, 'test result'), 10);
        }
      };
      const typeRegistry = new TypeRegistry();
      const ctx = new ContextBase(method, typeRegistry);

      remotes.invokeMethodInContext(ctx, (err) => {
        assert.strictEqual(err, undefined);
        done();
      });
    });

    it('should support Promise mode', async function() {
      // Mock the adapter connection check and original invokeMethodInContext
      remotes.serverAdapter = { invoke: () => {} }; // Mock adapter
      remotes._original_invokeMethodInContext = function(ctx, callback) {
        setTimeout(() => callback(), 10);
      };

      // Create a proper context object with getScope method
      const method = {
        name: 'test',
        ctor: function() {},
        invoke: function(scope, args, remotingOptions, ctx, cb) {
          // Mock invoke method
          setTimeout(() => cb(null, 'test result'), 10);
        }
      };
      const typeRegistry = new TypeRegistry();
      const ctx = new ContextBase(method, typeRegistry);

      await remotes.invokeMethodInContext(ctx);
      // If we get here without error, the Promise resolved successfully
      assert.strictEqual(true, true);
      }); // End of Promise
    }); // End of it
  }); // End of describe

  describe('Connect Enhancement', function() {
    it('should enhance adapter when connected', function() {
      // Mock a simple adapter
      const mockAdapter = {
        invoke: function(method, ctorArgs, args, callback) {
          setTimeout(() => callback(null, 'adapter result'), 10);
        },
        connect: function(url) {
          return this;
        }
      };

      // Mock the adapter constructor to return our mock adapter
      const originalAdapter = remotes.adapter;
      remotes.adapter = function(name) {
        if (name === 'rest') {
          return function MockAdapter() {
            return mockAdapter;
          };
        }
        return originalAdapter.call(this, name);
      };

      // Call enhanced connect with proper URL and adapter name
      // This will use the enhanced connect method that adds _original_invoke
      remotes.connect('http://localhost:3000', 'rest');

      // Restore original adapter method
      remotes.adapter = originalAdapter;

      // Verify adapter was enhanced
      assert.strictEqual(typeof remotes.serverAdapter._original_invoke, 'function');
    });
  });

  describe('Backward Compatibility Verification', function() {
    it('should maintain callback behavior with mocked invoke', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      // Mock the adapter to test callback compatibility
      remotes.serverAdapter = {
        invoke: function(method, ctorArgs, args, callback) {
          setTimeout(() => callback(null, `result for ${method}`), 10);
        }
      };

      remotes.invoke('TestMethod', [], [], function(err, result) {
        assert.strictEqual(err, null);
        assert.strictEqual(result, 'result for TestMethod');
        done();
      });
      }); // End of Promise
    }); // End of it

    it('should handle argument variations correctly', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      // Mock the adapter to test argument handling
      remotes.serverAdapter = {
        invoke: function() {
          const args = Array.prototype.slice.call(arguments);
          const callback = args[args.length - 1];
          setTimeout(() => callback(null, 'success'), 10);
        }
      };

      // Test different argument patterns
      remotes.invoke('Method1', [], [], function(err, result) {
        assert.strictEqual(result, 'success');
        done();
      });
      }); // End of Promise
    }); // End of it
  }); // End of describe (Backward Compatibility Verification)
}); // End of main describe (Promise Integration)
