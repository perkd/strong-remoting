#!/usr/bin/env node

// Copyright IBM Corp. 2024. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

/**
 * E2E Test Runner with proper server lifecycle management
 * 
 * This script manages the E2E server lifecycle and runs E2E tests
 * in isolation from unit tests for better control and reliability.
 */

const { spawn } = require('child_process');
const path = require('path');

// Configuration
const config = {
  serverPath: path.join(__dirname, '..', 'test', 'e2e', 'e2e-server.js'),
  testPattern: 'test/e2e/**/*.test.js',
  timeout: 10000,
  serverStartupTimeout: 10000,
  serverPort: 3000,
};

/**
 * Main E2E test runner function
 */
async function runE2ETests() {
  console.log('🧪 Starting E2E test runner...');
  
  let e2eServer = null;
  
  try {
    // Start E2E server
    console.log('🚀 Starting E2E server...');
    e2eServer = await startE2EServer();
    
    // Wait a moment for server to be fully ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Run E2E tests
    console.log('🧪 Running E2E tests...');
    const success = await runTests();
    
    if (success) {
      console.log('✅ All E2E tests passed!');
    } else {
      console.log('❌ Some E2E tests failed');
    }
    
    // Clean up
    if (e2eServer) {
      console.log('🛑 Stopping E2E server...');
      await stopE2EServer(e2eServer);
    }
    
    process.exit(success ? 0 : 1);
    
  } catch (error) {
    console.error('💥 E2E test runner error:', error);
    
    // Clean up on error
    if (e2eServer) {
      console.log('🛑 Stopping E2E server due to error...');
      await stopE2EServer(e2eServer);
    }
    
    process.exit(1);
  }
}

/**
 * Start E2E server
 */
async function startE2EServer() {
  return new Promise((resolve, reject) => {
    const server = spawn('node', [config.serverPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    });
    
    let output = '';
    
    server.stdout.on('data', (data) => {
      output += data.toString();
      if (output.includes('e2e server listening')) {
        console.log('✅ E2E server started successfully on port', config.serverPort);
        resolve(server);
      }
    });
    
    server.stderr.on('data', (data) => {
      console.error('E2E server error:', data.toString());
    });
    
    server.on('error', (error) => {
      console.error('Failed to start E2E server:', error);
      reject(error);
    });
    
    server.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`E2E server exited with code ${code}`));
      }
    });
    
    // Timeout after configured time
    setTimeout(() => {
      if (!server.killed) {
        server.kill();
        reject(new Error('E2E server startup timeout'));
      }
    }, config.serverStartupTimeout);
  });
}

/**
 * Stop E2E server
 */
async function stopE2EServer(server) {
  if (!server || server.killed) {
    return;
  }
  
  return new Promise((resolve) => {
    server.on('exit', () => {
      console.log('✅ E2E server stopped');
      resolve();
    });
    
    // Try graceful shutdown first
    server.kill('SIGTERM');
    
    // Force kill after 5 seconds
    setTimeout(() => {
      if (!server.killed) {
        server.kill('SIGKILL');
        resolve();
      }
    }, 5000);
  });
}

/**
 * Run E2E tests using native Node.js test runner
 */
async function runTests() {
  const nodeArgs = [
    '--test',
    '--test-reporter=spec',
    '--test-timeout=' + config.timeout,
    config.testPattern
  ];
  
  console.log(`🚀 Running: node ${nodeArgs.join(' ')}`);
  
  return new Promise((resolve) => {
    const child = spawn('node', nodeArgs, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    });
    
    child.on('close', (code) => {
      resolve(code === 0);
    });
    
    child.on('error', (error) => {
      console.error('E2E test error:', error);
      resolve(false);
    });
  });
}

// Handle process signals for cleanup
process.on('SIGINT', () => {
  console.log('\n👋 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run the E2E test runner
if (require.main === module) {
  runE2ETests();
}

module.exports = {
  runE2ETests,
  startE2EServer,
  stopE2EServer,
  config
};
