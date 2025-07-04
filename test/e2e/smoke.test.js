// Copyright IBM Corp. 2014,2017. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

// Native Node.js test imports
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

const RemoteObjects = require('../../');
const { expect } = require('../test-config'); // Use native expect interface
const testServer = require('../helpers/test-server');
const REMOTE_URL = 'http://localhost:3000';
const remotes = require('./fixtures/remotes');

describe('smoke test', function() {
  before(function(t) {
    return new Promise((resolve, reject) => {
      console.log('Connecting to E2E server...');
      // Assume server is already running, just connect remotes
      try {
        remotes.connect(REMOTE_URL, 'rest');
        console.log('Remotes connected successfully to', REMOTE_URL);
        resolve();
      } catch (connectErr) {
        console.error('Failed to connect remotes:', connectErr);
        reject(connectErr);
      }
    });
  });

  describe('remote.invoke()', function() {
    it('invokes a remote static method', function(t) {
      return new Promise((resolve, reject) => {
        remotes.invoke(
          'User.login',
          [{username: 'joe', password: 'secret'}],
          function(err, session) {
            try {
              assert.strictEqual(err, null, 'Expected no error');
              assert.strictEqual(session.userId, 123, 'Expected userId to be 123');
              resolve();
            } catch (assertionError) {
              reject(assertionError);
            }
          },
        );
      });
    });
  });
});
