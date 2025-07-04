// Copyright IBM Corp. 2024. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

// Native Node.js test imports
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const { expect } = require('./test-config'); // Use native expect interface
const RemoteObjects = require('../');

describe('Enhanced Hook System', function() {
  let remotes;

  beforeEach(function() {
    remotes = RemoteObjects.create();
  });

  describe('Callback-style hooks (backward compatibility)', function() {
    it('should execute callback-style before hooks', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      let hookExecuted = false;
      
      remotes.before('test.method', function(ctx, next) {
        hookExecuted = true;
        ctx.hookData = 'callback-before';
        next();
      });
      
      // Mock method and context
      const method = {
        name: 'method',
        sharedClass: { name: 'test' },
        isStatic: true
      };
      const ctx = {};
      
      remotes.execHooks('before', method, {}, ctx, function(err) {
        expect(err).to.be.undefined;
        assert.strictEqual(hookExecuted, true);
        assert.strictEqual(ctx.hookData, 'callback-before');
        done();
      });
      }); // End of Promise
    }); // End of it

    it('should execute callback-style after hooks', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      let hookExecuted = false;
      
      remotes.after('test.method', function(ctx, next) {
        hookExecuted = true;
        ctx.result = ctx.result + ' modified';
        next();
      });
      
      const method = {
        name: 'method',
        sharedClass: { name: 'test' },
        isStatic: true
      };
      const ctx = { result: 'original' };
      
      remotes.execHooks('after', method, {}, ctx, function(err) {
        expect(err).to.be.undefined;
        assert.strictEqual(hookExecuted, true);
        assert.strictEqual(ctx.result, 'original modified');
        done();
      });
      }); // End of Promise
    }); // End of it

    it('should handle callback-style hook errors', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      remotes.before('test.method', function(ctx, next) {
        next(new Error('Hook error'));
      });
      
      const method = {
        name: 'method',
        sharedClass: { name: 'test' },
        isStatic: true
      };
      const ctx = {};
      
      remotes.execHooks('before', method, {}, ctx, function(err) {
        expect(err).to.be.an('error');
        assert.strictEqual(err.message, 'Hook error');
        done();
      });
      }); // End of Promise
    }); // End of it
  }); // End of describe

  describe('Async/await hooks (new functionality)', function() {
    it('should execute async before hooks', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      let hookExecuted = false;
      
      remotes.before('test.method', async function(ctx) {
        await new Promise(resolve => setTimeout(resolve, 10));
        hookExecuted = true;
        ctx.hookData = 'async-before';
      });
      
      const method = {
        name: 'method',
        sharedClass: { name: 'test' },
        isStatic: true
      };
      const ctx = {};
      
      remotes.execHooks('before', method, {}, ctx, function(err) {
        expect(err).to.be.undefined;
        assert.strictEqual(hookExecuted, true);
        assert.strictEqual(ctx.hookData, 'async-before');
        done();
      });
      }); // End of Promise
    }); // End of it

    it('should execute Promise-returning hooks', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      let hookExecuted = false;
      
      remotes.before('test.method', function(ctx) {
        return new Promise((resolve) => {
          setTimeout(() => {
            hookExecuted = true;
            ctx.hookData = 'promise-before';
            resolve();
          }, 10);
        });
      });
      
      const method = {
        name: 'method',
        sharedClass: { name: 'test' },
        isStatic: true
      };
      const ctx = {};
      
      remotes.execHooks('before', method, {}, ctx, function(err) {
        expect(err).to.be.undefined;
        assert.strictEqual(hookExecuted, true);
        assert.strictEqual(ctx.hookData, 'promise-before');
        done();
      });
      }); // End of Promise
    }); // End of it

    it('should handle async hook errors', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      remotes.before('test.method', async function(ctx) {
        await new Promise(resolve => setTimeout(resolve, 10));
        throw new Error('Async hook error');
      });
      
      const method = {
        name: 'method',
        sharedClass: { name: 'test' },
        isStatic: true
      };
      const ctx = {};
      
      remotes.execHooks('before', method, {}, ctx, function(err) {
        expect(err).to.be.an('error');
        assert.strictEqual(err.message, 'Async hook error');
        done();
      });
      }); // End of Promise
    }); // End of it

    it('should handle Promise rejection', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      remotes.before('test.method', function(ctx) {
        return Promise.reject(new Error('Promise rejection'));
      });
      
      const method = {
        name: 'method',
        sharedClass: { name: 'test' },
        isStatic: true
      };
      const ctx = {};
      
      remotes.execHooks('before', method, {}, ctx, function(err) {
        expect(err).to.be.an('error');
        assert.strictEqual(err.message, 'Promise rejection');
        done();
      });
      }); // End of Promise
    }); // End of it
  }); // End of describe

  describe('Synchronous hooks', function() {
    it('should execute synchronous hooks', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      let hookExecuted = false;
      
      remotes.before('test.method', function(ctx) {
        hookExecuted = true;
        ctx.hookData = 'sync-before';
      });
      
      const method = {
        name: 'method',
        sharedClass: { name: 'test' },
        isStatic: true
      };
      const ctx = {};
      
      remotes.execHooks('before', method, {}, ctx, function(err) {
        expect(err).to.be.undefined;
        assert.strictEqual(hookExecuted, true);
        assert.strictEqual(ctx.hookData, 'sync-before');
        done();
      });
      }); // End of Promise
    }); // End of it

    it('should handle synchronous hook errors', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      remotes.before('test.method', function(ctx) {
        throw new Error('Sync hook error');
      });
      
      const method = {
        name: 'method',
        sharedClass: { name: 'test' },
        isStatic: true
      };
      const ctx = {};
      
      remotes.execHooks('before', method, {}, ctx, function(err) {
        expect(err).to.be.an('error');
        assert.strictEqual(err.message, 'Sync hook error');
        done();
      });
      }); // End of Promise
    }); // End of it
  }); // End of describe

  describe('Mixed hook types', function() {
    it('should execute multiple hooks of different types in order', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      const executionOrder = [];
      
      // Callback-style hook
      remotes.before('test.method', function(ctx, next) {
        setTimeout(() => {
          executionOrder.push('callback');
          ctx.data = (ctx.data || '') + 'callback-';
          next();
        }, 20);
      });
      
      // Async hook
      remotes.before('test.method', async function(ctx) {
        await new Promise(resolve => setTimeout(resolve, 10));
        executionOrder.push('async');
        ctx.data = (ctx.data || '') + 'async-';
      });
      
      // Synchronous hook
      remotes.before('test.method', function(ctx) {
        executionOrder.push('sync');
        ctx.data = (ctx.data || '') + 'sync-';
      });
      
      // Promise hook
      remotes.before('test.method', function(ctx) {
        return new Promise(resolve => {
          setTimeout(() => {
            executionOrder.push('promise');
            ctx.data = (ctx.data || '') + 'promise';
            resolve();
          }, 5);
        });
      });
      
      const method = {
        name: 'method',
        sharedClass: { name: 'test' },
        isStatic: true
      };
      const ctx = {};
      
      remotes.execHooks('before', method, {}, ctx, function(err) {
        expect(err).to.be.undefined;
        expect(executionOrder).to.deep.equal(['callback', 'async', 'sync', 'promise']);
        assert.strictEqual(ctx.data, 'callback-async-sync-promise');
        done();
      });
      }); // End of Promise
    }); // End of it

    it('should stop execution on first error', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      const executionOrder = [];
      
      remotes.before('test.method', function(ctx, next) {
        executionOrder.push('first');
        next();
      });
      
      remotes.before('test.method', async function(ctx) {
        executionOrder.push('second');
        throw new Error('Second hook error');
      });
      
      remotes.before('test.method', function(ctx, next) {
        executionOrder.push('third'); // Should not execute
        next();
      });
      
      const method = {
        name: 'method',
        sharedClass: { name: 'test' },
        isStatic: true
      };
      const ctx = {};
      
      remotes.execHooks('before', method, {}, ctx, function(err) {
        expect(err).to.be.an('error');
        assert.strictEqual(err.message, 'Second hook error');
        expect(executionOrder).to.deep.equal(['first', 'second']);
        done();
      });
      }); // End of Promise
    }); // End of it
  }); // End of describe

  describe('Hook patterns and wildcards', function() {
    it('should execute hooks with wildcard patterns', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      let hookExecuted = false;
      
      remotes.before('test.*', async function(ctx) {
        hookExecuted = true;
        ctx.wildcardHook = true;
      });
      
      const method = {
        name: 'anyMethod',
        sharedClass: { name: 'test' },
        isStatic: true
      };
      const ctx = {};
      
      remotes.execHooks('before', method, {}, ctx, function(err) {
        expect(err).to.be.undefined;
        assert.strictEqual(hookExecuted, true);
        assert.strictEqual(ctx.wildcardHook, true);
        done();
      });
      }); // End of Promise
    }); // End of it

    it('should execute hooks with double wildcard patterns', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      let hookExecuted = false;
      
      remotes.before('**', async function(ctx) {
        hookExecuted = true;
        ctx.globalHook = true;
      });
      
      const method = {
        name: 'method',
        sharedClass: { name: 'any' },
        isStatic: false
      };
      const ctx = {};
      
      remotes.execHooks('before', method, {}, ctx, function(err) {
        expect(err).to.be.undefined;
        assert.strictEqual(hookExecuted, true);
        assert.strictEqual(ctx.globalHook, true);
        done();
      });
      }); // End of Promise
    }); // End of it
  }); // End of describe
}); // End of main describe
