// Copyright IBM Corp. 2014,2017. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

// Native Node.js test imports
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('http');
const HttpInvocation = require('../lib/http-invocation');
const SharedMethod = require('../lib/shared-method');
const extend = Object.assign;
const TypeRegistry = require('../lib/type-registry');

describe('HttpInvocation', function() {
  let server, app, baseUrl;

  before(async function() {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Test endpoints
    app.get('/testModel/testMethod', (req, res) => {
      res.json({ message: 'GET success', query: req.query });
    });

    app.post('/testModel/testMethod', (req, res) => {
      res.json({ message: 'POST success', body: req.body });
    });

    server = http.createServer(app);

    await new Promise((resolve, reject) => {
      server.listen(0, (err) => {
        if (err) {
          console.error('Server failed to start:', err);
          return reject(err);
        }
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        console.log('Test server started on:', baseUrl);
        resolve();
      });
    });
  });

  after(async function() {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  });

  describe('namedArgs', function() {
    function expectNamedArgs(accepts, inputArgs, expectedNamedArgs) {
      const method = givenSharedStaticMethod({
        accepts: accepts,
      });
      const inv = givenInvocation(method, {args: inputArgs});
      assert.deepStrictEqual(inv.namedArgs, expectedNamedArgs);
    }

    it('should correctly name a single arg', function() {
      expectNamedArgs(
        [{arg: 'a', type: 'number'}],
        [1],
        {a: 1},
      );
    });

    it('should correctly name multiple args', function() {
      expectNamedArgs(
        [{arg: 'a', type: 'number'}, {arg: 'str', type: 'string'}],
        [1, 'foo'],
        {a: 1, str: 'foo'},
      );
    });

    it('should correctly name multiple args when a partial set is provided', function() {
      expectNamedArgs(
        [{arg: 'a', type: 'number'}, {arg: 'str', type: 'string'}],
        [1],
        {a: 1},
      );
    });

    describe('HttpContext.isAcceptable()', function() {
      it('should accept an acceptable argument', function() {
        const acceptable = HttpInvocation.isAcceptable(2, {
          arg: 'foo',
          type: 'number',
        });
        assert.strictEqual(acceptable, true);
      });

      it('should always accept args when type is any', function() {
        const acceptable = HttpInvocation.isAcceptable(2, {
          arg: 'bar',
          type: 'any',
        });
        assert.strictEqual(acceptable, true);
      });

      it('should always accept args when type is complex', function() {
        const acceptable = HttpInvocation.isAcceptable({}, {
          arg: 'bar',
          type: 'MyComplexType',
        });
        assert.strictEqual(acceptable, true);
      });

      it('should accept null arg when type is complex', function() {
        const acceptable = HttpInvocation.isAcceptable(null, {
          arg: 'bar',
          type: 'MyComplexType',
        });
        assert.strictEqual(acceptable, true);
      });
    });
  });

  describe('transformResponse', function() {
    it('should return a single instance of TestClass', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      transformReturnType({
        arg: 'data',
        type: 'bar',
        root: true,
      }, 'bar', function(data) {
        return data ? new TestClass(data) : data;
      }, {
        body: {foo: 'bar'},
      }, function(err, inst) {
        if (err) return done(err);
        if (inst.error) return done(inst.error);

        assert(inst instanceof TestClass);
        assert.strictEqual(inst.foo, 'bar');
        done();
      }); // End of transformReturnType callback
      }); // End of Promise

      function TestClass(data) {
        this.foo = data.foo;
      }
    });

    it('should return an array of TestClass instances', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      transformReturnType({
        arg: 'data',
        type: ['bar'],
        root: true,
      }, 'bar', function(data) {
        return data ? new TestClass(data) : data;
      }, {
        body: [
          {foo: 'bar'},
          {foo: 'grok'},
        ],
      }, function(err, insts) {
        if (err) return done(err);
        if (insts.error) return done(insts.error);

        assert(Array.isArray(insts));
        assert(insts[0] instanceof TestClass);
        assert(insts[1] instanceof TestClass);
        assert.strictEqual(insts[0].foo, 'bar');
        assert.strictEqual(insts[1].foo, 'grok');
        done();
      });
      }); // End of Promise

      function TestClass(data) {
        this.foo = data.foo;
      }
    });

    it('should forward all error properties', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      const method = givenSharedStaticMethod({});
      const inv = givenInvocation(method);
      const res = {
        statusCode: 555,
        body: {
          error: {
            name: 'CustomError',
            message: 'Custom error message',
            statusCode: 555,
            details: {
              key: 'value',
            },
            extra: 'extra value',
          },
        },
      };

      inv.transformResponse(res, res.body, function(err) {
        if (!err)
          return done(new Error('transformResponse should have failed.'));

        assert.strictEqual(err.name, 'CustomError');
        assert.strictEqual(err.message, 'Custom error message');
        assert.strictEqual(err.statusCode, 555);
        assert.deepStrictEqual(err.details, {key: 'value'});
        assert.strictEqual(err.extra, 'extra value');
        done();
      });
      }); // End of Promise
    });

    it('should forward statusCode and non-object error response', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      const method = givenSharedStaticMethod({});
      const inv = givenInvocation(method);
      const res = {
        statusCode: 555,
        body: 'error body',
      };

      inv.transformResponse(res, res.body, function(err) {
        if (!err)
          return done(new Error('transformResponse should have failed.'));

        assert.strictEqual(err.statusCode, 555);
        assert.strictEqual(err.details, 'error body');
        done();
      });
      }); // End of Promise
    });

    function transformReturnType(returns, typeName, typeFactoryFn, res, cb) {
      const method = givenSharedStaticMethod({returns: returns});

      const typeRegistry = new TypeRegistry();
      typeRegistry.registerObjectType(typeName, typeFactoryFn);

      const inv = givenInvocation(method, {typeRegistry: typeRegistry});
      const body = res.body || {};

      inv.transformResponse(res, body, cb);
    }
  });

  describe('createRequest', function() {
    it('creates a simple request', function() {
      const inv = givenInvocationForEndpoint(null, []);
      const req = inv.createRequest();
      assert.strictEqual(req.method, 'GET');
      assert.strictEqual(req.url, `${baseUrl}/testModel/testMethod`);
    });

    it('creates a loopback auth request', function() {
      const inv = givenInvocationForEndpoint(null, [], null,
        {accessToken: {id: 'abc'}});
      assert.strictEqual(inv.createRequest().headers.Authorization, 'abc');
    });

    it('makes primitive type arguments as query params', function() {
      const accepts = [
        {arg: 'a', type: 'number'},
        {arg: 'b', type: 'string'},
      ];
      const aValue = 2;
      const bValue = 'foo';
      const inv = givenInvocationForEndpoint(accepts, [aValue, bValue]);
      const req = inv.createRequest();
      assert.strictEqual(req.method, 'GET');
      assert.strictEqual(req.url, `${baseUrl}/testModel/testMethod?a=2&b=foo`);
    });

    it('makes an array argument as a query param', function() {
      const accepts = [
        {arg: 'a', type: 'object'},
      ];
      const aValue = [1, 2, 3];
      const inv = givenInvocationForEndpoint(accepts, [aValue]);
      const req = inv.createRequest();
      assert.strictEqual(req.method, 'GET');
      assert.strictEqual(req.url, `${baseUrl}/testModel/testMethod?a=` + encodeURIComponent('[1,2,3]'));
    });

    it('keeps an empty array as a query param', function() {
      const accepts = [
        {arg: 'a', type: 'object'},
      ];
      const aValue = [];
      const inv = givenInvocationForEndpoint(accepts, [aValue]);
      const req = inv.createRequest();
      assert.strictEqual(req.method, 'GET');
      assert.strictEqual(req.url, `${baseUrl}/testModel/testMethod?a=` + encodeURIComponent('[]'));
    });

    it('keeps an empty array as a body param for a POST request', function() {
      const accepts = [
        {arg: 'a', type: 'object'},
      ];
      const aValue = [];
      const inv = givenInvocationForEndpoint(accepts, [aValue], 'POST');
      const req = inv.createRequest();
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.url, `${baseUrl}/testModel/testMethod`);
      assert.deepStrictEqual(req.body.a, []);
    });

    it('handles a loopback filter as a query param', function() {
      const accepts = [
        {arg: 'filter', type: 'object'},
      ];
      const filter = {
        where: {
          id: {
            inq: [1, 2],
          },
          typeId: {
            inq: [],
          },
        },
        include: ['related'],
      };
      const inv = givenInvocationForEndpoint(accepts, [filter]);
      const expectedFilter =
        '{"where":{"id":{"inq":[1,2]},"typeId":{"inq":[]}},"include":["related"]}';
      const req = inv.createRequest();
      assert.strictEqual(req.method, 'GET');
      assert.strictEqual(req.url, `${baseUrl}/testModel/testMethod?filter=` +
          encodeURIComponent(expectedFilter));
    });

    it('handles a loopback filter as a body param for a POST request', function() {
    const accepts = [
      {arg: 'filter', type: 'object'},
    ];
    const filter = {
      where: {
        id: {
          inq: [1, 2],
        },
        typeId: {
          inq: [],
        },
      },
      include: ['related'],
    };
    const inv = givenInvocationForEndpoint(accepts, [filter], 'POST');
    const req = inv.createRequest();
    assert.strictEqual(req.method, 'POST');
    assert.strictEqual(req.url, `${baseUrl}/testModel/testMethod`);
    assert.deepStrictEqual(req.body.filter, filter);
    });
  });

  // Helper functions - moved inside describe block to access baseUrl
  function givenSharedStaticMethod(fn, config) {
    if (typeof fn === 'object' && config === undefined) {
      config = fn;
      fn = null;
    }
    fn = fn || function(cb) { cb(); };

    const testClass = {testMethod: fn};
    config = extend({shared: true}, config);
    extend(testClass.testMethod, config);
    return SharedMethod.fromFunction(fn, 'testStaticMethodName', null, true);
  }

  function givenInvocation(method, params) {
    params = params || {};
    return new HttpInvocation(method,
      params.ctorArgs,
      params.args,
      params.baseUrl,
      params.auth,
      params.typeRegistry || new TypeRegistry());
  }

  function givenInvocationForEndpoint(accepts, args, verb, auth) {
    const method = givenSharedStaticMethod({
      accepts: accepts,
    });
    method.getEndpoints = function() {
      return [createEndpoint({verb: verb || 'GET'})];
    };
    return givenInvocation(method, {
      ctorArgs: [],
      args: args,
      baseUrl: baseUrl,
      auth: auth,
    });
  }

  function createEndpoint(config) {
    config = config || {};
    return {
      verb: config.verb || 'GET',
      fullPath: config.fullPath || '/testModel/testMethod',
    };
  }
});


