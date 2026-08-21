// Copyright IBM Corp. 2013,2018. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

const {
  describe,
  it,
  before,
  after,
  beforeEach,
  afterEach,
} = require('node:test');
const assert = require('assert');
const inherits = require('util').inherits;
const RemoteObjects = require('../');
const SharedClass = RemoteObjects.SharedClass;
const express = require('express');
const request = require('./helpers/native-http-test');
const factory = require('./helpers/shared-objects-factory.js');
const Readable = require('stream').Readable;

const ACCEPT_XML_OR_ANY = 'application/xml,*/*;q=0.8';
const TEST_ERROR = new Error('expected test error');

describe('strong-remoting-rest', function() {
  let app, appSupportingJsonOnly, server, serverJsonOnly, objects, remotes, lastRequest, lastResponse,
    restHandlerOptions;
  const adapterName = 'rest';

  before(function() {
    return new Promise(resolve => {
      app = express();
      app.disable('x-powered-by');
      app.use(function(req, res, next) {
        // create the handler for each request
        const handler = objects.handler(adapterName, restHandlerOptions);
        handler.apply(objects, arguments);
        lastRequest = req;
        lastResponse = res;
      });
      server = app.listen(resolve);
    });
  });

  before(function() {
    return new Promise(resolve => {
      appSupportingJsonOnly = express();
      appSupportingJsonOnly.use(function(req, res, next) {
        // create the handler for each request
        const supportedTypes = ['json', 'application/javascript', 'text/javascript'];
        const opts = {supportedTypes: supportedTypes};
        objects.handler(adapterName, opts).apply(objects, arguments);
      });
      serverJsonOnly = appSupportingJsonOnly.listen(resolve);
    });
  });

  // setup
  beforeEach(function() {
    restHandlerOptions = undefined;

    objects = RemoteObjects.create({
      json: {limit: '1kb'},
      errorHandler: {debug: true, log: false},
      types: {warnOnUnknownType: false},
    });
    remotes = objects.exports;

    // connect to the app
    objects.connect('http://localhost:' + server.address().port, adapterName);
  });

  afterEach(function() {
    if (objects) {
      // Clear auth to prevent state leakage
      objects.auth = null;

      // Properly disconnect and clean up HTTP connections
      if (objects.disconnect) {
        objects.disconnect();
      }

      // Force cleanup of any remaining HTTP connections
      if (objects._adapter && objects._adapter.client) {
        const client = objects._adapter.client;
        if (client.destroy) {
          client.destroy();
        }
      }
    }
  });

  before(() => {
    process.on('unhandledRejection', unhandledRejection);
  });

  after(() => {
    process.removeListener('unhandledRejection', unhandledRejection);
  });

  after(function() {
    return new Promise((resolve) => {
      let closedCount = 0;
      const totalServers = 2;

      function checkComplete() {
        closedCount++;
        if (closedCount >= totalServers) {
          resolve();
        }
      }

      // Close main server
      if (server) {
        server.close((err) => {
          if (err) {
            console.error('Error closing rest test server:', err);
          }

          // Force close any remaining connections
          if (server.closeAllConnections) {
            server.closeAllConnections();
          }

          server = null;
          checkComplete();
        });
      } else {
        checkComplete();
      }

      // Close JSON-only server
      if (serverJsonOnly) {
        serverJsonOnly.close((err) => {
          if (err) {
            console.error('Error closing JSON-only test server:', err);
          }

          // Force close any remaining connections
          if (serverJsonOnly.closeAllConnections) {
            serverJsonOnly.closeAllConnections();
          }

          serverJsonOnly = null;
          checkComplete();
        });
      } else {
        checkComplete();
      }
    });
  });

  function json(method, url) {
    if (url === undefined) {
      url = method;
      method = 'get';
    }

    return request(app)[method](url)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .expect('Content-Type', /json/);
  }

  function xml(method, url) {
    if (url === undefined) {
      url = method;
      method = 'get';
    }

    return request(app)[method](url)
      .set('Accept', 'application/xml')
      .set('Content-Type', 'application/xml')
      .expect('Content-Type', /xml/);
  }

  describe('remoting options', function() {
    // The 1kb limit is set by RemoteObjects.create({json: {limit: '1kb'}});
    it('should reject json payload larger than 1kb', async function() {
      const method = givenSharedStaticMethod(
        function greet(msg, cb) {
          cb(null, msg);
        },
        {
          accepts: {arg: 'person', type: 'string', http: {source: 'body'}},
          returns: {arg: 'msg', type: 'string'},
        },
      );

      // Build an object that is larger than 1kb
      let name = '';
      for (let i = 0; i < 2048; i++) {
        name += '11111111111';
      }

      await request(app).post(method.url)
        .set('Accept', 'application/json')
        .set('Content-Type', 'application/json')
        .send(name)
        .expect(413);
    });

    it('should allow custom error handlers', async function() {
      let called = false;
      const method = givenSharedStaticMethod(
        function(cb) {
          cb(new Error('foo'));
        },
      );

      objects.options.errorHandler.handler = function(err, req, res, next) {
        assert(err.message.includes('foo'));
        err = new Error('foobar');
        called = true;
        next(err);
      };

      await request(app).get(method.url)
        .expect('Content-Type', /json/)
        .expect(500)
        .end(expectErrorResponseContaining({message: 'foobar'}, function(err) {
          assert.strictEqual(called, true);
        }));
    });

    it('should exclude stack traces by default', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function(cb) { cb(new Error('test-error')); },
        );

        // reset the errorHandler options
        objects.options.errorHandler = {};

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        request(app).get(method.url)
          .expect('Content-Type', /json/)
          .expect(500)
          .end(expectErrorResponseContaining(
            {message: 'Internal Server Error'}, ['stack'], done,
          ));
      });
    });

    it('should turn off url-not-found handler', async function() {
      objects.options.rest = {handleUnknownPaths: false};
      app.use(function(req, res, next) {
        res.status(404).send('custom-not-found');
      });

      await request(app).get('/thisUrlDoesNotExists/someMethod')
        .expect(404)
        .expect('custom-not-found');
    });

    it('should turn off method-not-found handler', async function() {
      const method = givenSharedStaticMethod();

      objects.options.rest = {handleUnknownPaths: false};
      app.use(function(req, res, next) {
        res.send(404, 'custom-not-found');
      });

      await request(app).get(method.classUrl + '/thisMethodDoesNotExist')
        .expect(404)
        .expect('custom-not-found');
    });

    it('should by default use defined error handler', async function() {
      app.use(function(err, req, res, next) {
        res.send('custom-error-handler-called');
      });

      const res = await request(app).get('/thisUrlDoesNotExists/someMethod')
        .expect(404);
      assert.notStrictEqual(res.text, 'custom-error-handler-called');
    });

    it('should turn off error handler', async function() {
      objects.options.rest = {handleErrors: false};
      app.use(function(err, req, res, next) {
        res.send('custom-error-handler-called');
      });

      await request(app).get('/thisUrlDoesNotExists/someMethod')
        .expect(200)
        .expect('custom-error-handler-called');
    });

    it('should configure custom REST content types', async function() {
      const supportedTypes = ['json', 'application/javascript', 'text/javascript'];
      objects.options.rest = {supportedTypes: supportedTypes};

      const method = givenSharedStaticMethod(
        function(cb) {
          cb(null, {key: 'value'});
        },
        {
          returns: {arg: 'result', type: 'object'},
        },
      );

      const browserAcceptHeader = [
        'text/html',
        'application/xhtml+xml',
        'application/xml;q=0.9',
        'image/webp',
        '*/*;q=0.8',
      ].join(',');

      await request(app).get(method.url)
        .set('Accept', browserAcceptHeader)
        .expect('Content-Type', 'application/json; charset=utf-8')
        .expect(200);
    });

    it('should disable XML content types by default', async function() {
      delete objects.options.rest;

      const method = givenSharedStaticMethod(
        function(cb) { cb(null, {key: 'value'}); },
        {returns: {arg: 'result', type: 'object'}},
      );

      await request(app).get(method.url)
        .set('Accept', ACCEPT_XML_OR_ANY)
        .expect(200)
        .expect('Content-Type', /json/);
    });

    it('should enable XML types via `options.rest.xml`', async function() {
      objects.options.rest = {xml: true};

      const method = givenSharedStaticMethod(
        function(value, cb) { cb(null, {key: value}); },
        {
          accepts: {arg: 'value', type: 'string'},
          returns: {arg: 'result', type: 'object'},
        },
      );

      const res = await request(app).post(method.url)
        .set('Accept', ACCEPT_XML_OR_ANY)
        .set('Content-Type', 'application/json')
        .send({value: 'some-value'})
        .expect(200)
        .expect('Content-Type', /xml/);
      assert.strictEqual(res.text.replace(/>\s+</mg, '><'),
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<response><result><key>some-value</key></result></response>');
    });

    it('should enable XML via `options.rest.supportedTypes`', async function() {
      objects.options.rest = {supportedTypes: ['application/xml']};

      const method = givenSharedStaticMethod(
        function(cb) { cb(null, 'value'); },
        {returns: {arg: 'result', type: 'object'}},
      );

      await request(app).post(method.url)
        .set('Accept', ACCEPT_XML_OR_ANY)
        .expect(200)
        .expect('Content-Type', /xml/);
    });

    it('should treat application/vnd.api+json accept header correctly', async function() {
      objects.options.rest = {supportedTypes: ['application/vnd.api+json']};

      const method = givenSharedStaticMethod(
        function(cb) { cb(null, {value: 'value'}); },
        {returns: {arg: 'result', type: 'object'}},
      );

      const res = await request(app).get(method.url)
        .set('Accept', 'application/vnd.api+json')
        .expect(200)
        .expect('Content-Type', /application\/vnd\.api\+json/);
      assert.deepStrictEqual(JSON.parse(res.text), {result: {value: 'value'}});
    });
  });

  describe('CORS', function() {
    let method;
    beforeEach(function() {
      method = givenSharedStaticMethod(
        function greet(person, cb) {
          if (person === 'error') {
            const err = new Error('error');
            err.statusCode = 400;
            cb(err);
          } else {
            cb(null, 'hello');
          }
        },
        {
          accepts: {arg: 'person', type: 'string'},
          returns: {arg: 'msg', type: 'string'},
        },
      );
    });

    it('should reject cross-origin requests', async function() {
      const res = await request(app).post(method.url)
        .set('Accept', 'application/json')
        .set('Content-Type', 'application/json')
        .set('Origin', 'http://localhost:3001')
        .send({person: 'ABC'})
        .expect(200);
      const headers = Object.keys(res.headers);
      assert(!headers.includes('access-control-allow-origin'));
      assert(!headers.includes('access-control-allow-credentials'));
    });

    it('should reject preflight (OPTIONS) requests', async function() {
      const res = await request(app).options(method.url)
        .set('Accept', 'application/json')
        .set('Content-Type', 'application/json')
        .set('Origin', 'http://localhost:3001');

      // Check that CORS headers are not present (indicating CORS is disabled)
      assert.strictEqual(res.headers['access-control-allow-origin'], undefined);
      assert.strictEqual(res.headers['access-control-allow-credentials'], undefined);
    });
  });

  function enableXmlSupport() {
    objects.options.rest = objects.options.rest || {};
    objects.options.rest.xml = true;
  }

  describe('call of constructor method', function() {
    beforeEach(enableXmlSupport);

    it('should work', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function greet(msg, cb) {
            cb(null, msg);
          },
          {
            accepts: {arg: 'person', type: 'string'},
            returns: {arg: 'msg', type: 'string'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.url + '?person=hello')
          .expect(200, {msg: 'hello'}, done);
      });
    });

    it('should honor Accept: header', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function greet2(msg, cb) {
            cb(null, msg);
          },
          {
            accepts: {arg: 'person', type: 'string'},
            returns: {arg: 'msg', type: 'string'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        xml(method.url + '?person=hello')
          .expect(200, '<?xml version="1.0" encoding="UTF-8"?>\n<response>\n  ' +
            '<msg>hello</msg>\n</response>', done);
      });
    });

    it('should handle returns of array', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function greet3(msg, cb) {
            cb(null, [msg]);
          },
          {
            accepts: {arg: 'person', type: ['string']},
            returns: {arg: 'msg', type: 'string'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        xml(method.url + '?person=["hello"]')
          .expect(200, '<?xml version="1.0" encoding="UTF-8"?>\n<response>\n  ' +
            '<msg>hello</msg>\n</response>', done);
      });
    });

    it('should handle returns of array to XML', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function greet4(msg, cb) {
            cb(null, [msg]);
          },
          {
            accepts: {arg: 'person', type: ['string']},
            returns: {arg: 'msg', type: ['string'], root: true},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        xml(method.url + '?person=["hello"]')
          .expect(200, '<?xml version="1.0" encoding="UTF-8"?>\n<response>\n  ' +
            '<result>hello</result>\n</response>', done);
      });
    });

    it('should allow arguments in the path', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function bar(a, b, cb) {
            cb(null, a + b);
          },
          {
            accepts: [
              {arg: 'b', type: 'number'},
              {arg: 'a', type: 'number', http: {source: 'path'}},
            ],
            returns: {arg: 'n', type: 'number'},
            http: {path: '/:a'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.classUrl + '/1?b=2')
          .expect({n: 3}, done);
      });
    });

    it('should allow arguments in the query', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function bar(a, b, cb) {
            cb(null, a + b);
          },
          {
            accepts: [
              {arg: 'b', type: 'number'},
              {arg: 'a', type: 'number', http: {source: 'query'}},
            ],
            returns: {arg: 'n', type: 'number'},
            http: {path: '/'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.classUrl + '/?a=1&b=2')
          .expect({n: 3}, done);
      });
    });

    it('should allow string[] arg in the query', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function bar(a, b, cb) {
            cb(null, b.join('') + a);
          },
          {
            accepts: [
              {arg: 'a', type: 'string'},
              {arg: 'b', type: ['string'], http: {source: 'query'}},
            ],
            returns: {arg: 'n', type: 'string'},
            http: {path: '/'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.classUrl + '/?a=z&b[0]=x&b[1]=y')
          .expect({n: 'xyz'}, done);
      });
    });

    it('should allow string[] arg in the query with stringified value',
      function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function bar(a, b, cb) {
              cb(null, b.join('') + a);
            },
            {
              accepts: [
                {arg: 'a', type: 'string'},
                {arg: 'b', type: ['string'], http: {source: 'query'}},
              ],
              returns: {arg: 'n', type: 'string'},
              http: {path: '/'},
            },
          );

          const done = (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          };

          json(method.classUrl + '/?a=z&b=["x", "y"]')
            .expect({n: 'xyz'}, done);
        });
      });

    it('should allow custom argument functions', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function bar(a, b, cb) {
            cb(null, a + b);
          },
          {
            accepts: [
              {arg: 'b', type: 'number'},
              {arg: 'a', type: 'number', http: function(ctx) {
                return +ctx.req.query.a;
              }},
            ],
            returns: {arg: 'n', type: 'number'},
            http: {path: '/'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.classUrl + '/?a=1&b=2')
          .expect({n: 3}, done);
      });
    });

    it('should pass undefined if the argument is not supplied', function(t) {
      return new Promise((resolve, reject) => {
        let called = false;
        const method = givenSharedStaticMethod(
          function bar(a, cb) {
            called = true;
            assert(a === undefined, 'a should be undefined');
            cb();
          },
          {
            accepts: [
              {arg: 'b', type: 'number'},
            ],
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.url).end(function() {
          assert(called);
          done();
        });
      });
    });

    it('should allow arguments in the body', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function bar(a, cb) {
            cb(null, a);
          },
          {
            accepts: [
              {arg: 'a', type: 'object', http: {source: 'body'}},
            ],
            returns: {arg: 'data', type: 'object', root: true},
            http: {path: '/'},
          },
        );

        const done = (error, res) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        request(app).post(method.classUrl)
          .set('Accept', 'application/json')
          .set('Content-Type', 'application/json')
          .send('{"x": 1, "y": "Y"}')
          .expect('Content-Type', /json/)
          .expect(200, function(err, res) {
            assert.deepStrictEqual(res.body, {'x': 1, 'y': 'Y'});
            done(err, res);
          });
      });
    });

    it('should allow arguments in the body with date', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function bar(a, cb) {
            cb(null, a);
          },
          {
            accepts: [
              {arg: 'a', type: 'object', http: {source: 'body'}},
            ],
            returns: {arg: 'data', type: 'object', root: true},
            http: {path: '/'},
          },
        );

        const done = (error, res) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        const data = {date: {$type: 'date', $data: new Date()}};
        request(app).post(method.classUrl)
          .set('Accept', 'application/json')
          .set('Content-Type', 'application/json')
          .send(data)
          .expect('Content-Type', /json/)
          .expect(200, function(err, res) {
            assert.deepStrictEqual(res.body, {date: data.date.$data.toISOString()});
            done(err, res);
          });
      });
    });

    it('should allow arguments in the form', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function bar(a, b, cb) {
            cb(null, a + b);
          },
          {
            accepts: [
              {arg: 'b', type: 'number', http: {source: 'form'}},
              {arg: 'a', type: 'number', http: {source: 'form'}},
            ],
            returns: {arg: 'n', type: 'number'},
            http: {path: '/'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        request(app).post(method.classUrl)
          .set('Accept', 'application/json')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('a=1&b=2')
          .expect('Content-Type', /json/)
          .expect({n: 3}, done);
      });
    });

    it('should allow arguments in the header', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function bar(a, b, cb) {
            cb(null, a + b);
          },
          {
            accepts: [
              {arg: 'b', type: 'number', http: {source: 'header'}},
              {arg: 'a', type: 'number', http: {source: 'header'}},
            ],
            returns: {arg: 'n', type: 'number'},
            http: {verb: 'get', path: '/'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        request(app).get(method.classUrl)
          .set('Accept', 'application/json')
          .set('Content-Type', 'application/json')
          .set('a', 1)
          .set('b', 2)
          .send()
          .expect('Content-Type', /json/)
          .expect({n: 3}, done);
      });
    });

    it('should allow arguments in the header without http source',
      function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function bar(a, b, cb) {
              cb(null, a + b);
            },
            {
              accepts: [
                {arg: 'b', type: 'number'},
                {arg: 'a', type: 'number'},
              ],
              returns: {arg: 'n', type: 'number'},
              http: {verb: 'get', path: '/'},
            },
          );

          const done = (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          };

          request(app).get(method.classUrl)
            .set('Accept', 'application/json')
            .set('Content-Type', 'application/json')
            .set('a', 1)
            .set('b', 2)
            .send()
            .expect('Content-Type', /json/)
            .expect({n: 3}, done);
        });
      });

    it('should allow arguments from http req and res', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function bar(req, res, cb) {
            res.status(200).send(req.body);
          },
          {
            accepts: [
              {arg: 'req', type: 'object', http: {source: 'req'}},
              {arg: 'res', type: 'object', http: {source: 'res'}},
            ],
            http: {path: '/'},
          },
        );

        const done = (error, res) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        request(app).post(method.classUrl)
          .set('Accept', 'application/json')
          .set('Content-Type', 'application/json')
          .send('{"x": 1, "y": "Y"}')
          .expect('Content-Type', /json/)
          .expect(200, function(err, res) {
            assert.deepStrictEqual(res.body, {'x': 1, 'y': 'Y'});
            done(err, res);
          });
      });
    });

    it('should allow arguments from http context', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function bar(ctx, cb) {
            ctx.res.status(200).send(ctx.req.body);
          },
          {
            accepts: [
              {arg: 'ctx', type: 'object', http: {source: 'context'}},
            ],
            http: {path: '/'},
          },
        );

        const done = (error, res) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        request(app).post(method.classUrl)
          .set('Accept', 'application/json')
          .set('Content-Type', 'application/json')
          .send('{"x": 1, "y": "Y"}')
          .expect('Content-Type', /json/)
          .expect(200, function(err, res) {
            assert.deepStrictEqual(res.body, {'x': 1, 'y': 'Y'});
            done(err, res);
          });
      });
    });

    it('should respond with 204 if returns is not defined', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function(cb) { cb(null, 'value-to-ignore'); },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.url)
          .expect(204, done);
      });
    });

    it('should preserve non-200 status when responding with no content', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function(ctx, cb) {
            ctx.res.status(302);
            cb();
          }, {
            accepts: [
              {
                arg: 'ctx',
                type: 'object',
                http: {
                  source: 'context',
                },
              },
            ],
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        request(app).get(method.url)
          .set('Accept', 'application/json')
          .expect(302, done);
      });
    });

    it('should accept custom content-type header if respond with 204', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod();
        objects.before(method.name, function(ctx, next) {
          ctx.res.set('Content-Type',
            'application/json; charset=utf-8; profile=http://example.org/');
          next();
        });

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        request(app).get(method.url)
          .set('Accept', 'application/json')
          .expect('Content-Type',
            'application/json; charset=utf-8; profile=http://example.org/')
          .expect(204, done);
      });
    });

    it('should respond with named results if returns has multiple args', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function(a, b, cb) {
            cb(null, a, b);
          },
          {
            accepts: [
              {arg: 'a', type: 'number'},
              {arg: 'b', type: 'number'},
            ],
            returns: [
              {arg: 'a', type: 'number'},
              {arg: 'b', type: 'number'},
            ],
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.url + '?a=1&b=2')
          .expect({a: 1, b: 2}, done);
      });
    });

    it('should remove any X-Powered-By header to LoopBack', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function(cb) { cb(null, 'value-to-ignore'); },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.url)
          .expect(204)
          .end(function(err, result) {
            assert(!result.headers['x-powered-by']);
            done();
          });
      });
    });

    it('should report error for mismatched arg type', function(t) {
      return new Promise((resolve, reject) => {
        remotes.foo = {
          bar: function(a, fn) {
            fn(null, a);
          },
        };

        const fn = remotes.foo.bar;

        fn.shared = true;
        fn.accepts = [
          {arg: 'a', type: 'object'},
        ];
        fn.returns = {root: true};

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json('get', '/foo/bar?a=foo')
          .expect(400, done);
      });
    });

    it('should not coerce nested boolean strings - true', function(t) {
      return new Promise((resolve, reject) => {
        remotes.foo = {
          bar: function(a, fn) {
            fn(null, a);
          },
        };

        const fn = remotes.foo.bar;

        fn.shared = true;
        fn.accepts = [
          {arg: 'a', type: 'object'},
        ];
        fn.returns = {root: true};

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json('get', '/foo/bar?a[foo]=true')
          .expect({foo: 'true'}, done);
      });
    });

    it('should not coerce nested boolean strings - false', function(t) {
      return new Promise((resolve, reject) => {
        remotes.foo = {
          bar: function(a, fn) {
            fn(null, a);
          },
        };

        const fn = remotes.foo.bar;

        fn.shared = true;
        fn.accepts = [
          {arg: 'a', type: 'object'},
        ];
        fn.returns = {root: true};

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json('get', '/foo/bar?a[foo]=false')
          .expect({foo: 'false'}, done);
      });
    });

    it('should coerce number strings', function(t) {
      return new Promise((resolve, reject) => {
        remotes.foo = {
          bar: function(a, b, fn) {
            fn(null, a + b);
          },
        };

        const fn = remotes.foo.bar;

        fn.shared = true;
        fn.accepts = [
          {arg: 'a', type: 'number'},
          {arg: 'b', type: 'number'},
        ];
        fn.returns = {root: true};

        json('get', '/foo/bar?a=42&b=0.42')
          .expect(200, function(err, res) {
            if (err) {
              reject(err);
            } else {
              try {
                assert.equal(res.body, 42.42);
                resolve();
              } catch (assertErr) {
                reject(assertErr);
              }
            }
          });
      });
    });

    it('should coerce strings with type set to "any"', function(t) {
      return new Promise((resolve, reject) => {
        remotes.foo = {
          bar: function(a, b, c, fn) {
            fn(null, c === true ? a + b : 0);
          },
        };

        const fn = remotes.foo.bar;

        fn.shared = true;
        fn.accepts = [
          {arg: 'a', type: 'any'},
          {arg: 'b', type: 'any'},
          {arg: 'c', type: 'any'},
        ];
        fn.returns = {root: true};

        json('get', '/foo/bar?a=42&b=0.42&c=true')
          .expect(200, function(err, res) {
            if (err) {
              reject(err);
            } else {
              try {
                assert.equal(res.body, 42.42);
                resolve();
              } catch (assertErr) {
                reject(assertErr);
              }
            }
          });
      });
    });
    describe('data type - integer', function() {
      it('should coerce integer strings', function(t) {
        return new Promise((resolve, reject) => {
          remotes.foo = {
            bar: function(a, b, fn) {
              fn(null, a + b);
            },
          };

          const fn = remotes.foo.bar;

          fn.shared = true;
          fn.accepts = [
            {arg: 'a', type: 'integer'},
            {arg: 'b', type: 'integer'},
          ];
          fn.returns = {root: true};

          json('get', '/foo/bar?a=53&b=2')
            .expect(200, function(err, res) {
              if (err) {
                reject(err);
              } else {
                try {
                  assert.equal(res.body, 55);
                  resolve();
                } catch (assertErr) {
                  reject(assertErr);
                }
              }
            });
        });
      });

      it('supports target type [integer]', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function(arg, cb) {
              cb(null, {value: arg});
            },
            {
              accepts: {arg: 'arg', type: ['integer']},
              returns: {arg: 'data', type: ['integer'], root: true},
              http: {method: 'POST'},
            },
          );

          const done = (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          };

          request(app).post(method.url)
            .send({arg: [1, 2]})
            .expect(200, {value: [1, 2]})
            .end(done);
        });
      });

      it('supports return type [integer]', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function(arg, cb) {
              cb(null, [arg[0], arg[1]]);
            },
            {
              accepts: {arg: 'arg', type: ['number']},
              returns: {arg: 'data', type: ['integer']},
              http: {method: 'POST'},
            },
          );

          const done = (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          };

          request(app).post(method.url)
            .send({arg: [1, 2]})
            .expect(200, {data: [1, 2]})
            .end(done);
        });
      });
    });

    it('should pass an array argument even when non-array passed', function(t) {
      return new Promise((resolve, reject) => {
        remotes.foo = {
          bar: function(a, fn) {
            fn(null, Array.isArray(a));
          },
        };

        const fn = remotes.foo.bar;

        fn.shared = true;
        fn.accepts = [
          {arg: 'a', type: ['number']},
        ];
        fn.returns = {root: true};

        json('get',
          '/foo/bar?a=1234')
          .expect(200, function(err, res) {
            if (err) {
              reject(err);
            } else {
              try {
                assert.equal(res.body, true);
                resolve();
              } catch (assertErr) {
                reject(assertErr);
              }
            }
          });
      });
    });

    it('should coerce contents of array with simple array types', function(t) {
      return new Promise((resolve, reject) => {
        remotes.foo = {
          bar: function(a, fn) {
            fn(null, a.reduce(function(memo, val) { return memo + val; }, 0));
          },
        };

        const fn = remotes.foo.bar;

        fn.shared = true;
        fn.accepts = [
          {arg: 'a', type: ['number']},
        ];
        fn.returns = {root: true};

        json('get', '/foo/bar?a=[1,2,3,4,5]')
          .expect(200, function(err, res) {
            if (err) {
              reject(err);
            } else {
              try {
                assert.equal(res.body, 15);
                resolve();
              } catch (assertErr) {
                reject(assertErr);
              }
            }
          });
      });
    });

    it('should not flatten arrays for target type "any"', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function(arg, cb) { cb(null, {value: arg}); },
          {
            accepts: {arg: 'arg', type: 'any'},
            returns: {arg: 'data', type: 'any', root: true},
            http: {method: 'POST'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        request(app).post(method.url)
          .send({arg: ['single']})
          .expect(200, {value: ['single']})
          .end(done);
      });
    });

    it('should support taget type [any]', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function(arg, cb) { cb(null, {value: arg}); },
          {
            accepts: {arg: 'arg', type: ['any']},
            returns: {arg: 'data', type: ['any'], root: true},
            http: {method: 'POST'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        request(app).post(method.url)
          .send({arg: ['single']})
          .expect(200, {value: ['single']})
          .end(done);
      });
    });

    it('should support taget type `array` - of string', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function(arg, cb) { cb(null, {value: arg}); },
          {
            accepts: {arg: 'arg', type: 'array'},
            returns: {arg: 'data', type: 'array', root: true},
            http: {method: 'POST'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        request(app).post(method.url)
          .send({arg: ['single']})
          .expect(200, {value: ['single']})
          .end(done);
      });
    });

    it('should support taget type `array` - of number', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function(arg, cb) { cb(null, {value: arg}); },
          {
            accepts: {arg: 'arg', type: 'array'},
            returns: {arg: 'data', type: 'array', root: true},
            http: {method: 'POST'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        request(app).post(method.url)
          .send({arg: [1]})
          .expect(200, {value: [1]})
          .end(done);
      });
    });

    it('should support taget type `array` - of object', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function(arg, cb) { cb(null, {value: arg}); },
          {
            accepts: {arg: 'arg', type: 'array'},
            returns: {arg: 'data', type: 'array', root: true},
            http: {method: 'POST'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        request(app).post(method.url)
          .send({arg: [{foo: 'bar'}]})
          .expect(200, {value: [{foo: 'bar'}]})
          .end(done);
      });
    });

    it('should allow empty body for json request', function(t) {
      return new Promise((resolve, reject) => {
        remotes.foo = {
          bar: function(a, b, fn) {
            fn(null, a, b);
          },
        };

        const fn = remotes.foo.bar;

        fn.shared = true;
        fn.accepts = [
          {arg: 'a', type: 'number'},
          {arg: 'b', type: 'number'},
        ];

        fn.returns = [
          {arg: 'a', type: 'number'},
          {arg: 'b', type: 'number'},
        ];

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json('post', '/foo/bar?a=1&b=2').set('Content-Length', 0)
          .expect({a: 1, b: 2}, done);
      });
    });

    it('should split array string when configured', function(t) {
      return new Promise((resolve, reject) => {
        objects.options.rest = {arrayItemDelimiters: [',', '|']};
        const method = givenSharedStaticMethod(
          function(a, cb) { cb(null, a); },
          {
            accepts: {arg: 'a', type: ['number']},
            returns: {arg: 'data', type: 'object'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json('post', method.url + '?a=1,2|3')
          .expect({data: [1, 2, 3]}, done);
      });
    });

    it('should not create empty string array with empty string arg', function(t) {
      return new Promise((resolve, reject) => {
        objects.options.rest = {arrayItemDelimiters: [',', '|']};
        const method = givenSharedStaticMethod(
          function(a, cb) { cb(null, a); },
          {
            accepts: {arg: 'a', type: ['number']},
            returns: {arg: 'data', type: 'object'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json('post', method.url + '?a=')
          .expect({ /* data is undefined */ }, done);
      });
    });

    it('should still support JSON arrays with arrayItemDelimiters', function(t) {
      return new Promise((resolve, reject) => {
        objects.options.rest = {arrayItemDelimiters: [',', '|']};
        const method = givenSharedStaticMethod(
          function(a, cb) { cb(null, a); },
          {
            accepts: {arg: 'a', type: ['number']},
            returns: {arg: 'data', type: 'object'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json('post', method.url + '?a=[1,2,3]')
          .expect({data: [1, 2, 3]}, done);
      });
    });

    it('should call rest hooks', function(t) {
      return new Promise((resolve, reject) => {
        const hooksCalled = [];

        const method = givenSharedStaticMethod({
          rest: {
            before: createHook('beforeRest'),
            after: createHook('afterRest'),
          },
        });

        objects.before(method.name, createHook('beforeRemote'));
        objects.after(method.name, createHook('afterRemote'));

        json(method.url)
          .end(function(err) {
            if (err) {
              reject(err);
            } else {
              try {
                assert.deepEqual(
                  hooksCalled,
                  ['beforeRest', 'beforeRemote', 'afterRemote', 'afterRest'],
                );
                resolve();
              } catch (assertErr) {
                reject(assertErr);
              }
            }
          });

        function createHook(name) {
          return function(ctx, next) {
            hooksCalled.push(name);
            next();
          };
        }
      });
    });

    it('should respect supported types', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function(cb) {
            cb(null, {key: 'value'});
          },
          {
            returns: {arg: 'result', type: 'object'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        request(appSupportingJsonOnly).get(method.url)
          .set('Accept',
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8')
          .expect('Content-Type', 'application/json; charset=utf-8')
          .expect(200, done);
      });
    });

    describe('xml support', function() {
      beforeEach(enableXmlSupport);

      it('should produce xml from json objects', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function bar(a, cb) {
              cb(null, a);
            },
            {
              accepts: [
                {arg: 'a', type: 'object', http: {source: 'body'}},
              ],
              returns: {arg: 'data', type: 'object', root: true},
              http: {path: '/'},
            },
          );

          request(app).post(method.classUrl)
            .set('Accept', 'application/xml')
            .set('Content-Type', 'application/json')
            .send('{"x": 1, "y": "Y"}')
            .expect('Content-Type', /xml/)
            .expect(200, function(err, res) {
              if (err) {
                reject(err);
              } else {
                try {
                  assert.strictEqual(res.text, '<?xml version="1.0" encoding="UTF-8"?>\n' +
                    '<response>\n  <x>1</x>\n  <y>Y</y>\n</response>');
                  resolve();
                } catch (assertErr) {
                  reject(assertErr);
                }
              }
            });
        });
      });

      it('should produce xml from json array', function(t) {
        return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function bar(cb) {
            cb(null, [1, 2, 3]);
          },
          {
            returns: {arg: 'data', type: ['number'], root: true},
            http: {path: '/', verb: 'get'},
          },
        );

        request(app).get(method.classUrl)
          .set('Accept', 'application/xml')
          .set('Content-Type', 'application/json')
          .send('{"x": 1, "y": "Y"}')
          .expect('Content-Type', /xml/)
          .expect(200, function(err, res) {
            if (err) {
              reject(err);
            } else {
              try {
                assert.strictEqual(res.text, '<?xml version=\"1.0\" ' +
                  'encoding=\"UTF-8\"?>\n<response>\n  <result>1</result>\n  ' +
                  '<result>2</result>\n  <result>3</result>\n</response>');
                resolve();
              } catch (assertErr) {
                reject(assertErr);
              }
            }
          });
        });
      });

      it('should produce xml from json objects with toJSON()', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function bar(a, cb) {
              const result = a;
              a.toJSON = function() {
                return {
                  foo: a.y,
                  bar: a.x,
                };
              };
              cb(null, a);
            },
            {
              accepts: [
                {arg: 'a', type: 'object', http: {source: 'body'}},
              ],
              returns: {arg: 'data', type: 'object', root: true},
              http: {path: '/'},
            },
          );

          request(app).post(method.classUrl)
            .set('Accept', 'application/xml')
            .set('Content-Type', 'application/json')
            .send('{"x": 1, "y": "Y"}')
            .expect('Content-Type', /xml/)
            .expect(200, function(err, res) {
              if (err) {
                reject(err);
              } else {
                try {
                  assert.strictEqual(res.text, '<?xml version="1.0" encoding="UTF-8"?>\n' +
                    '<response>\n  <foo>Y</foo>\n  <bar>1</bar>\n</response>');
                  resolve();
                } catch (assertErr) {
                  reject(assertErr);
                }
              }
            });
        });
      });

      it('should produce xml from json objects with toJSON() inside an array',
        function(t) {
          return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function bar(a, cb) {
              a.toJSON = function() {
                return {
                  foo: a.y,
                  bar: a.x,
                };
              };
              cb(null, [a, {c: 1}]);
            },
            {
              accepts: [
                {arg: 'a', type: 'object', http: {source: 'body'}},
              ],
              returns: {arg: 'data', type: 'object', root: true},
              http: {path: '/'},
            },
          );

          request(app).post(method.classUrl)
            .set('Accept', 'application/xml')
            .set('Content-Type', 'application/json')
            .send('{"x": 1, "y": "Y"}')
            .expect('Content-Type', /xml/)
            .expect(200, function(err, res) {
              if (err) {
                reject(err);
              } else {
                try {
                  assert.strictEqual(res.text, '<?xml version=\"1.0\" ' +
                  'encoding=\"UTF-8\"?>\n<response>\n  <result>\n    ' +
                  '<foo>Y</foo>\n    <bar>1</bar>\n  </result>\n  <result>\n    ' +
                  '<c>1</c>\n  </result>\n</response>');
                  resolve();
                } catch (assertErr) {
                  reject(assertErr);
                }
              }
            });
          });
        });

      it('should allow customized xml root element', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function bar(cb) {
              cb(null, {a: 1, b: 2});
            },
            {
              returns: {
                arg: 'data', type: 'object', root: true,
                xml: {wrapperElement: 'foo'},
              },
              http: {path: '/'},
            },
          );
          request(app).get(method.classUrl)
            .set('Accept', 'application/xml')
            .set('Content-Type', 'application/json')
            .send()
            .expect('Content-Type', /xml/)
            .expect(200, function(err, res) {
              if (err) {
                reject(err);
              } else {
                try {
                  assert.strictEqual(res.text,
                    '<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n' +
                    '<foo>\n  ' +
                      '<a>1</a>\n  ' +
                      '<b>2</b>\n' +
                    '</foo>');
                  resolve();
                } catch (assertErr) {
                  reject(assertErr);
                }
              }
            });
        });
      });

      it('should allow xml declaration to be disabled', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function bar(cb) {
              cb(null, {a: 1, b: 2});
            },
            {
              returns: {
                arg: 'data', type: 'object', root: true,
                xml: {declaration: false},
              },
              http: {path: '/'},
            },
          );
          request(app).get(method.classUrl)
            .set('Accept', 'application/xml')
            .set('Content-Type', 'application/json')
            .send()
            .expect('Content-Type', /xml/)
            .expect(200, function(err, res) {
              if (err) {
                reject(err);
              } else {
                try {
                  assert.strictEqual(res.text,
                    '<response>\n  ' +
                      '<a>1</a>\n  ' +
                      '<b>2</b>\n' +
                    '</response>');
                  resolve();
                } catch (assertErr) {
                  reject(assertErr);
                }
              }
            });
        });
      });

      it('should allow string results to output as xml', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function bar(cb) {
              const stringResult = 'a quick brown fox jumps over the lazy dog';
              cb(null, stringResult);
            },
            {
              returns: {
                root: true,
                xml: {wrapperElement: 'text'},
              },
              http: {path: '/'},
            },
          );
          request(app).get(method.classUrl)
            .set('Accept', 'application/xml')
            .set('Content-Type', 'application/json')
            .send()
            .expect('Content-Type', /xml/)
            .expect(200, function(err, res) {
              if (err) {
                reject(err);
              } else {
                try {
                  assert.strictEqual(res.text,
                    '<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n' +
                    '<text>a quick brown fox jumps over the lazy dog' +
                    '</text>');
                  resolve();
                } catch (assertErr) {
                  reject(assertErr);
                }
              }
            });
        });
      });

      it('should handle UTF-8 & special & reserved characters', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function bar(cb) {
              const stringA = 'foo\xC1\xE1\u0102\u03A9asd><=$~!@#$%^&*()-_=+/.,;\'"[]{}?';
              cb(null, {a: stringA});
            },
            {
              returns: {
                arg: 'data', type: 'object', root: true,
                xml: {wrapperElement: false},
              },
              http: {path: '/'},
            },
          );
          request(app).get(method.classUrl)
            .set('Accept', 'application/xml')
            .set('Content-Type', 'application/json')
            .send()
            .expect('Content-Type', /xml.*charset=utf-8/)
            .expect(200, function(err, res) {
              if (err) {
                reject(err);
              } else {
                try {
                  assert.strictEqual(res.text,
                    '<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n' +
                    '<response>\n  ' +
                    '<a>fooÁáĂΩasd>&lt;=$~!@#$%^&amp;*()-_=+/.,;\'"[]{}?</a>\n' +
                    '</response>');
                  resolve();
                } catch (assertErr) {
                  reject(assertErr);
                }
              }
            });
        });
      });

      it('should produce xml from json objects with toXML()', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function bar(a, cb) {
              const result = a;
              a.toXML = function() {
                return '<?xml version="1.0" encoding="UTF-8"?>' +
                  '<root><x>10</x></root>';
              };
              cb(null, a);
            },
            {
              accepts: [
                {arg: 'a', type: 'object', http: {source: 'body'}},
              ],
              returns: {arg: 'data', type: 'object', root: true},
              http: {path: '/'},
            },
          );

          request(app).post(method.classUrl)
            .set('Accept', 'application/xml')
            .set('Content-Type', 'application/json')
            .send('{"x": 1, "y": "Y"}')
            .expect('Content-Type', /xml/)
            .expect(200, function(err, res) {
              if (err) {
                reject(err);
              } else {
                try {
                  assert.strictEqual(res.text, '<?xml version="1.0" encoding="UTF-8"?>' +
                    '<root><x>10</x></root>');
                  resolve();
                } catch (assertErr) {
                  reject(assertErr);
                }
              }
            });
        });
      });
    });

    describe('_format support', function() {
      it('should produce xml if _format is xml', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function bar(a, cb) {
              cb(null, a);
            },
            {
              accepts: [
                {arg: 'a', type: 'object', http: {source: 'body'}},
              ],
              returns: {arg: 'data', type: 'object', root: true},
              http: {path: '/'},
            },
          );

          request(app).post(method.classUrl + '?_format=xml')
            .set('Accept', '*/*')
            .set('Content-Type', 'application/json')
            .send('{"x": 1, "y": "Y"}')
            .expect('Content-Type', /xml/)
            .expect(200, function(err, res) {
              if (err) {
                reject(err);
              } else {
                try {
                  assert.strictEqual(res.text, '<?xml version="1.0" encoding="UTF-8"?>\n' +
                    '<response>\n  <x>1</x>\n  <y>Y</y>\n</response>');
                  resolve();
                } catch (assertErr) {
                  reject(assertErr);
                }
              }
            });
        });
      });

      it('should produce json if _format is json', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function bar(a, cb) {
              cb(null, a);
            },
            {
              accepts: [
                {arg: 'a', type: 'object', http: {source: 'body'}},
              ],
              returns: {arg: 'data', type: 'object', root: true},
              http: {path: '/'},
            },
          );

          request(app).post(method.classUrl + '?_format=json')
            .set('Accept', 'application/xml')
            .set('Content-Type', 'application/json')
            .send('{"x": 1, "y": "Y"}')
            .expect('Content-Type', /json/)
            .expect(200, function(err, res) {
              if (err) {
                reject(err);
              } else {
                try {
                  assert.deepStrictEqual(res.body, {x: 1, y: 'Y'});
                  resolve();
                } catch (assertErr) {
                  reject(assertErr);
                }
              }
            });
        });
      });

      it('should return a 400 if _format array', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function bar(a, cb) {
              cb(null, a);
            },
            {
              accepts: [
                {arg: 'a', type: 'object', http: {source: 'body'}},
              ],
              returns: {arg: 'data', type: 'object', root: true},
              http: {path: '/'},
            },
          );

          request(app).post(method.classUrl + '?_format=json&_format=xml')
            .set('Accept', 'application/xml')
            .set('Content-Type', 'application/json')
            .send('{"x": 1, "y": "Y"}')
            .expect(406, function(err, res) {
              if (err) {
                reject(err);
              } else {
                console.log(err);
                resolve();
              }
            });
        });
      });
    });

    describe('uncaught errors', function() {
      it('should return 500 if an error object is thrown', function(t) {
        return new Promise((resolve, reject) => {
          remotes.shouldThrow = {
            bar: function(fn) {
              throw new Error('an error');
            },
          };

          const fn = remotes.shouldThrow.bar;
          fn.shared = true;

          const done = (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          };

          json('get', '/shouldThrow/bar?a=1&b=2')
            .expect(500)
            .end(expectErrorResponseContaining({message: 'an error'}, done));
        });
      });

      it('should return 500 if an array of errors is thrown', function(t) {
        return new Promise((resolve, reject) => {
          const testError = new Error('expected test error');
          const errArray = [testError, testError];

          function method(error) {
            return givenSharedStaticMethod(function(cb) {
              cb(error);
            });
          }

          request(app).get(method(testError).url)
            .set('Accept', 'application/json')
            .expect(500)
            .end(function(err, res) {
              if (err) return reject(err);
              const expectedDetail = res.body.error;

              request(app).get(method(errArray).url)
                .set('Accept', 'application/json')
                .expect(500)
                .end(function(err, res) {
                  if (err) return reject(err);
                  try {
                    const error = res.body.error;
                    assert(error.message.match(/multiple errors/));
                    assert(error.details);
                    assert.deepStrictEqual(error.details.some(d =>
                      JSON.stringify(d) === JSON.stringify(expectedDetail)
                    ), true);
                    resolve();
                  } catch (assertErr) {
                    reject(assertErr);
                  }
                });
            });
        });
      });

      it('should return 500 if an error string is thrown', function(t) {
        return new Promise((resolve, reject) => {
          remotes.shouldThrow = {
            bar: function(fn) {
              throw 'an error';
            },
          };

          const fn = remotes.shouldThrow.bar;
          fn.shared = true;

          const done = (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          };

          json('get', '/shouldThrow/bar?a=1&b=2')
            .expect(500)
            .end(expectErrorResponseContaining({message: 'an error'}, done));
        });
      });

      it('should return 500 for unhandled errors thrown from before hooks',
        function(t) {
          return new Promise((resolve, reject) => {
            const method = givenSharedStaticMethod();

            objects.before(method.name, function(ctx, next) {
              process.nextTick(next);
            });

            objects.before(method.name, function(ctx, next) {
              throw new Error('test error');
            });

            const done = (error) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            };

            request(app).get(method.url)
              .set('Accept', 'application/json')
              .expect(500)
              .end(expectErrorResponseContaining({message: 'test error'}, done));
          });
        });
    });

    it('should return 500 when method returns an error', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function(cb) {
            cb(new Error('test-error'));
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        // Send a plain, non-json request to make sure the error handler
        // always returns a json response.
        request(app).get(method.url)
          .expect('Content-Type', /json/)
          .expect(500)
          .end(expectErrorResponseContaining({message: 'test-error'}, done));
      });
    });

    it('should return 500 when "before" returns an error', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod();
        objects.before(method.name, function(ctx, next) {
          next(new Error('test-error'));
        });

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.url)
          .expect(500)
          .end(expectErrorResponseContaining({message: 'test-error'}, done));
      });
    });

    it('should return 500 when "after" returns an error', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod();
        objects.after(method.name, function(ctx, next) {
          next(new Error('test-error'));
        });

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.url)
          .expect(500)
          .end(expectErrorResponseContaining({message: 'test-error'}, done));
      });
    });

    it('should return 400 when a required arg is missing', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedPrototypeMethod(
          function(a, cb) {
            cb();
          },
          {
            accepts: [
              {arg: 'a', type: 'number', required: true},
            ],
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.url)
          .expect(400, done);
      });
    });
  });

  describe('call of static method with asynchronous hook', function() {
    beforeEach(function() {
      // This simulate the ACL hook
      objects.before('**', function(ctx, next, method) {
        process.nextTick(next);
      });
    });

    describe('uncaught errors', function() {
      it('should return 500 if an error object is thrown', function(t) {
        return new Promise((resolve, reject) => {
          remotes.shouldThrow = {
            bar: function(fn) {
              throw new Error('an error');
            },
          };

          const fn = remotes.shouldThrow.bar;
          fn.shared = true;

          const done = (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          };

          json('get', '/shouldThrow/bar?a=1&b=2')
            .expect(500)
            .end(expectErrorResponseContaining({message: 'an error'}, done));
        });
      });

      it('should return 500 if an error string is thrown', function(t) {
        return new Promise((resolve, reject) => {
          remotes.shouldThrow = {
            bar: function(fn) {
              throw 'an error';
            },
          };

          const fn = remotes.shouldThrow.bar;
          fn.shared = true;

          const done = (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          };

          json('get', '/shouldThrow/bar?a=1&b=2')
            .expect(500)
            .end(expectErrorResponseContaining({message: 'an error'}, done));
        });
      });
    });

    it('should return 500 when method returns an error', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function(cb) {
            cb(new Error('test-error'));
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        // Send a plain, non-json request to make sure the error handler
        // always returns a json response.
        request(app).get(method.url)
          .expect('Content-Type', /json/)
          .expect(500)
          .end(expectErrorResponseContaining({message: 'test-error'}, done));
      });
    });
  });

  describe('call of prototype method', function() {
    it('should work', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedPrototypeMethod(
          function greet(msg, cb) {
            cb(null, this.id + ':' + msg);
          },
          {
            accepts: {arg: 'person', type: 'string'},
            returns: {arg: 'msg', type: 'string'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.getUrlForId('world') + '?person=hello')
          .expect(200, {msg: 'world:hello'}, done);
      });
    });

    it('should have the correct scope', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedPrototypeMethod(
          function greet(msg, cb) {
            assert.equal(this.constructor, method.ctor);
            cb(null, this.id + ':' + msg);
          },
          {
            accepts: {arg: 'person', type: 'string'},
            returns: {arg: 'msg', type: 'string'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.getUrlForId('world') + '?person=hello')
          .expect(200, {msg: 'world:hello'}, done);
      });
    });

    it('should allow arguments in the path', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedPrototypeMethod(
          function bar(a, b, cb) {
            cb(null, this.id + ':' + (a + b));
          },
          {
            accepts: [
              {arg: 'b', type: 'number'},
              {arg: 'a', type: 'number', http: {source: 'path'}},
            ],
            returns: {arg: 'n', type: 'number'},
            http: {path: '/:a'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.getClassUrlForId('sum') + '/1?b=2')
          .expect({n: 'sum:3'}, done);
      });
    });

    it('should allow jsonp requests', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function bar(a, cb) {
            cb(null, a);
          },
          {
            accepts: [
              {arg: 'a', type: 'number', http: {source: 'path'}},
            ],
            returns: {arg: 'n', type: 'number', root: true},
            errors: [],
            http: {path: '/:a'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        request(app).get(method.classUrl + '/1?callback=boo')
          .set('Accept', 'application/javascript')
          .expect('Content-Type', /javascript/)
          .expect('/**/ typeof boo === \'function\' && boo(1);', done);
      });
    });

    it('should allow jsonp requests with null response', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function bar(a, cb) {
            cb(null, null);
          },
          {
            accepts: [
              {arg: 'a', type: 'number', http: {source: 'path'}},
            ],
            returns: {arg: 'n', type: 'number', root: true},
            http: {path: '/:a'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        request(app).get(method.classUrl + '/1?callback=boo')
          .set('Accept', 'application/javascript')
          .expect('Content-Type', /javascript/)
          .expect('/**/ typeof boo === \'function\' && boo(null);', done);
      });
    });

    it('should allow arguments in the query', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedPrototypeMethod(
          function bar(a, b, cb) {
            cb(null, this.id + ':' + (a + b));
          },
          {
            accepts: [
              {arg: 'b', type: 'number'},
              {arg: 'a', type: 'number', http: {source: 'query'}},
            ],
            returns: {arg: 'n', type: 'number'},
            http: {path: '/'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.getClassUrlForId('sum') + '/?b=2&a=1')
          .expect({n: 'sum:3'}, done);
      });
    });

    it('should support methods on `/` path', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedPrototypeMethod({
          http: {path: '/', verb: 'get'},
        });

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json('get', method.getClassUrlForId(0))
          .expect(204) // 204 No Content
          .end(done);
      });
    });

    it('should respond with 204 if returns is not defined', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedPrototypeMethod(
          function(cb) { cb(null, 'value-to-ignore'); },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.getUrlForId('an-id'))
          .expect(204, done);
      });
    });

    it('should respond with named results if returns has multiple args', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedPrototypeMethod(
          function(a, b, cb) {
            cb(null, this.id, a, b);
          },
          {
            accepts: [
              {arg: 'a', type: 'number'},
              {arg: 'b', type: 'number'},
            ],
            returns: [
              {arg: 'id', type: 'any'},
              {arg: 'a', type: 'number'},
              {arg: 'b', type: 'number'},
            ],
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.getUrlForId('an-id') + '?a=1&b=2')
          .expect({id: 'an-id', a: 1, b: 2}, done);
      });
    });

    it('should respect supported types', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedPrototypeMethod(
          function(cb) {
            cb(null, {key: 'value'});
          },
          {
            returns: {arg: 'result', type: 'object'},
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        request(appSupportingJsonOnly).get(method.url)
          .set('Accept',
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8')
          .expect('Content-Type', 'application/json; charset=utf-8')
          .expect(200, done);
      });
    });

    it('should return 500 when method returns an error', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedPrototypeMethod(
          function(cb) {
            cb(new Error('test-error'));
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.url)
          .expect(500)
          .end(expectErrorResponseContaining({message: 'test-error'}, done));
      });
    });

    it('should return 500 when "before" returns an error', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedPrototypeMethod();
        objects.before(method.name, function(ctx, next) {
          next(new Error('test-error'));
        });

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.url)
          .expect(500)
          .end(expectErrorResponseContaining({message: 'test-error'}, done));
      });
    });

    it('should return 500 when "after" returns an error', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedPrototypeMethod();
        objects.after(method.name, function(ctx, next) {
          next(new Error('test-error'));
        });

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.url)
          .expect(500)
          .end(expectErrorResponseContaining({message: 'test-error'}, done));
      });
    });

    it('should resolve promise returned by a hook', async function() {
      const method = givenSharedPrototypeMethod();
      const hooksCalled = [];
      objects.before('**', function(ctx) {
        hooksCalled.push('first');
        return Promise.resolve();
      });
      objects.before('**', function(ctx) {
        hooksCalled.push('second');
        return Promise.resolve();
      });

      await json(method.url).expect(204);
      assert.deepStrictEqual(hooksCalled.slice(0, 2), ['first', 'second']);
    });

    it('should handle rejected promise returned by a hook', function(t) {
      return new Promise((resolve, reject) => {
        const testError = new Error('expected test error');
        const method = givenSharedPrototypeMethod();
        objects.after('**', function(ctx) {
          return Promise.reject(testError);
        });

        json(method.url).expect(500).end(function(err, res) {
          if (err) return reject(err);
          try {
            assert.strictEqual(res.body.error.message, testError.message);
            resolve();
          } catch (assertErr) {
            reject(assertErr);
          }
        });
      });
    });

    it('should set "req.remotingContext"', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedPrototypeMethod();
        json(method.url).end(function(err) {
          if (err) return reject(err);
          try {
            assert(lastRequest.remotingContext.method.name);
            resolve();
          } catch (assertErr) {
            reject(assertErr);
          }
        });
      });
    });

    it('should set "remotingContext.ctorArgs"', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedPrototypeMethod();
        json(method.getUrlForId(1234)).end(function(err) {
          if (err) return reject(err);
          try {
            assert.strictEqual(lastRequest.remotingContext.ctorArgs.id, 1234);
            // Notice that the id was correctly coerced to a Number ^^^^
            resolve();
          } catch (assertErr) {
            reject(assertErr);
          }
        });
      });
    });

    it('should prioritise auth errors over sharedCtor errors', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedPrototypeMethod();
        method.ctor._sharedCtor = function(ctx, next) {
          const err = new Error('Not Found');
          err.statusCode = 404;
          next(err);
        };

        objects.authorization = function(ctx, next) {
          const err = new Error('Not Authorized');
          err.statusCode = 401;
          next(err);
        };

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.getUrlForId('instId'))
          // Verify that we return 401 Not Authorized and hide 404 Not Found
          .expect(401, done);
      });
    });
  });

  describe('status codes', function() {
    describe('using a custom status code', function() {
      it('returns a custom status code', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function fn(cb) {
              cb();
            },
            {
              http: {status: 201},
            },
          );

          const done = (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          };

          json(method.url)
            .expect(201, done);
        });
      });
      it('returns a custom error status code', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function fn(cb) {
              cb(new Error('test error'));
            },
            {
              http: {status: 201, errorStatus: 508},
            },
          );

          const done = (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          };

          json(method.url)
            .expect(508, done);
        });
      });
      it('returns a custom error status code (using the err object)', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function fn(cb) {
              const err = new Error('test error');
              err.status = 555;
              cb(err);
            },
            {
              http: {status: 201, errorStatus: 508},
            },
          );

          const done = (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          };

          json(method.url)
            .expect(555, done);
        });
      });
      it('returns a custom status code from a callback arg', function(t) {
        return new Promise((resolve, reject) => {
          const exampleStatus = 222;
          const method = givenSharedStaticMethod(
            function fn(status, cb) {
              cb(null, status);
            },
            {
              accepts: {arg: 'status', type: 'number'},
              returns: {
                arg: 'status',
                http: {target: 'status'},
              },
            },
          );

          const done = (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          };

          json(method.url + '?status=' + exampleStatus)
            .expect(exampleStatus, done);
        });
      });
      it('returns a custom status code from a promise returned value', async function() {
        const exampleStatus = 222;
        const sentBody = {eiste: 'ligo', kopries: true};
        const method = givenSharedStaticMethod(
          function fn() {
            return Promise.resolve([exampleStatus, sentBody]);
          },
          {
            returns: [{
              arg: 'status',
              http: {target: 'status'},
            }, {
              arg: 'result',
              root: true,
              type: 'object',
            }],
          },
        );
        const response = await json(method.url).expect(exampleStatus);
        assert.deepStrictEqual(response.body, sentBody);
      });
    });
    it('returns 404 for unknown method of a shared class', function(t) {
      return new Promise((resolve, reject) => {
        const classUrl = givenSharedStaticMethod().classUrl;

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(classUrl + '/unknown-method')
          .expect(404, done);
      });
    });

    it('returns 404 with standard JSON body for unknown URL', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json('/unknown-url')
          .expect(404)
          .end(expectErrorResponseContaining({statusCode: 404}, done));
      });
    });
  });

  describe('result args as headers', function() {
    it('sets the header using the callback arg', function(t) {
      return new Promise((resolve, reject) => {
        const A_STRING_VALUE = 'foobar';
        const method = givenSharedStaticMethod(
          function fn(input, cb) {
            cb(null, input, input);
          },
          {
            accepts: {arg: 'input', type: 'string'},
            returns: [
              {arg: 'value', type: 'string'},
              {arg: 'output', type: 'string', http: {target: 'header'}},
            ],
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.url + '?input=' + A_STRING_VALUE)
          .expect(200)
          .expect('output', A_STRING_VALUE)
          .expect({value: A_STRING_VALUE})
          .end(done);
      });
    });

    it('sets the header using the callback arg - root arg', function(t) {
      return new Promise((resolve, reject) => {
        const A_STRING_VALUE = 'foobar';
        const method = givenSharedStaticMethod(
          function fn(input, cb) {
            cb(null, {value: input}, input);
          },
          {
            accepts: {arg: 'input', type: 'string'},
            returns: [
              {arg: 'value', type: 'object', root: true},
              {arg: 'output', type: 'string', http: {target: 'header'}},
            ],
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.url + '?input=' + A_STRING_VALUE)
          .expect(200)
          .expect('output', A_STRING_VALUE)
          .expect({value: A_STRING_VALUE})
          .end(done);
      });
    });

    it('sets the custom header using the callback arg', function(t) {
      return new Promise((resolve, reject) => {
        const val = 'foobar';
        const method = givenSharedStaticMethod(
          function fn(input, cb) {
            cb(null, input);
          },
          {
            accepts: {arg: 'input', type: 'string'},
            returns: {arg: 'output', type: 'string', http: {
              target: 'header',
              header: 'X-Custom-Header',
            },
            },
          },
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        json(method.url + '?input=' + val)
          .expect('X-Custom-Header', val)
          .expect(200, done);
      });
    });
  });

  describe('returns type "file"', function() {
    const METHOD_SIGNATURE = {
      returns: [
        {arg: 'body', type: 'file', root: true},
        {arg: 'Content-Type', type: 'string', http: {target: 'header'}},
      ],
    };

    it('should send back Buffer body', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function(cb) { cb(null, new Buffer('some-text'), 'text/plain'); },
          METHOD_SIGNATURE,
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        request(app).get(method.url)
          .expect(200)
          .expect('Content-Type', /^text\/plain/)
          .expect('some-text')
          .end(done);
      });
    });

    it('should send back String body', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function(cb) { cb(null, 'some-text', 'text/plain'); },
          METHOD_SIGNATURE,
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        request(app).get(method.url)
          .expect(200)
          .expect('Content-Type', /^text\/plain/)
          .expect('some-text')
          .end(done);
      });
    });

    it('should send back Stream body', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function(cb) {
            const stream = new Readable();
            stream.push('some-text');
            stream.push(null); // EOF
            cb(null, stream, 'text/plain');
          },
          METHOD_SIGNATURE,
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        request(app).get(method.url)
          .expect(200)
          .expect('Content-Type', /^text\/plain/)
          .expect('some-text')
          .end(done);
      });
    });

    it('should fail for unsupported value type', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function(cb) { cb(null, [1, 2]); },
          METHOD_SIGNATURE,
        );

        request(app).get(method.url)
          .expect(500)
          .expect('Content-Type', /json/)
          .end(function(err, res) {
            if (err) return reject(err);
            try {
              assert(res.body.error);
              assert(res.body.error.message.match(/array/));
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          });
      });
    });
  });

  it('returns correct error response body', function(t) {
    return new Promise((resolve, reject) => {
      function TestError() {
        Error.captureStackTrace(this, TestError);
        this.name = 'TestError';
        this.message = 'a test error';
        this.status = 444;
        this.aCustomProperty = 'a-custom-value';
      }
      inherits(TestError, Error);

      const method = givenSharedStaticMethod(function(cb) { cb(new TestError()); });

      json(method.url)
        .expect(444)
        .end(function(err, result) {
          if (err) return reject(err);
          try {
            assert(result.body.error);
            const expected = {
              name: 'TestError',
              status: 444,
              message: 'a test error',
              aCustomProperty: 'a-custom-value',
            };
            for (const prop in expected) {
              assert.strictEqual(result.body.error[prop], expected[prop], prop);
            }
            assert(result.body.error.stack.includes(__filename), 'stack');
            resolve();
          } catch (assertErr) {
            reject(assertErr);
          }
        });
    });
  });

  it('coerces array values passed to a string argument', function(t) {
    return new Promise((resolve, reject) => {
      const method = givenSharedStaticMethod(
        function(arg, cb) { cb(null, arg); },
        {
          accepts: {arg: 'arg', type: 'string'},
          returns: {arg: 'arg', type: 'string'},
        },
      );

      request(app).get(method.url + '?arg=1&arg=2')
        .expect(200)
        .end(function(err, res) {
          if (err) return reject(err);
          try {
            assert.strictEqual(res.body.arg, '1,2');
            resolve();
          } catch (assertErr) {
            reject(assertErr);
          }
        });
    });
  });

  it('detects json type with charset definition', function(t) {
    return new Promise((resolve, reject) => {
      const method = givenSharedStaticMethod(
        function(arg, cb) { cb(null, arg); },
        {
          accepts: {arg: 'arg', type: 'any', http: {source: 'form'}},
          returns: {arg: 'arg', type: 'any'},
        },
      );

      request(app).post(method.url)
        .set('Content-Type', 'application/json;charset=UTF-8')
        .send({arg: '123'})
        .expect(200)
        .end(function(err, res) {
          if (err) return reject(err);
          try {
            // JSON request was detected, sloppy coercion was not triggered
            assert.strictEqual(res.body.arg, '123');
            resolve();
          } catch (assertErr) {
            reject(assertErr);
          }
        });
    });
  });

  it('rejects multi-item array passed to a number argument', function(t) {
    return new Promise((resolve, reject) => {
      const method = givenSharedStaticMethod(
        function(arg, cb) { cb(); },
        {accepts: {arg: 'arg', type: 'number'}},
      );

      const done = (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      request(app).get(method.url + '?arg=1&arg=2')
        .expect(400)
        .end(done);
    });
  });

  it('rejects multi-item array passed to an integer argument',
    function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(
          function(arg, cb) { cb(); },
          {accepts: {arg: 'arg', type: 'integer'}},
        );

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        request(app).get(method.url + '?arg=2&arg=3')
          .expect(400)
          .end(done);
      });
    });

  it('supports "Object" type string', function(t) {
    return new Promise((resolve, reject) => {
      const method = givenSharedStaticMethod(
        function(arg, cb) { cb(); },
        {accepts: {arg: 'arg', type: 'Object'}},
      );

      const done = (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      request(app)
        .get(method.url + '?arg={"x":1}')
        .expect(204)
        .end(done);
    });
  });

  it('supports custom type string', function(t) {
    return new Promise((resolve, reject) => {
      const method = givenSharedStaticMethod(
        function(arg, cb) { cb(); },
        {accepts: {arg: 'arg', type: 'Model'}},
      );

      const done = (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      request(app)
        .get(method.url + '?arg={"x":1}')
        .expect(204)
        .end(done);
    });
  });

  it('returns correct content-type in an empty XML response', function(t) {
    return new Promise((resolve, reject) => {
      const method = givenSharedStaticMethod(
        function(arg, cb) { cb(); },
        {accepts: {arg: 'arg', type: 'Model'}},
      );

      request(app)
        .get(method.url + '?arg={"x":1}&_format=xml')
        .expect(204)
        .end(function(err, res) {
          if (err) {
            reject(err);
          } else {
            try {
              assert(res.get('Content-type').match(/xml/));
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          }
        });
    });
  });

  it('defaults content-type to application/json', function(t) {
    return new Promise((resolve, reject) => {
      const method = givenSharedStaticMethod(
        function(arg, cb) { cb(); },
        {accepts: {arg: 'arg', type: 'Model'}},
      );

      request(app)
        .get(method.url + '?arg={"x":1}')
        .expect(204)
        .end(function(err, res) {
          if (err) {
            reject(err);
          } else {
            try {
              assert(res.get('Content-type').match(/application\/json/));
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          }
        });
    });
  });

  it('does not default content-type to application/json if response is 304', async () => {
    const method = givenSharedStaticMethod(
      cb => cb(null, {key: 'value'}),
      {returns: {arg: 'result', type: 'object'}},
    );
    let res = await request(app).get(method.url).expect(200);
    assert(res.headers['content-type']);
    res = await request(app).get(method.url)
      .set('If-None-Match', res.headers.etag)
      .expect(304);
    assert(!res.headers['content-type']);
  });

  it('does not default content-type to application/json if response is 304 and content already sent', async () => {
    const method = givenSharedStaticMethod(
      (res) => {
        res.status(304).end();
        return Promise.resolve({});
      },
      {accepts: {arg: 'res', type: 'object', http: {source: 'res'}}},
    );

    const res = await request(app).get(method.url).expect(304);
    assert(!res.headers['content-type']);
  });

  it('does not default content-type to application/json if response is 302', async () => {
    const method = givenSharedStaticMethod(
      (res) => {
        res.status(302).end();
        return Promise.resolve({});
      },
      {accepts: {arg: 'res', type: 'object', http: {source: 'res'}}},
    );

    const res = await request(app).get(method.url).expect(302);
    assert(!res.headers['content-type']);
  });

  describe('client', function() {
    describe('call of constructor method', function() {
      it('should work', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function greet(msg, cb) {
              cb(null, msg);
            },
            {
              accepts: {arg: 'person', type: 'string'},
              returns: {arg: 'msg', type: 'string'},
            },
          );

          const msg = 'hello';
          objects.invoke(method.name, [msg], function(err, resMsg) {
            if (err) return reject(err);
            try {
              assert.equal(resMsg, msg);
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          });
        });
      });

      it('should allow arguments in the path', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function bar(a, b, cb) {
              cb(null, a + b);
            },
            {
              accepts: [
                {arg: 'b', type: 'number'},
                {arg: 'a', type: 'number', http: {source: 'path'}},
              ],
              returns: {arg: 'n', type: 'number'},
              http: {path: '/:a'},
            },
          );

          objects.invoke(method.name, [1, 2], function(err, n) {
            if (err) return reject(err);
            try {
              assert.equal(n, 3);
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          });
        });
      });

      it('should allow arguments in the query', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function bar(a, b, cb) {
              cb(null, a + b);
            },
            {
              accepts: [
                {arg: 'b', type: 'number'},
                {arg: 'a', type: 'number', http: {source: 'query'}},
              ],
              returns: {arg: 'n', type: 'number'},
              http: {path: '/'},
            },
          );

          objects.invoke(method.name, [1, 2], function(err, n) {
            if (err) return reject(err);
            try {
              assert.equal(n, 3);
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          });
        });
      });

      it('should pass undefined if the argument is not supplied', function(t) {
        return new Promise((resolve, reject) => {
          let called = false;
          const method = givenSharedStaticMethod(
            function bar(a, cb) {
              called = true;
              assert(a === undefined, 'a should be undefined');
              cb();
            },
            {
              accepts: [
                {arg: 'b', type: 'number'},
              ],
            },
          );

          objects.invoke(method.name, [], function(err) {
            if (err) return reject(err);
            try {
              assert(called);
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          });
        });
      });

      it('should allow arguments in the body', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function bar(a, cb) {
              cb(null, a);
            },
            {
              accepts: [
                {arg: 'a', type: 'object', http: {source: 'body'}},
              ],
              returns: {arg: 'data', type: 'object', root: true},
              http: {path: '/'},
            },
          );

          const obj = {
            foo: 'bar',
          };

          objects.invoke(method.name, [obj], function(err, data) {
            if (err) return reject(err);
            try {
              assert.deepStrictEqual(obj, data);
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          });
        });
      });

      it('should allow arguments in the body with date', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function bar(a, cb) {
              cb(null, a);
            },
            {
              accepts: [
                {arg: 'a', type: 'object', http: {source: 'body'}},
              ],
              returns: {arg: 'data', type: 'object', root: true},
              http: {path: '/'},
            },
          );

          const data = {date: {$type: 'date', $data: new Date()}};
          objects.invoke(method.name, [data], function(err, resData) {
            if (err) return reject(err);
            try {
              assert.deepStrictEqual(resData, {date: data.date.$data.toISOString()});
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          });
        });
      });

      it('should allow arguments in the form', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function bar(a, b, cb) {
              cb(null, a + b);
            },
            {
              accepts: [
                {arg: 'b', type: 'number', http: {source: 'form'}},
                {arg: 'a', type: 'number', http: {source: 'form'}},
              ],
              returns: {arg: 'n', type: 'number'},
              http: {path: '/'},
            },
          );

          objects.invoke(method.name, [1, 2], function(err, n) {
            if (err) return reject(err);
            try {
              assert.equal(n, 3);
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          });
        });
      });

      it('should respond with correct args if returns has multiple args', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedStaticMethod(
            function(a, b, cb) {
              cb(null, a, b);
            },
            {
              accepts: [
                {arg: 'a', type: 'number'},
                {arg: 'b', type: 'number'},
              ],
              returns: [
                {arg: 'a', type: 'number'},
                {arg: 'b', type: 'number'},
              ],
            },
          );

          objects.invoke(method.name, [1, 2], function(err, a, b) {
            if (err) return reject(err);
            try {
              assert.equal(a, 1);
              assert.equal(b, 2);
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          });
        });
      });

      describe('uncaught errors', function() {
        it('should return 500 if an error object is thrown', function(t) {
          return new Promise((resolve, reject) => {
            const errMsg = 'an error';
            const method = givenSharedStaticMethod(
              function(a, b, cb) {
                throw new Error(errMsg);
              },
            );

            objects.invoke(method.name, function(err) {
              try {
                assert(err instanceof Error);
                assert.equal(err.message, errMsg);
                resolve();
              } catch (assertErr) {
                reject(assertErr);
              }
            });
          });
        });
      });

      it('should hounour class-level normalizeHttpPath', function(t) {
        return new Promise((resolve, reject) => {
          const sharedClass = givenSharedClass('TestModel', {
            normalizeHttpPath: true,
          });

          const sharedMethod = givenSharedMethodOnClass(
            sharedClass,
            'echoMessage',
            function echoMessage(cb) { cb(); },
            {isStatic: true},
          );

          let requestUrl = 'hook not triggered';
          objects.before(sharedMethod.stringName, (ctx, next) => {
            requestUrl = ctx.req.originalUrl;
            next();
          });

          objects.invoke(sharedMethod.stringName, [], function(err, result) {
            if (err) return reject(err);
            try {
              assert.strictEqual(requestUrl, '/test-model/echo-message');
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          });
        });
      });

      it('should hounour app-wide normalizeHttpPath', function(t) {
        return new Promise((resolve, reject) => {
          const sharedClass = givenSharedClass('TestModel');

          const sharedMethod = givenSharedMethodOnClass(
            sharedClass,
            'echoMessage',
            function echoMessage(cb) { cb(); },
            {isStatic: true},
          );

          restHandlerOptions = {normalizeHttpPath: true};
          objects.serverAdapter.options = {normalizeHttpPath: true};

          let requestUrl = 'hook not triggered';
          objects.before(sharedMethod.stringName, (ctx, next) => {
            requestUrl = ctx.req.originalUrl;
            next();
          });

          objects.invoke(sharedMethod.stringName, [], function(err, result) {
            if (err) return reject(err);
            try {
              assert.strictEqual(requestUrl, '/test-model/echo-message');
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          });
        });
      });
    });

    describe('call of prototype method', function() {
      it('should work', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedPrototypeMethod(
            function greet(msg, cb) {
              cb(null, this.id + ':' + msg);
            },
            {
              accepts: {arg: 'person', type: 'string'},
              returns: {arg: 'msg', type: 'string'},
            },
          );

          const msg = 'hello';
          objects.invoke(method.name, ['anId'], [msg], function(err, resMsg) {
            if (err) return reject(err);
            try {
              assert.equal(resMsg, 'anId:' + msg);
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          });
        });
      });

      it('should allow arguments in the path', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedPrototypeMethod(
            function bar(a, b, cb) {
              cb(null, Number(this.id) + a + b);
            },
            {
              accepts: [
                {arg: 'b', type: 'number'},
                {arg: 'a', type: 'number', http: {source: 'path'}},
              ],
              returns: {arg: 'n', type: 'number'},
              http: {path: '/:a'},
            },
          );

          objects.invoke(method.name, [39], [1, 2], function(err, n) {
            if (err) return reject(err);
            try {
              assert.equal(n, 42);
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          });
        });
      });

      it('should allow arguments in the query', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedPrototypeMethod(
            function bar(a, b, cb) {
              cb(null, Number(this.id) + a + b);
            },
            {
              accepts: [
                {arg: 'b', type: 'number'},
                {arg: 'a', type: 'number', http: {source: 'query'}},
              ],
              returns: {arg: 'n', type: 'number'},
              http: {path: '/'},
            },
          );

          objects.invoke(method.name, [39], [1, 2], function(err, n) {
            if (err) return reject(err);
            try {
              assert.equal(n, 42);
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          });
        });
      });

      it('should pass undefined if the argument is not supplied', function(t) {
        return new Promise((resolve, reject) => {
          let called = false;
          const method = givenSharedPrototypeMethod(
            function bar(a, cb) {
              called = true;
              assert(a === undefined, 'a should be undefined');
              cb();
            },
            {
              accepts: [
                {arg: 'b', type: 'number'},
              ],
            },
          );

          objects.invoke(method.name, [39], [], function(err) {
            if (err) return reject(err);
            try {
              assert(called);
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          });
        });
      });

      it('should allow arguments in the body', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedPrototypeMethod(
            function bar(a, cb) {
              cb(null, a);
            },
            {
              accepts: [
                {arg: 'a', type: 'object', http: {source: 'body'}},
              ],
              returns: {arg: 'data', type: 'object', root: true},
              http: {path: '/'},
            },
          );

          const obj = {
            foo: 'bar',
          };

          objects.invoke(method.name, [39], [obj], function(err, data) {
            if (err) return reject(err);
            try {
              assert.deepStrictEqual(obj, data);
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          });
        });
      });

      it('should allow arguments in the body with date', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedPrototypeMethod(
            function bar(a, cb) {
              cb(null, a);
            },
            {
              accepts: [
                {arg: 'a', type: 'object', http: {source: 'body'}},
              ],
              returns: {arg: 'data', type: 'object', root: true},
              http: {path: '/'},
            },
          );

          const data = {date: {$type: 'date', $data: new Date()}};
          objects.invoke(method.name, [39], [data], function(err, resData) {
            if (err) return reject(err);
            try {
              assert.deepStrictEqual(resData, {date: data.date.$data.toISOString()});
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          });
        });
      });

      it('should allow arguments in the form', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedPrototypeMethod(
            function bar(a, b, cb) {
              cb(null, Number(this.id) + a + b);
            },
            {
              accepts: [
                {arg: 'b', type: 'number', http: {source: 'form'}},
                {arg: 'a', type: 'number', http: {source: 'form'}},
              ],
              returns: {arg: 'n', type: 'number'},
              http: {path: '/'},
            },
          );

          objects.invoke(method.name, [39], [1, 2], function(err, n) {
            if (err) return reject(err);
            try {
              assert.equal(n, 42);
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          });
        });
      });

      it('should respond with correct args if returns has multiple args', function(t) {
        return new Promise((resolve, reject) => {
          const method = givenSharedPrototypeMethod(
            function(a, b, cb) {
              cb(null, this.id, a, b);
            },
            {
              accepts: [
                {arg: 'a', type: 'number'},
                {arg: 'b', type: 'number'},
              ],
              returns: [
                {arg: 'id', type: 'any'},
                {arg: 'a', type: 'number'},
                {arg: 'b', type: 'number'},
              ],
            },
          );

          objects.invoke(method.name, ['39'], [1, 2], function(err, id, a, b) {
            if (err) return reject(err);
            try {
              assert.equal(id, '39');
              assert.equal(a, 1);
              assert.equal(b, 2);
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          });
        });
      });

      describe('uncaught errors', function() {
        it('should return 500 if an error object is thrown', function(t) {
          return new Promise((resolve, reject) => {
            const errMsg = 'an error';
            const method = givenSharedPrototypeMethod(
              function(a, b, cb) {
                throw new Error(errMsg);
              },
            );

            objects.invoke(method.name, ['39'], function(err) {
              try {
                assert(err instanceof Error);
                assert.equal(err.message, errMsg);
                resolve();
              } catch (assertErr) {
                reject(assertErr);
              }
            });
          });
        });
      });
    });
  });

  function givenSharedStaticMethod(fn, config) {
    if (typeof fn === 'object' && config === undefined) {
      config = fn;
      fn = null;
    }
    fn = fn || function(cb) { cb(); };

    remotes.testClass = {testMethod: fn};
    config = Object.assign({shared: true}, config);
    Object.assign(remotes.testClass.testMethod, config);
    return {
      name: 'testClass.testMethod',
      url: '/testClass/testMethod',
      classUrl: '/testClass',
    };
  }

  function givenSharedPrototypeMethod(fn, config) {
    if (typeof fn === 'object' && config === undefined) {
      config = fn;
      fn = undefined;
    }

    fn = fn || function(cb) { cb(); };
    remotes.testClass = factory.createSharedClass();
    remotes.testClass.prototype.testMethod = fn;
    config = Object.assign({shared: true}, config);
    Object.assign(remotes.testClass.prototype.testMethod, config);
    return {
      name: 'testClass.prototype.testMethod',
      getClassUrlForId: function(id) {
        return '/testClass/' + id;
      },
      getUrlForId: function(id) {
        return this.getClassUrlForId(id) + '/testMethod';
      },
      url: '/testClass/an-id/testMethod',
      ctor: remotes.testClass,
    };
  }

  function expectErrorResponseContaining(keyValues, excludedKeyValues, done) {
    if (done === undefined && typeof excludedKeyValues === 'function') {
      done = excludedKeyValues;
      excludedKeyValues = [];
    }
    return function(err, resp) {
      if (err) return done(err);
      for (const prop in keyValues) {
        assert.strictEqual(resp.body.error[prop], keyValues[prop]);
      }
      for (let i = 0, n = excludedKeyValues.length; i < n; i++) {
        assert.strictEqual(resp.body.error[excludedKeyValues[i]], undefined);
      }
      done();
    };
  }

  it('should skip the super class and only expose user defined remote methods',
    function() {
      function base() {
      }

      function foo() {
      }

      foo.bar = function() {
      };

      foo.bar.shared = true;

      inherits(foo, base);
      base.shared = true;
      foo.shared = true;

      foo.sharedCtor = function() {};

      remotes.foo = foo;

      const methodNames = [];
      const methods = objects.methods();

      for (let i = 0; i < methods.length; i++) {
        methodNames.push(methods[i].stringName);
      }

      assert(!methodNames.includes('super_'));
      assert(methodNames.includes('foo.bar'));
      assert.strictEqual(methodNames.length, 1);
    });

  describe('afterError hook', function() {
    it('should be called when the method fails', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(function(cb) {
          cb(TEST_ERROR);
        });

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        verifyErrorHookIsCalled(method, TEST_ERROR, done);
      });
    });

    it('should be called when a "before" hook fails', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod();

        objects.before(method.name, function(ctx, next) {
          next(TEST_ERROR);
        });

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        verifyErrorHookIsCalled(method, TEST_ERROR, done);
      });
    });

    it('should be called when an "after" hook fails', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod();

        objects.after(method.name, function(ctx, next) {
          next(TEST_ERROR);
        });

        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        verifyErrorHookIsCalled(method, TEST_ERROR, done);
      });
    });

    it('can replace the error object', function(t) {
      return new Promise((resolve, reject) => {
        const method = givenSharedStaticMethod(function(cb) {
          cb(new Error(
            'error from the method, should have been shadowed by the hook',
          ));
        });
        objects.afterError(method.name, function(ctx, next) {
          next(new Error('error from the hook'));
        });

        json(method.url)
          .expect(500)
          .end(function(err, res) {
            if (err) return reject(err);
            try {
              assert.strictEqual(res.body.error.message, 'error from the hook');
              resolve();
            } catch (assertErr) {
              reject(assertErr);
            }
          });
      });
    });

    it('is not called on success', function(t) {
      return new Promise((resolve, reject) => {
        let hookCalled = false;
        const method = givenSharedStaticMethod(function(cb) {
          cb();
        });

        objects.afterError(method.name, function(ctx, next) {
          hookCalled = true;
          next();
        });

        json(method.url).end(function(err) {
          if (err) return reject(err);
          try {
            assert.strictEqual(hookCalled, false, 'hookCalled');
            resolve();
          } catch (assertErr) {
            reject(assertErr);
          }
        });
      });
    });

    function verifyErrorHookIsCalled(method, expectedError, done) {
      let hookContext = 'hook not called';

      objects.afterError(method.name, function(ctx, next) {
        if (Array.isArray(hookContext)) {
          hookContext.push(ctx);
        } else if (typeof hookContext === 'object') {
          hookContext = [hookContext, ctx];
        } else {
          hookContext = ctx;
        }
        ctx.error.hookData = true;
        next();
      });

      json(method.url)
        .expect(500)
        .end(function(err, res) {
          if (err) return done(err);
          assert.strictEqual(res.body.error.hookData, true);
          assert.strictEqual(hookContext.error, expectedError);
          done();
        });
    }
  });

  function givenSharedClass(name, options) {
    const ModelCtor = function() {};
    const sharedClass = new SharedClass('TestModel', ModelCtor, options);
    objects.addClass(sharedClass);
    return sharedClass;
  }

  function givenSharedMethodOnClass(sharedClass, methodName, fn, options) {
    const ctor = sharedClass.ctor;
    const target = options.isStatic ? ctor : ctor.prototype;
    target[methodName] = fn;

    return sharedClass.defineMethod(methodName, options);
  }

  function unhandledRejection(err) {
    throw err;
  }
});
