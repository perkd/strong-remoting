// Copyright IBM Corp. 2014,2017. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

const http = require('http');
const path = require('path');

/**
 * Test server helper for E2E tests
 * Provides utilities to start and stop the test server
 */

let server = null;
let isServerRunning = false;

/**
 * Start the E2E test server
 * @param {number} port - Port to listen on (default: 3000)
 * @param {Function} callback - Callback function
 */
function startServer(port = 3000, callback) {
  if (typeof port === 'function') {
    callback = port;
    port = 3000;
  }

  if (isServerRunning) {
    return callback && callback(null, server);
  }

  try {
    const FIXTURES = path.join(__dirname, '../e2e/fixtures');
    const remotes = require(path.join(FIXTURES, 'remotes'));

    server = http.createServer(remotes.handler('rest'));

    server.listen(port, function(err) {
      if (err) {
        return callback && callback(err);
      }

      isServerRunning = true;
      console.log(`E2E test server listening on port ${port}...`);
      callback && callback(null, server);
    });

    server.on('error', (err) => {
      isServerRunning = false;
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} is already in use, assuming server is already running`);
        isServerRunning = true;
        return callback && callback(null, null);
      }
      callback && callback(err);
    });

  } catch (error) {
    callback && callback(error);
  }
}

/**
 * Stop the E2E test server
 * @param {Function} callback - Callback function
 */
function stopServer(callback) {
  if (!server || !isServerRunning) {
    return callback && callback();
  }

  server.close((err) => {
    isServerRunning = false;
    server = null;
    console.log('E2E test server stopped');
    callback && callback(err);
  });
}

/**
 * Check if server is running
 * @returns {boolean}
 */
function isRunning() {
  return isServerRunning;
}

/**
 * Wait for server to be ready
 * @param {string} url - URL to check
 * @param {number} timeout - Timeout in ms (default: 5000)
 * @param {Function} callback - Callback function
 */
function waitForServer(url = 'http://localhost:3000', timeout = 5000, callback) {
  if (typeof url === 'function') {
    callback = url;
    url = 'http://localhost:3000';
  }
  if (typeof timeout === 'function') {
    callback = timeout;
    timeout = 5000;
  }

  const startTime = Date.now();

  function check() {
    const req = http.get(url, (res) => {
      callback(null);
    });

    req.on('error', (err) => {
      if (Date.now() - startTime > timeout) {
        return callback(new Error(`Server not ready after ${timeout}ms`));
      }
      setTimeout(check, 100);
    });
  }

  check();
}

module.exports = {
  startServer,
  stopServer,
  isRunning,
  waitForServer
};
