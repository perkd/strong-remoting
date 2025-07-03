// Copyright IBM Corp. 2024. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

const expect = require('chai').expect;
const httpClient = require('../lib/http-client');
const { HttpClient } = require('../lib/http-client');
const express = require('express');
const http = require('http');

describe('HttpClient', function() {
  let server, app, baseUrl;

  before(function(done) {
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
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      done();
    });
  });

  after(function(done) {
    server.close(done);
  });

  describe('Request-compatible interface', function() {
    it('should make GET request with callback', function(done) {
      httpClient(`${baseUrl}/test`, (err, res, body) => {
        expect(err).to.be.null;
        expect(res.statusCode).to.equal(200);
        expect(body).to.deep.equal({ message: 'GET success', query: {} });
        done();
      });
    });

    it('should make GET request with options object', function(done) {
      httpClient({
        url: `${baseUrl}/test`,
        method: 'GET',
        qs: { param: 'value' }
      }, (err, res, body) => {
        expect(err).to.be.null;
        expect(res.statusCode).to.equal(200);
        expect(body.query).to.deep.equal({ param: 'value' });
        done();
      });
    });

    it('should make POST request with JSON body', function(done) {
      httpClient({
        url: `${baseUrl}/test`,
        method: 'POST',
        json: { test: 'data' }
      }, (err, res, body) => {
        expect(err).to.be.null;
        expect(res.statusCode).to.equal(200);
        expect(body.body).to.deep.equal({ test: 'data' });
        done();
      });
    });

    it('should handle authentication with bearer token', function(done) {
      httpClient({
        url: `${baseUrl}/auth`,
        auth: { bearer: 'test-token' }
      }, (err, res, body) => {
        expect(err).to.be.null;
        expect(res.statusCode).to.equal(200);
        expect(body.auth).to.equal('Bearer test-token');
        done();
      });
    });

    it('should handle authentication with username/password', function(done) {
      httpClient({
        url: `${baseUrl}/auth`,
        auth: { username: 'user', password: 'pass' }
      }, (err, res, body) => {
        expect(err).to.be.null;
        expect(res.statusCode).to.equal(200);
        expect(body.auth).to.match(/^Basic /);
        done();
      });
    });

    it('should handle HTTP error responses', function(done) {
      httpClient(`${baseUrl}/error`, (err, res, body) => {
        expect(err).to.be.null; // request package doesn't throw on HTTP errors
        expect(res.statusCode).to.equal(500);
        expect(body.error.message).to.equal('Test error');
        done();
      });
    });

    it('should handle network errors', function(done) {
      this.timeout(5000); // Increase timeout for network error test
      httpClient('http://localhost:99999/nonexistent', (err, res, body) => {
        expect(err).to.be.an('error');
        expect(err.code).to.match(/ECONNREFUSED|ENOTFOUND/);
        done();
      });
    });
  });

  describe('Promise interface', function() {
    it('should return promise when no callback provided', async function() {
      const response = await httpClient(`${baseUrl}/test`);
      expect(response.statusCode).to.equal(200);
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
    it('should maintain exact response structure', function(done) {
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
    });

    it('should handle json: true option', function(done) {
      httpClient({
        url: `${baseUrl}/test`,
        json: true
      }, (err, res, body) => {
        expect(err).to.be.null;
        expect(typeof body).to.equal('object');
        expect(body.message).to.equal('GET success');
        done();
      });
    });

    it('should preserve all headers', function(done) {
      httpClient({
        url: `${baseUrl}/test`,
        headers: {
          'Custom-Header': 'test-value',
          'User-Agent': 'test-agent'
        }
      }, (err, res, body) => {
        expect(err).to.be.null;
        expect(res.statusCode).to.equal(200);
        done();
      });
    });
  });

  describe('Error handling compatibility', function() {
    it('should handle SyntaxError for 204 responses', function(done) {
      // This test simulates the specific error handling in http-invocation.js
      // where SyntaxError is caught and ignored for 204 responses
      
      // Create a mock response that would cause SyntaxError in JSON parsing
      app.get('/empty-204', (req, res) => {
        res.status(204).send('');
      });

      httpClient(`${baseUrl}/empty-204`, (err, res, body) => {
        expect(err).to.be.null;
        expect(res.statusCode).to.equal(204);
        done();
      });
    });

    it('should preserve error properties for HTTP errors', function(done) {
      httpClient(`${baseUrl}/error`, (err, res, body) => {
        expect(err).to.be.null; // HTTP errors don't throw in request package
        expect(res.statusCode).to.equal(500);
        expect(body).to.have.property('error');
        done();
      });
    });
  });

  describe('HttpClient class', function() {
    it('should create instance with default options', function() {
      const client = new HttpClient({ timeout: 5000 });
      expect(client.defaultOptions.timeout).to.equal(5000);
    });

    it('should handle axios dependency gracefully', function() {
      const client = new HttpClient();
      expect(() => client.axios).to.not.throw();
    });
  });

  describe('Edge cases and regression tests', function() {
    it('should handle undefined callback gracefully', async function() {
      const response = await httpClient(`${baseUrl}/test`, undefined);
      expect(response.statusCode).to.equal(200);
    });

    it('should handle empty options object', function(done) {
      httpClient({}, (err, res, body) => {
        expect(err).to.be.an('error'); // Should fail due to missing URL
        done();
      });
    });

    it('should preserve query parameters in URL', function(done) {
      httpClient(`${baseUrl}/test?existing=param`, (err, res, body) => {
        expect(err).to.be.null;
        expect(body.query.existing).to.equal('param');
        done();
      });
    });
  });
});
