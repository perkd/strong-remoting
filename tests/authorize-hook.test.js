// Copyright IBM Corp. 2015,2018. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

// Native Node.js test imports
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const express = require('express');
const RemoteObjects = require('../');
const User = require('./e2e/fixtures/user');
const fmt = require('util').format;

describe('authorization hook', function() {
  let server, remotes;

  // Create a fresh remotes instance for the server setup
  before(async function setupServer() {
    const app = express();
    remotes = RemoteObjects.create();
    remotes.exports.User = User;
    app.use(remotes.handler('rest'));

    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', function(err) {
        if (err) {
          console.error('Server setup failed:', err);
          return reject(err);
        }
        resolve();
      });
    });
  });

  after(async function teardownServer() {
    // Clean up remotes connections first
    if (remotes) {
      // Clear auth to prevent state leakage
      remotes.auth = null;

      // Properly disconnect and clean up HTTP connections
      if (remotes.disconnect) {
        remotes.disconnect();
      }

      // Force cleanup of any remaining HTTP connections
      if (remotes._adapter && remotes._adapter.client) {
        const client = remotes._adapter.client;
        if (client.destroy) {
          client.destroy();
        }
      }
    }

    // Close server
    await new Promise((resolve) => {
      server.close((err) => {
        if (err) {
          console.error('Error closing authorize-hook test server:', err);
        }

        // Force close any remaining connections
        if (server.closeAllConnections) {
          server.closeAllConnections();
        }

        // Small delay to ensure cleanup completes
        setTimeout(resolve, 10);
      });
    });
  });

  describe('given a remotes object with an authorization hook', function() {
    it('should be called when a remote method is invoked', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      const callStack = [];
      remotes.authorization = function(ctx, next) {
        callStack.push('authorization');
        next();
      };

      remotes.before('User.login', function(ctx, next) {
        callStack.push('before');
        next();
      });

      invokeRemote(server.address().port,
        function(err, session) {
          try {
            assert.strictEqual(err, null);
            assert.strictEqual(session.userId, 123);
            //                        vvvvvvvv - local before hook
            assert.deepStrictEqual(callStack, ['before', 'authorization', 'before']);
            done();
          } catch (assertionError) {
            done(assertionError);
          }
        });
      }); // End of Promise
    }); // End of it
  }); // End of describe

  function invokeRemote(port, callback) {
    const url = 'http://127.0.0.1:' + port;
    const method = 'User.login';
    const args = [{username: 'joe', password: 'secret'}]; // Method arguments

    remotes.connect(url, 'rest');
    remotes.invoke(method, args, callback);
  }
}); // End of main describe
