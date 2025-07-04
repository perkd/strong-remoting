// Copyright IBM Corp. 2013,2017. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

// Native Node.js test imports
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const RemoteObjects = require('../');
const express = require('express');
const SharedClass = require('../lib/shared-class');
const request = require('./helpers/native-http-test'); // Native HTTP testing

describe('strong-remoting-jsonrpc', function() {
  let app, server, objects, remotes;

  // Track all test servers for cleanup
  const testServers = [];

  // setup
  beforeEach(async function() {
    if (server) {
      await new Promise((resolve) => {
        server.close(() => {
          resolve();
        });
      });
      server = null;
    }
    objects = RemoteObjects.create({json: {limit: '1kb'}});
    remotes = objects.exports;
    app = express();
  });

  // cleanup
  afterEach(async function() {
    if (server) {
      await new Promise((resolve) => {
        server.close(() => {
          resolve();
        });
      });
      server = null;
    }
    if (objects) {
      objects = null;
    }
    if (remotes) {
      remotes = null;
    }
    if (app) {
      app = null;
    }
  });

  // Global cleanup for all test servers
  after(async function() {
    console.log('Cleaning up test servers...');
    for (const testServer of testServers) {
      if (testServer && !testServer.destroyed) {
        await new Promise((resolve) => {
          testServer.close(() => {
            resolve();
          });
        });
      }
    }
    testServers.length = 0;
    console.log('Test server cleanup completed');
  });

  describe('handlers', function() {
    describe('jsonrpc', function() {


      // Helper function to create test server
      function createTestServer(callback) {
        const testObjects = RemoteObjects.create({json: {limit: '1kb'}});
        const testApp = express();

        // Set up test classes using SharedClass
        function User() {}
        User.greet = function(msg, fn) {
          fn(null, msg);
        };
        const userClass = new SharedClass('user', User);
        userClass.defineMethod('greet', {
          isStatic: true,
          accepts: [{'arg': 'msg', 'type': 'string'}],
          returns: [{'arg': 'result', 'type': 'string'}]
        });
        testObjects.addClass(userClass);

        function Mathematic() {}
        Mathematic.sum = function(numA, numB, cb) {
          cb(null, numA + numB);
        };
        const mathematicClass = new SharedClass('mathematic', Mathematic);
        mathematicClass.defineMethod('sum', {
          isStatic: true,
          accepts: [
            {'arg': 'numA', 'type': 'number'},
            {'arg': 'numB', 'type': 'number'}
          ],
          returns: [{'arg': 'sum', 'type': 'number'}]
        });
        testObjects.addClass(mathematicClass);

        function Product() {}
        Product.getPrice = function(cb) {
          process.nextTick(function() {
            cb(null, 100);
          });
        };
        const productClass = new SharedClass('product', Product);
        productClass.defineMethod('getPrice', {
          isStatic: true,
          returns: [{'arg': 'price', 'type': 'number'}]
        });
        testObjects.addClass(productClass);

        testApp.use(testObjects.handler('jsonrpc'));

        const testServer = testApp.listen(0, function() {
          // Track server for cleanup
          testServers.push(testServer);
          callback(null, testServer);
        });

        testServer.on('error', callback);
      }

      // All tests now use inline servers, no global cleanup needed



      it('should support calling object methods', function(t) {
        return new Promise((resolve, reject) => {
          // Set up server inline for this test
          console.log('Setting up inline server...');

          const testObjects = RemoteObjects.create({json: {limit: '1kb'}});
          const testApp = express();

          // Set up test classes
          function User() {}
          User.greet = function(msg, fn) {
            fn(null, msg);
          };
          testObjects.exports.User = User;

          testApp.use(testObjects.handler('jsonrpc'));

          const testServer = testApp.listen(0, function() {
            console.log('Inline server started on port:', testServer.address().port);
            // Track server for cleanup
            testServers.push(testServer);

            const serverUrl = `http://localhost:${testServer.address().port}`;
            request(serverUrl).post('/User/jsonrpc')
              .set('Accept', 'application/json')
              .set('Content-Type', 'application/json')
              .send({'jsonrpc': '2.0', 'method': 'greet', 'params': ['hello'], 'id': 1})
              .expect('Content-Type', /json/)
              .expect(200)
              .end(function(err, res) {
                testServer.close((closeErr) => {
                  if (err || closeErr) {
                    reject(err || closeErr);
                  } else {
                    resolve();
                  }
                });
              });
          });

          testServer.on('error', function(err) {
            reject(err);
          });
        });
      });

      it('Should successfully call a method with named parameters', function(t) {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Test timeout after 5 seconds'));
          }, 5000);

          createTestServer(function(err, testServer) {
            if (err) {
              clearTimeout(timeout);
              return reject(err);
            }

            const serverUrl = `http://localhost:${testServer.address().port}`;
            const req = request(serverUrl).post('/mathematic/jsonrpc')
              .set('Accept', 'application/json')
              .set('Content-Type', 'application/json')
              .send({'jsonrpc': '2.0', 'method': 'sum', 'params': {'numB': 9, 'numA': 2}, 'id': 1})
              .expect('Content-Type', /json/)
              .expect(200)
              .expect({'jsonrpc': '2.0', 'id': 1, 'result': 11})
              .end(function(err, res) {
                clearTimeout(timeout);
                testServer.close((closeErr) => {
                  if (err || closeErr) {
                    reject(err || closeErr);
                  } else {
                    resolve();
                  }
                });
              });
          });
        });
      });

      it('should support a remote method using shared method', function(t) {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Test timeout after 5 seconds'));
          }, 5000);

          createTestServer(function(err, testServer) {
            if (err) {
              clearTimeout(timeout);
              return reject(err);
            }

            const serverUrl = `http://localhost:${testServer.address().port}`;
            const req = request(serverUrl).post('/product/jsonrpc')
              .set('Accept', 'application/json')
              .set('Content-Type', 'application/json')
              .send({'jsonrpc': '2.0', 'method': 'getPrice', 'params': [], 'id': 1})
              .expect('Content-Type', /json/)
              .expect(200)
              .expect({'jsonrpc': '2.0', 'id': 1, 'result': 100})
              .end(function(err, res) {
                clearTimeout(timeout);
                testServer.close((closeErr) => {
                  if (err || closeErr) {
                    reject(err || closeErr);
                  } else {
                    resolve();
                  }
                });
              });
          });
        });
      });

      it('should report error for non-existent methods', function(t) {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Test timeout after 5 seconds'));
          }, 5000);

          createTestServer(function(err, testServer) {
            if (err) {
              clearTimeout(timeout);
              return reject(err);
            }

            const serverUrl = `http://localhost:${testServer.address().port}`;
            const req = request(serverUrl).post('/user/jsonrpc')
              .set('Accept', 'application/json')
              .set('Content-Type', 'application/json')
              .send({'jsonrpc': '2.0', 'method': 'greet1', 'params': ['JS'], 'id': 1})
              .expect('Content-Type', /json/)
              .expect(200)
              .expect({
                'jsonrpc': '2.0',
                'id': 1,
                'error': {
                  'code': -32601,
                  'message': 'Method not found',
                },
              })
              .end(function(err, res) {
                clearTimeout(timeout);
                testServer.close((closeErr) => {
                  if (err || closeErr) {
                    reject(err || closeErr);
                  } else {
                    resolve();
                  }
                });
              });
          });
        });
      });

      // The 1kb limit is set by RemoteObjects.create({json: {limit: '1kb'}});
      it('should reject json payload larger than 1kb', function(t) {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Test timeout after 5 seconds'));
          }, 5000);

          createTestServer(function(err, testServer) {
            if (err) {
              clearTimeout(timeout);
              return reject(err);
            }

            const serverUrl = `http://localhost:${testServer.address().port}`;
            // Build an object that is larger than 1kb
            let name = '';
            for (let i = 0; i < 2048; i++) {
              name += '11111111111';
            }

            const req = request(serverUrl).post('/user/jsonrpc')
              .set('Accept', 'application/json')
              .set('Content-Type', 'application/json')
              .send({'jsonrpc': '2.0', 'method': 'greet', 'params': [name], 'id': 1})
              .expect(413)
              .end(function(err, res) {
                clearTimeout(timeout);
                testServer.close((closeErr) => {
                  if (err || closeErr) {
                    reject(err || closeErr);
                  } else {
                    resolve();
                  }
                });
              });
          });
        });
      });
    }); // End of inner describe (jsonrpc)
  }); // End of describe (handlers)
}); // End of main describe
