// Copyright IBM Corp. 2024. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

const expect = require('chai').expect;
const RemoteObjects = require('../');
const SharedClass = require('../lib/shared-class');
const express = require('express');
const http = require('http');

describe('Promise Integration', function() {
  let remotes;

  before(function() {
    // Create RemoteObjects instance
    remotes = RemoteObjects.create();

    // Verify Promise enhancement was applied
    expect(remotes._original_invoke).to.be.a('function');
    expect(remotes._original_invokeMethodInContext).to.be.a('function');
  });

  describe('Promise Enhancement Verification', function() {
    it('should enhance RemoteObjects with Promise support', function() {
      expect(remotes.invoke).to.be.a('function');
      expect(remotes._original_invoke).to.be.a('function');
      expect(remotes.invokeMethodInContext).to.be.a('function');
      expect(remotes._original_invokeMethodInContext).to.be.a('function');
    });

    it('should detect callback vs Promise mode correctly', function() {
      // Mock the original invoke to test wrapper behavior
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
        expect(callbackMode).to.be.true;
        expect(result).to.equal('callback result');
      });

      // Test Promise mode detection
      const promise = remotes.invoke('test', [], []);
      expect(promise).to.be.a('promise');
      promiseMode = true;

      expect(callbackMode).to.be.true;
      expect(promiseMode).to.be.true;
    });

    it('should handle Promise rejection correctly', async function() {
      // Mock the original invoke to test error handling
      remotes._original_invoke = function(method, ctorArgs, args, callback) {
        setTimeout(() => callback(new Error('Test error')), 10);
      };

      try {
        await remotes.invoke('test', [], []);
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err).to.be.an('error');
        expect(err.message).to.equal('Test error');
      }
    });

    it('should handle Promise resolution correctly', async function() {
      // Mock the original invoke to test success handling
      remotes._original_invoke = function(method, ctorArgs, args, callback) {
        setTimeout(() => callback(null, 'success result'), 10);
      };

      const result = await remotes.invoke('test', [], []);
      expect(result).to.equal('success result');
    });

    it('should handle multiple return values in Promise mode', async function() {
      // Mock the original invoke to test multiple results
      remotes._original_invoke = function(method, ctorArgs, args, callback) {
        setTimeout(() => callback(null, 'first', 'second', 'third'), 10);
      };

      const result = await remotes.invoke('test', [], []);
      expect(result).to.be.an('array');
      expect(result).to.deep.equal(['first', 'second', 'third']);
    });
  });

  describe('invokeMethodInContext Promise API', function() {
    it('should support callback mode', function(done) {
      // Mock the original invokeMethodInContext
      remotes._original_invokeMethodInContext = function(ctx, callback) {
        setTimeout(() => callback(), 10);
      };

      const ctx = { method: 'test' };
      remotes.invokeMethodInContext(ctx, (err) => {
        expect(err).to.be.undefined;
        done();
      });
    });

    it('should support Promise mode', async function() {
      // Mock the original invokeMethodInContext
      remotes._original_invokeMethodInContext = function(ctx, callback) {
        setTimeout(() => callback(), 10);
      };

      const ctx = { method: 'test' };
      await remotes.invokeMethodInContext(ctx);
      // If we get here without error, the Promise resolved successfully
      expect(true).to.be.true;
    });
  });

  describe('Connect Enhancement', function() {
    it('should enhance adapter when connected', function() {
      // Mock a simple adapter
      const mockAdapter = {
        invoke: function(method, ctorArgs, args, callback) {
          setTimeout(() => callback(null, 'adapter result'), 10);
        }
      };

      // Simulate connection
      remotes.serverAdapter = mockAdapter;
      remotes.connect = remotes._originalConnect || function() { return this; };

      // Call enhanced connect
      remotes.connect();

      // Verify adapter was enhanced
      expect(remotes.serverAdapter._original_invoke).to.be.a('function');
    });
  });

  describe('Backward Compatibility Verification', function() {
    it('should maintain callback behavior with mocked invoke', function(done) {
      // Mock the original invoke to test callback compatibility
      remotes._original_invoke = function(method, ctorArgs, args, callback) {
        setTimeout(() => callback(null, `result for ${method}`), 10);
      };

      remotes.invoke('TestMethod', [], [], function(err, result) {
        expect(err).to.be.null;
        expect(result).to.equal('result for TestMethod');
        done();
      });
    });

    it('should handle argument variations correctly', function(done) {
      // Mock the original invoke to test argument handling
      remotes._original_invoke = function() {
        const args = Array.prototype.slice.call(arguments);
        const callback = args[args.length - 1];
        setTimeout(() => callback(null, 'success'), 10);
      };

      // Test different argument patterns
      remotes.invoke('Method1', function(err, result) {
        expect(result).to.equal('success');
        done();
      });
    });
  });
});
