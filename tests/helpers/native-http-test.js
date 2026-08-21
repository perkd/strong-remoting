// Copyright IBM Corp. 2024. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

/**
 * Native Node.js HTTP testing utilities to replace supertest
 * 
 * This module provides a supertest-compatible API using native Node.js HTTP
 * while maintaining 100% backward compatibility with existing test behavior.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const assert = require('node:assert');

/**
 * Create a test request similar to supertest
 * @param {Express.Application|string|http.Server} app - Express app, URL, or server
 * @returns {TestRequest} Test request builder
 */
function request(app) {
  return new TestRequest(app);
}

class TestRequest {
  constructor(app) {
    this.app = app;
    this.method = 'GET';
    this.path = '/';
    this.headers = {};
    this.query = {};
    this.body = null;
    this.expectations = [];
    this.server = null;
    this.baseUrl = null;
    
    if (typeof app === 'string') {
      // URL string
      this.baseUrl = app;
    } else if (app && app.listen) {
      // Express app - we'll start a server when needed
      this.app = app;
    } else if (app && app.address) {
      // Already a server
      this.server = app;
      const address = app.address();
      this.baseUrl = `http://localhost:${address.port}`;
    }
  }

  get(path) {
    this.method = 'GET';
    this.path = path;
    return this;
  }

  post(path) {
    this.method = 'POST';
    this.path = path;
    return this;
  }

  put(path) {
    this.method = 'PUT';
    this.path = path;
    return this;
  }

  delete(path) {
    this.method = 'DELETE';
    this.path = path;
    return this;
  }

  patch(path) {
    this.method = 'PATCH';
    this.path = path;
    return this;
  }

  options(path) {
    this.method = 'OPTIONS';
    this.path = path;
    return this;
  }

  set(header, value) {
    if (typeof header === 'object') {
      Object.assign(this.headers, header);
    } else {
      this.headers[header] = value;
    }
    return this;
  }

  send(data) {
    this.body = data;
    if (typeof data === 'object' && !Buffer.isBuffer(data)) {
      this.body = JSON.stringify(data);
      if (!this.headers['Content-Type']) {
        this.headers['Content-Type'] = 'application/json';
      }
    }
    return this;
  }

  query(params) {
    if (typeof params === 'object') {
      Object.assign(this.query, params);
    }
    return this;
  }

  expect(statusOrHeader, value, callback) {
    // Supertest signatures:
    //   .expect(status)
    //   .expect(status, callback)
    //   .expect(status, body)
    //   .expect(status, body, callback)
    //   .expect(body)                      (string | object | RegExp)
    //   .expect(body, callback)
    //   .expect(headerName, headerValue)
    //   .expect(headerName, headerValue, callback)
    //   .expect(callback)                  (custom assertion fn)
    if (typeof statusOrHeader === 'number') {
      this.expectations.push({ type: 'status', value: statusOrHeader });
      if (value !== undefined && typeof value !== 'function') {
        // .expect(status, body[, callback])
        this._pushBodyExpectation(value);
      }
      const cb = typeof value === 'function' ? value : callback;
      if (typeof cb === 'function') return this.end(cb);
    } else if (typeof statusOrHeader === 'string' && value !== undefined && typeof value !== 'function') {
      // .expect(headerName, headerValue[, callback])
      this.expectations.push({ type: 'header', header: statusOrHeader, value });
      if (typeof callback === 'function') return this.end(callback);
    } else if (typeof statusOrHeader === 'string') {
      // .expect(bodyString[, callback])
      this.expectations.push({ type: 'body', value: statusOrHeader });
      if (typeof value === 'function') return this.end(value);
    } else if (statusOrHeader instanceof RegExp) {
      this.expectations.push({ type: 'bodyRegex', value: statusOrHeader });
      if (typeof value === 'function') return this.end(value);
    } else if (typeof statusOrHeader === 'object' && statusOrHeader !== null) {
      // .expect(bodyObject[, callback])
      this.expectations.push({ type: 'bodyObject', value: statusOrHeader });
      if (typeof value === 'function') return this.end(value);
    } else if (typeof statusOrHeader === 'function') {
      // .expect(callback) — supertest uses this for custom assertion fns,
      // but in this codebase it's used as a terminator with (err, res)
      return this.end(statusOrHeader);
    }
    return this;
  }

  _pushBodyExpectation(value) {
    if (typeof value === 'string') {
      this.expectations.push({ type: 'body', value });
    } else if (value instanceof RegExp) {
      this.expectations.push({ type: 'bodyRegex', value });
    } else if (typeof value === 'object' && value !== null) {
      this.expectations.push({ type: 'bodyObject', value });
    }
  }

  async end(callback) {
    try {
      const result = await this.execute();
      if (callback) {
        callback(null, result);
      }
      return result;
    } catch (error) {
      if (callback) {
        callback(error);
      } else {
        throw error;
      }
    }
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  catch(reject) {
    return this.execute().catch(reject);
  }

  async execute() {
    let url;
    let shouldCloseServer = false;

    if (this.baseUrl) {
      url = this.baseUrl + this.path;
    } else if (this.app) {
      // Start a temporary server
      this.server = this.app.listen(0);
      shouldCloseServer = true;
      const address = this.server.address();
      url = `http://localhost:${address.port}${this.path}`;
    } else {
      throw new Error('No app or URL provided');
    }

    // Add query parameters
    if (Object.keys(this.query).length > 0) {
      const queryString = new URLSearchParams(this.query).toString();
      url += (url.includes('?') ? '&' : '?') + queryString;
    }

    try {
      const response = await this.makeRequest(url);
      this.validateExpectations(response);
      return response;
    } finally {
      if (shouldCloseServer && this.server) {
        this.server.close();
      }
    }
  }

  makeRequest(url) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: this.method,
        headers: this.headers
      };

      const req = httpModule.request(options, (res) => {
        let body = '';
        res.setEncoding('utf8');
        
        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          // Parse JSON if content-type indicates JSON
          let parsedBody = body;
          const contentType = res.headers['content-type'] || '';
          if (contentType.includes('application/json') && body) {
            try {
              parsedBody = JSON.parse(body);
            } catch (e) {
              // Keep as string if JSON parsing fails
            }
          }

          const response = {
            status: res.statusCode,
            statusCode: res.statusCode,
            headers: res.headers,
            text: body,
            body: parsedBody,
            res: res,
            get(name) {
              return res.headers[name.toLowerCase()];
            },
          };

          resolve(response);
        });
      });

      req.on('error', reject);

      if (this.body) {
        const buf = Buffer.isBuffer(this.body) ? this.body : Buffer.from(this.body);
        if (!options.headers['Content-Length']) {
          req.setHeader('Content-Length', buf.length);
        }
        req.write(buf);
      }

      req.end();
    });
  }

  validateExpectations(response) {
    for (const expectation of this.expectations) {
      switch (expectation.type) {
        case 'status':
          assert.strictEqual(response.status, expectation.value, 
            `Expected status ${expectation.value}, got ${response.status}`);
          break;
        case 'header':
          const actualHeaderValue = response.headers[expectation.header.toLowerCase()];
          if (expectation.value instanceof RegExp) {
            assert(expectation.value.test(actualHeaderValue),
              `Expected header ${expectation.header} to match ${expectation.value}, but got: ${actualHeaderValue}`);
          } else {
            assert.strictEqual(actualHeaderValue, expectation.value,
              `Expected header ${expectation.header} to be ${expectation.value}, but got: ${actualHeaderValue}`);
          }
          break;
        case 'body':
          assert.strictEqual(response.text, expectation.value,
            `Expected body to be ${expectation.value}`);
          break;
        case 'bodyRegex':
          assert(expectation.value.test(response.text),
            `Expected body to match ${expectation.value}`);
          break;
        case 'bodyObject':
          assert.deepStrictEqual(response.body, expectation.value,
            `Expected body to deep equal ${JSON.stringify(expectation.value)}`);
          break;
      }
    }
  }
}

module.exports = request;
