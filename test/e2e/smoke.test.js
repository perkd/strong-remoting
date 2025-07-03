// Copyright IBM Corp. 2014,2017. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

// Native Node.js test imports
const { describe, it } = require('node:test');
const assert = require('node:assert');

const RemoteObjects = require('../../');
const { expect } = require('../test-config'); // Use native expect interface
const REMOTE_URL = 'http://localhost:3000';
const remotes = require('./fixtures/remotes');

remotes.connect(REMOTE_URL, 'rest');

describe('smoke test', function() {
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
