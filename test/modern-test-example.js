// Copyright IBM Corp. 2024. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

/**
 * Example of modern Node.js native testing
 * 
 * This file demonstrates how to write tests using the native Node.js test runner
 * while maintaining compatibility with existing Chai assertions.
 */

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { expect } = require('./test-config');

// Import the module to test
const RemoteObjects = require('../');

describe('Modern Test Example', () => {
  let remotes;

  before(async () => {
    // Global setup for the test suite
    console.log('Setting up test suite...');
  });

  after(async () => {
    // Global cleanup for the test suite
    console.log('Cleaning up test suite...');
  });

  beforeEach(() => {
    // Setup before each test
    remotes = RemoteObjects.create();
  });

  afterEach(() => {
    // Cleanup after each test
    remotes = null;
  });

  describe('Basic functionality', () => {
    it('should create RemoteObjects instance', () => {
      assert(remotes instanceof RemoteObjects);
      expect(remotes).to.be.an('object');
    });

    it('should have Promise-enhanced methods', () => {
      expect(remotes.invoke).to.be.a('function');
      expect(remotes._original_invoke).to.be.a('function');
      expect(remotes.invokeMethodInContext).to.be.a('function');
      expect(remotes._original_invokeMethodInContext).to.be.a('function');
    });
  });

  describe('Async testing patterns', () => {
    it('should handle async/await tests', async () => {
      // Mock the original invoke for testing
      remotes._original_invoke = function(method, ctorArgs, args, callback) {
        setTimeout(() => callback(null, 'async result'), 10);
      };

      const result = await remotes.invoke('test.method', [], []);
      expect(result).to.equal('async result');
    });

    it('should handle Promise rejection', async () => {
      // Mock the original invoke to test error handling
      remotes._original_invoke = function(method, ctorArgs, args, callback) {
        setTimeout(() => callback(new Error('Test error')), 10);
      };

      try {
        await remotes.invoke('test.method', [], []);
        assert.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.an('error');
        expect(error.message).to.equal('Test error');
      }
    });

    it('should handle callback-style tests with done pattern', (t, done) => {
      // For tests that need the done callback pattern
      const testDone = done || (() => {});
      
      // Mock the original invoke
      remotes._original_invoke = function(method, ctorArgs, args, callback) {
        setTimeout(() => callback(null, 'callback result'), 10);
      };

      remotes.invoke('test.method', [], [], (err, result) => {
        try {
          expect(err).to.be.null;
          expect(result).to.equal('callback result');
          testDone();
        } catch (testError) {
          testDone(testError);
        }
      });
    });
  });

  describe('Error handling', () => {
    it('should handle synchronous errors', () => {
      assert.throws(() => {
        throw new Error('Sync error');
      }, /Sync error/);
    });

    it('should handle async errors', async () => {
      await assert.rejects(async () => {
        throw new Error('Async error');
      }, /Async error/);
    });
  });

  describe('Advanced assertions', () => {
    it('should support deep equality', () => {
      const obj1 = { a: 1, b: { c: 2 } };
      const obj2 = { a: 1, b: { c: 2 } };
      
      expect(obj1).to.deep.equal(obj2);
      assert.deepStrictEqual(obj1, obj2);
    });

    it('should support array assertions', () => {
      const arr = [1, 2, 3];
      
      expect(arr).to.be.an('array');
      expect(arr).to.include(2);
      assert(Array.isArray(arr));
    });

    it('should support string assertions', () => {
      const str = 'Hello World';
      
      expect(str).to.include('World');
      expect(str).to.be.a('string');
      assert(str.includes('Hello'));
    });
  });

  describe('Timeout handling', () => {
    it('should handle custom timeouts', { timeout: 2000 }, async () => {
      // Test with custom timeout
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(true).to.be.true;
    });

    it('should handle long-running operations', { timeout: 5000 }, async () => {
      // Simulate long-running operation
      await new Promise(resolve => setTimeout(resolve, 1000));
      expect(true).to.be.true;
    });
  });

  describe('Conditional tests', () => {
    it('should skip tests conditionally', { skip: process.env.SKIP_SLOW_TESTS }, () => {
      // This test will be skipped if SKIP_SLOW_TESTS is set
      expect(true).to.be.true;
    });

    it('should run only specific tests', { only: false }, () => {
      // Set only: true to run only this test
      expect(true).to.be.true;
    });
  });

  describe('Parameterized tests', () => {
    const testCases = [
      { input: 'hello', expected: 'HELLO' },
      { input: 'world', expected: 'WORLD' },
      { input: 'test', expected: 'TEST' },
    ];

    testCases.forEach(({ input, expected }) => {
      it(`should uppercase "${input}" to "${expected}"`, () => {
        const result = input.toUpperCase();
        expect(result).to.equal(expected);
      });
    });
  });

  describe('Mock and stub patterns', () => {
    it('should support simple mocking', () => {
      const originalMethod = remotes.invoke;
      let mockCalled = false;

      // Simple mock
      remotes.invoke = function() {
        mockCalled = true;
        return Promise.resolve('mocked');
      };

      // Test the mock
      expect(remotes.invoke).to.be.a('function');
      
      // Call and verify
      remotes.invoke();
      expect(mockCalled).to.be.true;

      // Restore
      remotes.invoke = originalMethod;
    });

    it('should support spy patterns', () => {
      const calls = [];
      const originalLog = console.log;

      // Simple spy
      console.log = function(...args) {
        calls.push(args);
        return originalLog.apply(console, args);
      };

      // Test the spy
      console.log('test message');
      expect(calls.length).to.equal(1);
      expect(calls[0]).to.deep.equal(['test message']);

      // Restore
      console.log = originalLog;
    });
  });
});
