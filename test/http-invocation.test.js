// Copyright IBM Corp. 2014,2017. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

// Native Node.js test imports
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const HttpInvocation = require('../lib/http-invocation');
const SharedMethod = require('../lib/shared-method');
const extend = require('util')._extend;
const { expect } = require('./test-config'); // Use native expect interface
const TypeRegistry = require('../lib/type-registry');

describe('HttpInvocation', function() {
  describe('namedArgs', function() {
    function expectNamedArgs(accepts, inputArgs, expectedNamedArgs) {
      const method = givenSharedStaticMethod({
        accepts: accepts,
      });
      const inv = givenInvocation(method, {args: inputArgs});
      expect(inv.namedArgs).to.deep.equal(expectedNamedArgs);
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

        expect(inst).to.be.instanceOf(TestClass);
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

        expect(insts).to.be.an('array');
        expect(insts[0]).to.be.instanceOf(TestClass);
        expect(insts[1]).to.be.instanceOf(TestClass);
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

        expect(err).to.have.property('name', 'CustomError');
        expect(err).to.have.property('message', 'Custom error message');
        expect(err).to.have.property('statusCode', 555);
        expect(err).to.have.property('details').eql({key: 'value'});
        expect(err).to.have.property('extra', 'extra value');
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

        expect(err).to.have.property('statusCode', 555);
        expect(err).to.have.property('details', 'error body');
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
      const expectedReq = {method: 'GET',
        url: 'http://base/testModel/testMethod',
        protocol: 'http:',
        json: true,
      };
      expect(inv.createRequest()).to.eql(expectedReq);
    });

    it('creates a loopback auth request', function() {
      const inv = givenInvocationForEndpoint(null, [], null,
        {accessToken: {id: 'abc'}});
      expect(inv.createRequest().headers).to.have.property('Authorization', 'abc');
    });

    it('makes primitive type arguments as query params', function() {
      const accepts = [
        {arg: 'a', type: 'number'},
        {arg: 'b', type: 'string'},
      ];
      const aValue = 2;
      const bValue = 'foo';
      const inv = givenInvocationForEndpoint(accepts, [aValue, bValue]);
      const expectedReq = {method: 'GET',
        url: 'http://base/testModel/testMethod?a=2&b=foo',
        protocol: 'http:',
        json: true,
      };
      expect(inv.createRequest()).to.eql(expectedReq);
    });

    it('makes an array argument as a query param', function() {
      const accepts = [
        {arg: 'a', type: 'object'},
      ];
      const aValue = [1, 2, 3];
      const inv = givenInvocationForEndpoint(accepts, [aValue]);
      const expectedReq = {method: 'GET',
        url: 'http://base/testModel/testMethod?a=' + encodeURIComponent('[1,2,3]'),
        protocol: 'http:',
        json: true,
      };
      expect(inv.createRequest()).to.eql(expectedReq);
    });

    it('keeps an empty array as a query param', function() {
      const accepts = [
        {arg: 'a', type: 'object'},
      ];
      const aValue = [];
      const inv = givenInvocationForEndpoint(accepts, [aValue]);
      const expectedReq = {method: 'GET',
        url: 'http://base/testModel/testMethod?a=' + encodeURIComponent('[]'),
        protocol: 'http:',
        json: true,
      };
      expect(inv.createRequest()).to.eql(expectedReq);
    });

    it('keeps an empty array as a body param for a POST request', function() {
      const accepts = [
        {arg: 'a', type: 'object'},
      ];
      const aValue = [];
      const inv = givenInvocationForEndpoint(accepts, [aValue], 'POST');
      const expectedReq = {method: 'POST',
        url: 'http://base/testModel/testMethod',
        protocol: 'http:',
        json: true,
        body: {
          a: [],
        },
      };
      expect(inv.createRequest()).to.eql(expectedReq);
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
      const expectedReq = {method: 'GET',
        url: 'http://base/testModel/testMethod?filter=' +
          encodeURIComponent(expectedFilter),
        protocol: 'http:',
        json: true,
      };
      expect(inv.createRequest()).to.eql(expectedReq);
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
    const expectedReq = {method: 'POST',
      url: 'http://base/testModel/testMethod',
      protocol: 'http:',
      json: true,
      body: {
        filter: filter,
      },
    };
    expect(inv.createRequest()).to.eql(expectedReq);
    });
  });
});

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
    baseUrl: 'http://base',
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
