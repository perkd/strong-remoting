// Copyright IBM Corp. 2013,2017. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

// Native Node.js test imports
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const RemoteObjects = require('../');
const { expect } = require('./test-config'); // Use native expect interface
const SharedClass = require('../lib/shared-class');
const express = require('express');
const request = require('./helpers/native-http-test'); // Native HTTP testing
const fs = require('fs');
const es = require('event-stream');
const http = require('http');
const EventSource = require('eventsource');

describe('strong-remoting', function() {
  let app, remotes, objects;

  beforeEach(function() {
    objects = RemoteObjects.create();
    remotes = objects.exports;
    app = express();
    app.disable('x-powered-by');

    app.use(function(req, res, next) {
      objects.handler('rest').apply(objects, arguments);
    });
  });

  function json(method, url) {
    return request(app)[method](url)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .expect(200)
      .expect('Content-Type', /json/);
  }

  function createSteam() {
    remotes.fs = fs;
    fs.createReadStream.shared = true;
    fs.createReadStream.accepts = [
      {arg: 'path', type: 'string'},
      {arg: 'encoding', type: 'string'},
    ];
    fs.createReadStream.returns = {arg: 'res', type: 'stream'};
    fs.createReadStream.http = {
      verb: 'get',
      pipe: {
        dest: 'res',
      },
    };
  }

  it('should stream the file output', function(done) {
    createSteam();
    json('get', '/fs/createReadStream?path=' + __dirname + '/data/foo.json&encoding=utf8')
      .expect({bar: 'baz'}, done);
  });

  it('should stream the file output with no compression', function(done) {
    createSteam();
    request(app)['get']('/fs/createReadStream')
      .expect('Content-Encoding', 'x-no-compression')
      .end(done);
  });
});

describe('a function returning a ReadableStream', function() {
  const Readable = require('stream').Readable;
  const remotes = RemoteObjects.create();
  let streamClass, server, app, streamClosed;
  let activeStreams = [];

  before(function(done) {
    const test = this;
    // NOTE: Date is intentionally excluded as it is not supported yet
    const data = test.data = [{foo: 'bar'}, 'bat', false, 0, null];
    app = express();
    server = app.listen(0, '127.0.0.1', done);
    function StreamClass() {

    }

    StreamClass.createStream = function createStream(cb) {
      cb(null, es.readArray(test.data));
    };

    StreamClass.createStreamWithError = function createStreamWithError(cb) {
      const rs = new Readable({objectMode: true});

      rs._read = function() {
        // required method
      };

      process.nextTick(function() {
        rs.emit('error', new Error('test error'));
      });
      cb(null, rs);
    };

    StreamClass.createInfiniteStream = function createStream(cb) {
      let resolveStreamClosed;
      streamClosed = new Promise(resolve => {
        resolveStreamClosed = resolve;
      });

      let timeoutId;
      let destroyed = false;

      const rs = new Readable({
        objectMode: true,
        read: function(size) {
          if (destroyed) return;
          timeoutId = setTimeout(() => {
            if (!destroyed) {
              this.push({foo: 'bar'});
            }
          }, 50);
        },
        destroy: function(err, callback) {
          destroyed = true;
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          // Resolve the streamClosed promise
          if (resolveStreamClosed) {
            resolveStreamClosed(true);
            resolveStreamClosed = null;
          }

          if (callback) callback(err);
        },
      });

      // Handle connection close events
      rs.on('close', () => {
        destroyed = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (resolveStreamClosed) {
          resolveStreamClosed(true);
          resolveStreamClosed = null;
        }
      });

      // Track the stream for cleanup
      activeStreams.push(rs);
      cb(null, rs);
    };

    streamClass = new SharedClass('StreamClass', StreamClass);

    this.createStreamMethod = streamClass.defineMethod('createStream', {
      isStatic: true,
      fn: StreamClass.createStream,
      returns: [{
        arg: 'result',
        type: 'any',
      }],
    });

    streamClass.defineMethod('createStreamWithError', {
      isStatic: true,
      fn: StreamClass.createStreamWithError,
      returns: [{
        arg: 'result',
        type: 'any',
      }],
    });

    streamClass.defineMethod('createInfiniteStream', {
      isStatic: true,
      fn: StreamClass.createInfiniteStream,
      returns: [{
        arg: 'result',
        type: 'ReadableStream',
        json: true,
      }],
    });

    remotes.addClass(streamClass);
    app.use(remotes.handler('rest'));
  });

  before(function() {
    remotes.connect('http://127.0.0.1:' + server.address().port, 'rest');
  });

  it('should return a ReadableStream', function(done) {
    const testData = this.data;
    remotes.invoke('StreamClass.createStream', [], [], function(err, stream) {
      assert(stream.readable, 'must be a ReadableStream');
      const out = es.writeArray(function(err, result) {
        if (err) return done(err);
        expect(testData).to.eql(result);
        done();
      });

      stream.pipe(out);
    });
  });

  it('should include errors', function(done) {
    remotes.invoke('StreamClass.createStreamWithError', [], [], function(err, stream) {
      stream.on('error', function(err) {
        expect(err).instanceof(Error);
        expect(err.message).to.equal('test error');
      });

      stream.on('end', done);
    });
  });

  describe('an http client requesting a stream as JSON', function() {
    let server, port;
    before(function startTheApp(done) {
      server = app.listen(() => {
        port = server.address().port;
        done();
      });
    });

    after(async function stopTheApp() {
      // Clean up all active streams first
      activeStreams.forEach(stream => {
        if (stream && typeof stream.destroy === 'function') {
          stream.destroy();
        }
      });
      activeStreams = [];

      if (server) {
        await new Promise((resolve, reject) => {
          server.close((err) => {
            if (err) {
              console.error('Error closing streams test server:', err);
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

    it('should close server stream on client disconnect', function(done) {
      this.timeout(5000); // 5 second timeout
      let timer;
      let finished = false;

      const cleanup = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        finished = true;
      };

      const req = http.request({
        port,
        path: '/StreamClass/createInfiniteStream',
        timeout: 100,
        headers: {
          // Content-type is important! When the client accepts
          // `text/event-stream` then all works well.
          // In this test, we verify what happens when the client accepts
          // only `application/json`.
          accept: 'application/json',
        },
      });

      req
        .on('error', (err) => {
          cleanup();
          if (!finished) done(err);
        })
        .on('response', res => {
          // Properly destroy the request instead of using deprecated abort()
          req.destroy();
          res.destroy();

          const timeout = 200;
          timer = setTimeout(() => {
            if (finished) return;
            cleanup();
            // The stream was kept open, that's a bug
            const msg = `Server stream was not closed within ${timeout}ms ` +
              'after the connection was closed.';
            done(new Error(msg));
          }, timeout);

          streamClosed.then(() => {
            if (finished) return;
            cleanup();
            // The event stream was properly closed, the test has passed.
            done();
          }).catch((err) => {
            if (finished) return;
            cleanup();
            done(err);
          });
        })
        .end();
    });
  });

  describe('an http client requesting a stream as an event source', function() {
    let activeEventSources = [];

    before(function(done) {
      const server = this.server = app.listen(done);
      this.port = server.address().port;
    });
    before(function() {
      const test = this;
      this.url = 'http://localhost:' + this.port;
    });

    afterEach(function() {
      // Clean up any remaining EventSource instances
      activeEventSources.forEach(es => {
        if (es && typeof es.close === 'function') {
          es.close();
        }
      });
      activeEventSources = [];
    });

    it('should respond with an event stream', function(done) {
      this.timeout(5000); // 5 second timeout
      const es = new EventSource(this.url + '/StreamClass/createStream');
      activeEventSources.push(es);
      const testData = this.data;
      const result = [];

      const timeout = setTimeout(() => {
        es.close();
        done(new Error('Test timed out waiting for event stream'));
      }, 4000);

      es.on('data', function(e) {
        result.push(JSON.parse(e.data));
      });

      es.on('end', function() {
        clearTimeout(timeout);
        expect(testData).to.eql(result);
        es.close();
        done();
      });

      es.on('error', function(err) {
        clearTimeout(timeout);
        es.close();
        done(err);
      });
    });

    it('should respond with an event stream with errors', function(done) {
      this.timeout(5000); // 5 second timeout
      const es = new EventSource(this.url + '/StreamClass/createStreamWithError');
      activeEventSources.push(es);

      const timeout = setTimeout(() => {
        es.close();
        done(new Error('Test timed out waiting for error event'));
      }, 4000);

      es.on('error', function(e) {
        clearTimeout(timeout);
        let err;
        if (e && e.data) {
          err = JSON.parse(e.data);
        } else {
          es.close();
          return done(new Error('no error data!'));
        }
        expect(err.message).to.equal('test error');
        es.close();
        done();
      });
    });

    if ('destroy' in new Readable()) {
      it('should close server stream on client disconnect',
        function(done) {
          this.timeout(5000); // 5 second timeout
          let finished = false;

          const es = new EventSource(this.url + '/StreamClass/createInfiniteStream');
          activeEventSources.push(es);

          const cleanup = () => {
            if (!finished) {
              finished = true;
              es.close();
            }
          };

          const timeout = setTimeout(() => {
            cleanup();
            done(new Error('Test timed out waiting for stream close'));
          }, 4000);

          es.on('data', function(e) {
            cleanup();
            clearTimeout(timeout);

            streamClosed.then(() => {
              if (!finished) done();
            }).catch((err) => {
              if (!finished) done(err);
            });
          });

          es.on('error', function(err) {
            cleanup();
            clearTimeout(timeout);
            if (!finished) done(err);
          });
        });
    } else {
      it('supports legacy ReadableStreams with no destroy() method',
        function(done) {
          this.timeout(5000); // 5 second timeout
          let finished = false;

          const es = new EventSource(this.url + '/StreamClass/createInfiniteStream');
          activeEventSources.push(es);

          const cleanup = () => {
            if (!finished) {
              finished = true;
              es.close();
            }
          };

          const timeout = setTimeout(() => {
            cleanup();
            done(new Error('Test timed out waiting for stream close'));
          }, 4000);

          es.on('data', function(e) {
            cleanup();
            clearTimeout(timeout);
            if (!finished) {
              process.nextTick(() => done());
            }
          });

          es.on('error', function(err) {
            cleanup();
            clearTimeout(timeout);
            if (!finished) done(err);
          });
        });
    }

    after(async function() {
      if (this.server) {
        await new Promise((resolve, reject) => {
          this.server.close((err) => {
            if (err) {
              console.error('Error closing event source server:', err);
              reject(err);
            } else {
              resolve();
            }
          });
        });

        // Force close any remaining connections
        if (this.server.closeAllConnections) {
          this.server.closeAllConnections();
        }

        this.server = null;
      }
    });
  });

  // Global cleanup to ensure no hanging handles
  after(function globalCleanup() {
    // Clean up any remaining active streams
    activeStreams.forEach(stream => {
      if (stream && typeof stream.destroy === 'function') {
        stream.destroy();
      }
    });
    activeStreams = [];

    // Force close any remaining servers
    if (typeof server !== 'undefined' && server) {
      try {
        server.close();
        if (server.closeAllConnections) {
          server.closeAllConnections();
        }
      } catch (e) {
        // Ignore errors during cleanup
      }
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Force process exit after a short delay to prevent hanging
    setTimeout(() => {
      // Clear all timers and intervals
      const highestTimeoutId = setTimeout(() => {}, 0);
      for (let i = 1; i <= highestTimeoutId; i++) {
        clearTimeout(i);
        clearInterval(i);
      }

      // Force exit if still hanging
      if (process.exitCode === undefined) {
        process.exitCode = 0;
      }

      // Last resort: force exit after another delay
      setTimeout(() => {
        process.exit(0);
      }, 500);
    }, 100);
  });
});
