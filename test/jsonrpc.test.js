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

  // setup
  beforeEach(function() {
    if (server) server.close();
    objects = RemoteObjects.create({json: {limit: '1kb'}});
    remotes = objects.exports;
    app = express();
  });

  function jsonrpc(url, method, parameters) {
    return request(app).post(url)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .send({'jsonrpc': '2.0', 'method': method, 'params': parameters, 'id': 1})
      .expect('Content-Type', /json/);
  }

  describe('handlers', function() {
    describe('jsonrpc', function() {
      beforeEach(function() {
        app.use(function(req, res, next) {
          // create the handler for each request
          objects.handler('jsonrpc').apply(objects, arguments);
        });
        function greet(msg, fn) {
          fn(null, msg);
        }
        greet.accepts = [
          {'arg': 'msg', 'type': 'string'},
        ];

        // Create a shared method directly on the function object
        remotes.user = {
          greet: greet,
        };
        greet.shared = true;

        // Create a shared method directly on the function object for named parameters tests
        function sum(numA, numB, cb) {
          cb(null, numA + numB);
        }
        remotes.mathematic = {
          sum: sum,
        };
        sum.accepts = [
          {'arg': 'numA', 'type': 'number'},
          {'arg': 'numB', 'type': 'number'},
        ];
        sum.shared = true;
        sum.returns = {
          'arg': 'sum',
          'type': 'number',
        };
        sum.shared = true;

        // Create a shared method using SharedClass/SharedMethod
        function Product() {
        }

        Product.getPrice = function(cb) {
          process.nextTick(function() {
            return cb(null, 100);
          });
        };

        const productClass = new SharedClass('product', Product);
        productClass.defineMethod('getPrice', {isStatic: true});
        objects.addClass(productClass);
      });

      it('should support calling object methods', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
        jsonrpc('/user/jsonrpc', 'greet', ['JS'])
          .expect({'jsonrpc': '2.0', 'id': 1, 'result': 'JS'}, done);
      }); // End of Promise
    }); // End of it

      it('Should successfully call a method with named parameters', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
        jsonrpc('/mathematic/jsonrpc', 'sum', {'numB': 9, 'numA': 2})
          .expect({'jsonrpc': '2.0', 'id': 1, 'result': 11}, done);
      }); // End of Promise
    }); // End of it

      it('should support a remote method using shared method', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
        jsonrpc('/product/jsonrpc', 'getPrice', [])
          .expect({'jsonrpc': '2.0', 'id': 1, 'result': 100}, done);
      }); // End of Promise
    }); // End of it

      it('should report error for non-existent methods', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
        jsonrpc('/user/jsonrpc', 'greet1', ['JS'])
          .expect({
            'jsonrpc': '2.0',
            'id': 1,
            'error': {
              'code': -32601,
              'message': 'Method not found',
            },
          }, done);
      }); // End of Promise
    }); // End of it

      // The 1kb limit is set by RemoteObjects.create({json: {limit: '1kb'}});
      it('should reject json payload larger than 1kb', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
        // Build an object that is larger than 1kb
        let name = '';
        for (let i = 0; i < 2048; i++) {
          name += '11111111111';
        }

        jsonrpc('/user/jsonrpc', 'greet', [name])
          .expect(413, done);
      }); // End of Promise
    }); // End of it
    }); // End of inner describe (jsonrpc)
  }); // End of describe (handlers)
}); // End of main describe
