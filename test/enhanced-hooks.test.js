// Copyright IBM Corp. 2024. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

const expect = require('chai').expect;
const RemoteObjects = require('../');

describe('Enhanced Hook System', function() {
  let remotes;

  beforeEach(function() {
    remotes = RemoteObjects.create();
  });

  describe('Callback-style hooks (backward compatibility)', function() {
    it('should execute callback-style before hooks', function(done) {
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
        expect(hookExecuted).to.be.true;
        expect(ctx.hookData).to.equal('callback-before');
        done();
      });
    });

    it('should execute callback-style after hooks', function(done) {
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
        expect(hookExecuted).to.be.true;
        expect(ctx.result).to.equal('original modified');
        done();
      });
    });

    it('should handle callback-style hook errors', function(done) {
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
        expect(err.message).to.equal('Hook error');
        done();
      });
    });
  });

  describe('Async/await hooks (new functionality)', function() {
    it('should execute async before hooks', function(done) {
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
        expect(hookExecuted).to.be.true;
        expect(ctx.hookData).to.equal('async-before');
        done();
      });
    });

    it('should execute Promise-returning hooks', function(done) {
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
        expect(hookExecuted).to.be.true;
        expect(ctx.hookData).to.equal('promise-before');
        done();
      });
    });

    it('should handle async hook errors', function(done) {
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
        expect(err.message).to.equal('Async hook error');
        done();
      });
    });

    it('should handle Promise rejection', function(done) {
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
        expect(err.message).to.equal('Promise rejection');
        done();
      });
    });
  });

  describe('Synchronous hooks', function() {
    it('should execute synchronous hooks', function(done) {
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
        expect(hookExecuted).to.be.true;
        expect(ctx.hookData).to.equal('sync-before');
        done();
      });
    });

    it('should handle synchronous hook errors', function(done) {
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
        expect(err.message).to.equal('Sync hook error');
        done();
      });
    });
  });

  describe('Mixed hook types', function() {
    it('should execute multiple hooks of different types in order', function(done) {
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
        expect(ctx.data).to.equal('callback-async-sync-promise');
        done();
      });
    });

    it('should stop execution on first error', function(done) {
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
        expect(err.message).to.equal('Second hook error');
        expect(executionOrder).to.deep.equal(['first', 'second']);
        done();
      });
    });
  });

  describe('Hook patterns and wildcards', function() {
    it('should execute hooks with wildcard patterns', function(done) {
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
        expect(hookExecuted).to.be.true;
        expect(ctx.wildcardHook).to.be.true;
        done();
      });
    });

    it('should execute hooks with double wildcard patterns', function(done) {
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
        expect(hookExecuted).to.be.true;
        expect(ctx.globalHook).to.be.true;
        done();
      });
    });
  });
});
