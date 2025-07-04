// Copyright IBM Corp. 2014,2018. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

// Native Node.js test imports
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
// Use Object.assign() instead of deprecated util._extend
const extend = Object.assign;
const RemoteObjects = require('../');
const express = require('express');
const { expect } = require('./test-config'); // Use native expect interface
const factory = require('./helpers/shared-objects-factory.js');

describe('strong-remoting-rest', function() {
  let app, server, objects, remotes;
  const adapterName = 'rest';

  before(function(done) {
    app = express();
    app.use(function(req, res, next) {
      // create the handler for each request
      objects.handler(adapterName).apply(objects, arguments);
    });
    server = app.listen(0, done);
  });

  after(function(done) {
    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  // setup
  beforeEach(function() {
    objects = RemoteObjects.create({
      errorHandler: {debug: true},
    });
    remotes = objects.exports;

    // connect to the app
    objects.connect('http://localhost:' + server.address().port, adapterName);
  });

  describe('client', function() {
    describe('call of constructor method', function() {
      it('should work', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
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
          assert.equal(resMsg, msg);
          done();
        });
      }); // End of Promise
    }); // End of it

      it('should allow arguments in the path', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
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
          assert.equal(n, 3);
          done();
        });
      }); // End of Promise
    }); // End of it

      it('should allow arguments in the query', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
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
          assert.equal(n, 3);
          done();
        });
      }); // End of Promise
    }); // End of it

      it('should allow arguments in the header', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
        const method = givenSharedStaticMethod(
          function bar(a, b, cb) {
            cb(null, a + b);
          },
          {
            accepts: [
              {arg: 'b', type: 'number'},
              {arg: 'a', type: 'number', http: {source: 'header'}},
            ],
            returns: {arg: 'n', type: 'number'},
            http: {path: '/'},
          },
        );

        objects.invoke(method.name, [1, 2], function(err, n) {
          assert.equal(n, 3);
          done();
        });
      }); // End of Promise
    }); // End of it

      it('should pass undefined if the argument is not supplied', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
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
          assert(called);
          done();
        });
      }); // End of Promise
    }); // End of it

      it('should allow arguments in the body', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
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
          expect(obj).to.deep.equal(data);
          done();
        });
      }); // End of Promise
    }); // End of it

      it('should allow arguments in the body with date', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
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
          expect(resData).to.deep.equal({date: data.date.$data.toISOString()});
          done();
        });
      }); // End of Promise
    }); // End of it

      it('should allow arguments in the form', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
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
          assert.equal(n, 3);
          done();
        });
      }); // End of Promise
    }); // End of it

      it('should allow arguments in the formData', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
        const method = givenSharedStaticMethod(
          function bar(a, b, cb) {
            cb(null, a + b);
          },
          {
            accepts: [
              {arg: 'b', type: 'number', http: {source: 'formData'}},
              {arg: 'a', type: 'number', http: {source: 'formData'}},
            ],
            returns: {arg: 'n', type: 'number'},
            http: {path: '/'},
          },
        );

        objects.invoke(method.name, [1, 2], function(err, n) {
          assert.equal(n, 3);
          done();
        });
      }); // End of Promise
    }); // End of it

      it('should respond with correct args if returns has multiple args', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
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
          assert.equal(a, 1);
          assert.equal(b, 2);
          done();
        });
      }); // End of Promise
    }); // End of it

      it('should allow and return falsy required arguments of correct type', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
          const method = givenSharedStaticMethod(
            function bar(num, bool, cb) {
              cb(null, num, bool);
            },
            {
              accepts: [
                {arg: 'num', type: 'number', required: true},
                {arg: 'bool', type: 'boolean', required: true},
              ],
              returns: [
                {arg: 'num', type: 'number'},
                {arg: 'bool', type: 'boolean'},
              ],
              http: {path: '/'},
            },
          );

          objects.invoke(method.name, [0, false], function(err, a, b) {
            if (err) return done(err);
            assert.equal(a, 0);
            assert.equal(b, false);
            done();
          });
        }); // End of Promise
      }); // End of it

      it('should reject empty string when string required', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
          const method = givenSharedStaticMethod(
            function bar(str, cb) {
              cb(null, str);
            },
            {
              accepts: [
                {arg: 'str', type: 'string', required: true},
              ],
              returns: [
                {arg: 'str', type: 'string'},
              ],
              http: {path: '/'},
            },
          );

          try {
            objects.invoke(method.name, [''], function(err, a, b, c) {
              // If we get here, the error should be in the err parameter
              expect(err).to.be.an.instanceOf(Error);
              done();
            });
          } catch (syncError) {
            // If validation fails synchronously, catch it here
            expect(syncError).to.be.an.instanceOf(Error);
            done();
          }
        }); // End of Promise
      }); // End of it

      it('should reject falsy required arguments of incorrect type', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
        const method = givenSharedStaticMethod(
          function bar(num, str, bool, cb) {
            cb(null, num, str, bool);
          },
          {
            accepts: [
              {arg: 'num', type: 'number', required: true},
              {arg: 'str', type: 'string', required: true},
              {arg: 'bool', type: 'boolean', required: true},
            ],
            returns: [
              {arg: 'num', type: 'number'},
              {arg: 'str', type: 'string'},
              {arg: 'bool', type: 'boolean'},
            ],
            http: {path: '/'},
          },
        );

        try {
          objects.invoke(method.name, ['', false, 0], function(err, a, b, c) {
            // If we get here, the error should be in the err parameter
            expect(err).to.be.an.instanceOf(Error);
            done();
          });
        } catch (syncError) {
          // If validation fails synchronously, catch it here
          expect(syncError).to.be.an.instanceOf(Error);
          done();
        }
      }); // End of Promise
    }); // End of it

      it('handles anonymous object types in the response', function(t) {
        return new Promise((resolve, reject) => {
          const done = (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          };

          const method = givenSharedStaticMethod(
            function updateAll(cb) {
              cb(null, {count: 1});
            },
            // See LoopBack's PersistedModel.updateAll method
            {
              returns: {
                arg: 'info',
                type: {
                  count: {
                    type: 'number',
                    description: 'The number of instances updated',
                  },
                },
                root: true,
              },
              http: {path: '/'},
            },
          );

          objects.invoke(method.name, [], (err, result) => {
            if (err) return done(err);
            expect(result).to.eql({count: 1});
            done();
          });
        });
      });

      describe('uncaught errors', function() {
        beforeEach(function() {
          const optsErrorHandler = {errorHandler: {debug: true, log: false}};
          extend(objects.options, optsErrorHandler);
        });
        it('should return 500 if an error object is thrown', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
          const errMsg = 'an error';
          const method = givenSharedStaticMethod(
            function(a, b, cb) {
              throw new Error(errMsg);
            },
          );

          objects.invoke(method.name, function(err) {
            assert(err instanceof Error);
            assert.equal(err.message, errMsg);
            done();
          });
        }); // End of Promise
      }); // End of it
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
    config = extend({shared: true}, config);
    extend(remotes.testClass.testMethod, config);
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
    config = extend({shared: true}, config);
    extend(remotes.testClass.prototype.testMethod, config);
    return {
      name: 'testClass.prototype.testMethod',
      getClassUrlForId: function(id) {
        return '/testClass/' + id;
      },
      getUrlForId: function(id) {
        return this.getClassUrlForId(id) + '/testMethod';
      },
      url: '/testClass/an-id/testMethod',
    };
  }

  function expectErrorResponseContaining(keyValues, done) {
    return function(err, resp) {
      if (err) return done(err);
      for (const prop in keyValues) {
        expect(resp.body.error).to.have.property(prop, keyValues[prop]);
      }
      done();
    };
  }

});
