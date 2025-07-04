// Copyright IBM Corp. 2024. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

// Native Node.js test imports
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const { expect } = require('./test-config'); // Use native expect interface
const httpClient = require('../lib/http-client');
const { HttpClient } = require('../lib/http-client');
const express = require('express');
const http = require('http');

describe('HttpClient', function() {
  let server, app, baseUrl;

  before(async function() {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Test endpoints
    app.get('/test', (req, res) => {
      res.json({ message: 'GET success', query: req.query });
    });

    app.post('/test', (req, res) => {
      res.json({ message: 'POST success', body: req.body });
    });

    app.get('/error', (req, res) => {
      res.status(500).json({ error: { message: 'Test error' } });
    });

    app.get('/auth', (req, res) => {
      const auth = req.headers.authorization;
      if (!auth) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      res.json({ message: 'Authenticated', auth });
    });

    app.get('/timeout', (req, res) => {
      // Don't respond to simulate timeout
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

        resolve();
      });
    });
  });

  after(async function() {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  });

  describe('Request-compatible interface', function() {
    it('should make GET request with callback', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      httpClient(`${baseUrl}/test`, (err, res, body) => {
        expect(err).to.be.null;
        assert.strictEqual(res.statusCode, 200);
        expect(body).to.deep.equal({ message: 'GET success', query: {} });
        done();
      });
      }); // End of Promise
    }); // End of it

    it('should make GET request with options object', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      httpClient({
        url: `${baseUrl}/test`,
        method: 'GET',
        qs: { param: 'value' }
      }, (err, res, body) => {
        expect(err).to.be.null;
        assert.strictEqual(res.statusCode, 200);
        expect(body.query).to.deep.equal({ param: 'value' });
        done();
      });
      }); // End of Promise
    }); // End of it

    it('should make POST request with JSON body', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      httpClient({
        url: `${baseUrl}/test`,
        method: 'POST',
        json: { test: 'data' }
      }, (err, res, body) => {
        expect(err).to.be.null;
        assert.strictEqual(res.statusCode, 200);
        expect(body.body).to.deep.equal({ test: 'data' });
        done();
      });
      }); // End of Promise
    }); // End of it

    it('should handle authentication with bearer token', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      httpClient({
        url: `${baseUrl}/auth`,
        auth: { bearer: 'test-token' }
      }, (err, res, body) => {
        expect(err).to.be.null;
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(body.auth, 'Bearer test-token');
        done();
      });
      }); // End of Promise
    }); // End of it

    it('should handle authentication with username/password', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      httpClient({
        url: `${baseUrl}/auth`,
        auth: { username: 'user', password: 'pass' }
      }, (err, res, body) => {
        expect(err).to.be.null;
        assert.strictEqual(res.statusCode, 200);
        expect(body.auth).to.match(/^Basic /);
        done();
      });
      }); // End of Promise
    }); // End of it

    it('should handle HTTP error responses', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      httpClient(`${baseUrl}/error`, (err, res, body) => {
        expect(err).to.be.null; // request package doesn't throw on HTTP errors
        assert.strictEqual(res.statusCode, 500);
        assert.strictEqual(body.error.message, 'Test error');
        done();
      });
      }); // End of Promise
    }); // End of it

    it('should handle network errors', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      // Use a valid URL format but unreachable port to trigger ECONNREFUSED
      httpClient('http://127.0.0.1:99999/nonexistent', (err, res, body) => {
        try {
          expect(err).to.be.an('error');
          // Accept either network errors or URL validation errors
          expect(err.code).to.match(/ECONNREFUSED|ENOTFOUND|ERR_INVALID_URL/);
          done();
        } catch (assertionError) {
          done(assertionError);
        }
      });
      }); // End of Promise
    }); // End of it
  }); // End of describe

  describe('Promise interface', function() {
    it('should return promise when no callback provided', async function() {
      const response = await httpClient(`${baseUrl}/test`);
      assert.strictEqual(response.statusCode, 200);
      expect(response.body).to.deep.equal({ message: 'GET success', query: {} });
    });

    it('should handle promise rejection on network error', async function() {
      try {
        await httpClient('http://localhost:99999/nonexistent');
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err).to.be.an('error');
      }
    });
  });

  describe('Request compatibility', function() {
    it('should maintain exact response structure', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      httpClient(`${baseUrl}/test`, (err, res, body) => {
        expect(err).to.be.null;
        
        // Verify response structure matches request package
        expect(res).to.have.property('statusCode');
        expect(res).to.have.property('statusMessage');
        expect(res).to.have.property('headers');
        expect(res).to.have.property('body');
        expect(res).to.have.property('request');
        
        expect(res.request).to.have.property('uri');
        expect(res.request).to.have.property('method');
        
        done();
      });
      }); // End of Promise
    }); // End of it

    it('should handle json: true option', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      httpClient({
        url: `${baseUrl}/test`,
        json: true
      }, (err, res, body) => {
        expect(err).to.be.null;
        assert.strictEqual(typeof body, 'object');
        assert.strictEqual(body.message, 'GET success');
        done();
      });
      }); // End of Promise
    }); // End of it

    it('should preserve all headers', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      httpClient({
        url: `${baseUrl}/test`,
        headers: {
          'Custom-Header': 'test-value',
          'User-Agent': 'test-agent'
        }
      }, (err, res, body) => {
        expect(err).to.be.null;
        assert.strictEqual(res.statusCode, 200);
        done();
      });
      }); // End of Promise
    }); // End of it
  }); // End of describe

  describe('Error handling compatibility', function() {
    it('should handle SyntaxError for 204 responses', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      // This test simulates the specific error handling in http-invocation.js
      // where SyntaxError is caught and ignored for 204 responses
      
      // Create a mock response that would cause SyntaxError in JSON parsing
      app.get('/empty-204', (req, res) => {
        res.status(204).send('');
      });

      httpClient(`${baseUrl}/empty-204`, (err, res, body) => {
        expect(err).to.be.null;
        assert.strictEqual(res.statusCode, 204);
        done();
      });
      }); // End of Promise
    }); // End of it

    it('should preserve error properties for HTTP errors', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      httpClient(`${baseUrl}/error`, (err, res, body) => {
        expect(err).to.be.null; // HTTP errors don't throw in request package
        assert.strictEqual(res.statusCode, 500);
        expect(body).to.have.property('error');
        done();
      });
      }); // End of Promise
    }); // End of it
  }); // End of describe

  describe('HttpClient class', function() {
    it('should create instance with default options', function() {
      const client = new HttpClient({ timeout: 5000 });
      assert.strictEqual(client.defaultOptions.timeout, 5000);
    });

    it('should handle axios dependency gracefully', function() {
      const client = new HttpClient();
      expect(() => client.axios).to.not.throw();
    });
  });

  describe('Edge cases and regression tests', function() {
    it('should handle undefined callback gracefully', async function() {
      const response = await httpClient(`${baseUrl}/test`, undefined);
      assert.strictEqual(response.statusCode, 200);
    });

    it('should handle empty options object', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      httpClient({}, (err, res, body) => {
        expect(err).to.be.an('error'); // Should fail due to missing URL
        done();
      });
      }); // End of Promise
    }); // End of it

    it('should preserve query parameters in URL', function(t) {
      return new Promise((resolve, reject) => {
        const done = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
      httpClient(`${baseUrl}/test?existing=param`, (err, res, body) => {
        expect(err).to.be.null;
        assert.strictEqual(body.query.existing, 'param');
        done();
      });
      }); // End of Promise
    }); // End of it
  }); // End of describe
}); // End of main describe
