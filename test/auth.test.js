// Copyright IBM Corp. 2015,2017. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

// Native Node.js test imports
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const auth = require('http-auth');
const crypto = require('crypto');
const { expect } = require('./test-config'); // Use native expect interface
const express = require('express');
const fmt = require('util').format;

const RemoteObjects = require('../');
const User = require('./e2e/fixtures/user');

describe('support for HTTP Authentication', function() {
  let server;
  let remotes;

  // Create a fresh remotes instance for the server setup
  before(function() {
    remotes = RemoteObjects.create();
    remotes.exports.User = User;
  });

  before(async function setupServer() {
    const app = express();

    // Simple test route first
    app.get('/test', (req, res) => {
      res.json({ message: 'Server is working' });
    });

    try {
      const basic = auth.basic({realm: 'testing'}, function(u, p, cb) {
        cb(u === 'basicuser' && p === 'basicpass');
      });
      const digest = auth.digest({realm: 'testing'}, function(user, cb) {
        cb(user === 'digestuser' ? md5('digestuser:testing:digestpass') : null);
      });

      app.use('/noAuth', remotes.handler('rest'));
      app.use('/basicAuth', auth.connect(basic), remotes.handler('rest'));
      app.use('/digestAuth', auth.connect(digest), remotes.handler('rest'));
      app.use('/bearerAuth', bearerMiddleware('bearertoken'), remotes.handler('rest'));
    } catch (error) {
      console.error('Auth setup failed:', error);
      throw error;
    }

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

  beforeEach(function() {
    // Create a completely fresh remotes instance for each test to avoid state pollution
    remotes = RemoteObjects.create();
    remotes.exports.User = User;
  });

  afterEach(async function() {
    // Clean up any test-specific state
    if (remotes) {
      // Clear auth to prevent state leakage
      remotes.auth = null;
      // Clear the server adapter to prevent reuse
      remotes.serverAdapter = null;

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
    remotes = null;

    // Give a small delay to allow connections to fully close
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  after(async function teardownServer() {
    // Give a small delay to allow any pending requests to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            console.error('Error closing server:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      });

      // Force close any remaining connections
      if (server.closeAllConnections) {
        server.closeAllConnections();
      }

      server = null;
    }
  });

  describe('when no authentication is required', function() {
    it('succeeds without credentials',
      succeeds('/noAuth'));
    it('succeeds with credentials',
      succeeds('/noAuth', 'extrauser:extrapass'));
  });

  describe('when Basic auth is required', function() {
    it('succeeds with correct credentials',
      succeeds('/basicAuth', 'basicuser:basicpass'));
    it('fails when bad credentials are given',
      fails('/basicAuth', 'baduser:badpass'));
    it('fails when no credentials are given',
      fails('/basicAuth'));
  });

  describe('when Digest auth is required', function() {
    it('succeeds with correct credentials',
      succeeds('/digestAuth', 'digestuser:digestpass'));
    it('fails with bad credentials',
      fails('/digestAuth', 'baduser:badpass'));
    it('fails with no credentials',
      fails('/digestAuth'));
  });

  describe('when Bearer auth is required', function() {
    it('succeeds with correct credentials',
      succeeds('/bearerAuth', {bearer: 'bearertoken'}));
    it('fails with bad credentials',
      fails('/bearerAuth', {bearer: 'badtoken'}));
    it('fails with no credentials',
      fails('/bearerAuth'));
  });

  describe('remotes.auth', function() {
    it('should be populated from the url', function() {
      const url = 'http://login:pass@myhost.com';
      remotes.connect(url, 'rest');
      expect(remotes.auth.username).to.eql('login');
      expect(remotes.auth.password).to.eql('pass');
    });
  });

  function succeeds(path, credentials) {
    return function(done) {
      let callbackCalled = false;
      invokeRemote(server.address().port, path, credentials,
        function(err, session) {
          if (callbackCalled) return; // Prevent multiple calls
          callbackCalled = true;
          assert.strictEqual(err, null, 'Expected no error');
          assert.strictEqual(session.userId, 123);
          done();
        });
    };
  }

  function fails(path, credentials) {
    return function(done) {
      let callbackCalled = false;
      invokeRemote(server.address().port, path, credentials,
        function(err, session) {
          if (callbackCalled) return; // Prevent multiple calls
          callbackCalled = true;
          expect(err).to.match(/401/);
          done();
        });
    };
  }

  function invokeRemote(port, path, credentials, callback) {
    let auth, split;

    if (typeof credentials === 'string') {
      split = credentials && credentials.split(':');
      if (split && split.length === 2) {
        auth = {
          username: split[0],
          password: split[1],
        };
      }
    } else if (credentials && typeof credentials === 'object') {
      auth = credentials;
    }

    const url = fmt('http://127.0.0.1:%d%s', port, path);
    const method = 'User.login';
    const args = [{username: 'joe', password: 'secret'}]; // Method arguments
    remotes.connect(url, 'rest');
    remotes.auth = auth;
    remotes.invoke(method, args, callback);
  }
});

function md5(str) {
  const hash = crypto.createHash('md5');
  hash.update(str);
  return hash.digest('hex');
}

function bearerMiddleware(token) {
  return function(req, res, next) {
    const authorization = req.headers.authorization;
    const AUTH_METHOD = 'Bearer';
    const providedAuthMethodIsBearer = authorization &&
        authorization.indexOf(AUTH_METHOD) === 0;
    const providedToken = authorization &&
      authorization.substr((AUTH_METHOD + ' ').length);

    if (!authorization || !providedAuthMethodIsBearer) {
      res.status(401).set('WWW-Authenticate', AUTH_METHOD).end();
      return;
    }

    if (providedToken === token) {
      return next();
    }

    res.status(401).end();
  };
}
