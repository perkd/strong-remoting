#!/usr/bin/env node

// Copyright IBM Corp. 2024. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

/**
 * Modern test runner using native Node.js test runner with c8 coverage
 * 
 * This script provides a modern testing experience while maintaining
 * compatibility with existing test patterns.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const config = {
  testDir: path.join(__dirname, '..', 'test'),
  testPattern: '**/*.test.js',
  coverageDir: path.join(__dirname, '..', 'coverage'),
  timeout: 10000,
  concurrency: true,
  reporter: 'spec',
};

/**
 * Main test runner function
 */
async function runTests() {
  console.log('🧪 Starting modern test runner...');
  
  try {
    // Parse command line arguments
    const args = parseArgs();
    
    // Discover test files
    const testFiles = await discoverTestFiles(args.pattern || config.testPattern);
    
    if (testFiles.length === 0) {
      console.log('❌ No test files found');
      process.exit(1);
    }
    
    console.log(`📁 Found ${testFiles.length} test files`);
    
    // Run tests with coverage
    const success = await runTestsWithCoverage(testFiles, args);
    
    if (success) {
      console.log('✅ All tests passed!');
      process.exit(0);
    } else {
      console.log('❌ Some tests failed');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('💥 Test runner error:', error);
    process.exit(1);
  }
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    pattern: null,
    grep: null,
    timeout: config.timeout,
    coverage: true,
    reporter: config.reporter,
    watch: false,
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--grep':
        parsed.grep = args[++i];
        break;
      case '--timeout':
        parsed.timeout = parseInt(args[++i], 10);
        break;
      case '--no-coverage':
        parsed.coverage = false;
        break;
      case '--reporter':
        parsed.reporter = args[++i];
        break;
      case '--watch':
        parsed.watch = true;
        break;
      case '--pattern':
        parsed.pattern = args[++i];
        break;
      default:
        if (!arg.startsWith('--')) {
          parsed.pattern = arg;
        }
        break;
    }
  }
  
  return parsed;
}

/**
 * Discover test files matching the pattern
 */
async function discoverTestFiles(pattern) {
  const { glob } = require('glob');

  try {
    const searchPattern = path.join(config.testDir, pattern);
    const files = await glob(searchPattern, { ignore: '**/node_modules/**' });

    // Filter out files that shouldn't be run directly
    const testFiles = files.filter(file => {
      const basename = path.basename(file);
      return !basename.startsWith('_') &&
             !basename.includes('.context.') &&
             !basename.includes('.suite.');
    });

    return testFiles;
  } catch (error) {
    console.error('Error discovering test files:', error);
    return [];
  }
}

/**
 * Run tests with coverage using c8 and native Node.js test runner
 */
async function runTestsWithCoverage(testFiles, args) {
  const nodeArgs = [
    '--test',
    '--test-reporter=spec',
    '--test-timeout=' + args.timeout,
  ];
  
  // Add grep filter if specified
  if (args.grep) {
    nodeArgs.push('--test-name-pattern=' + args.grep);
  }
  
  // Add test files
  nodeArgs.push(...testFiles);
  
  let command = 'node';
  let commandArgs = nodeArgs;
  
  // Wrap with c8 for coverage if enabled
  if (args.coverage) {
    command = 'npx';
    commandArgs = [
      'c8',
      '--reporter=text',
      '--reporter=html',
      '--reports-dir=' + config.coverageDir,
      '--exclude=test/**',
      '--exclude=node_modules/**',
      'node',
      ...nodeArgs
    ];
  }
  
  console.log(`🚀 Running: ${command} ${commandArgs.join(' ')}`);
  
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
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
      console.error('Test runner error:', error);
      resolve(false);
    });
  });
}

/**
 * Watch mode for continuous testing
 */
async function watchTests(testFiles, args) {
  const chokidar = require('chokidar');
  
  console.log('👀 Watching for changes...');
  
  const watcher = chokidar.watch([
    path.join(__dirname, '..', 'lib', '**', '*.js'),
    path.join(__dirname, '..', 'test', '**', '*.js'),
  ], {
    ignored: /node_modules/,
    persistent: true
  });
  
  let running = false;
  
  const runTestsDebounced = debounce(async () => {
    if (running) return;
    
    running = true;
    console.log('\n🔄 Changes detected, running tests...');
    
    try {
      await runTestsWithCoverage(testFiles, { ...args, coverage: false });
    } catch (error) {
      console.error('Watch test error:', error);
    } finally {
      running = false;
      console.log('👀 Watching for changes...');
    }
  }, 1000);
  
  watcher.on('change', runTestsDebounced);
  watcher.on('add', runTestsDebounced);
  
  // Initial run
  await runTestsDebounced();
  
  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\n👋 Stopping watch mode...');
    watcher.close();
    process.exit(0);
  });
}

/**
 * Debounce utility
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Install required dependencies if missing
 */
async function ensureDependencies() {
  const requiredPackages = ['glob', 'c8'];
  const missingPackages = [];
  
  for (const pkg of requiredPackages) {
    try {
      require.resolve(pkg);
    } catch (error) {
      missingPackages.push(pkg);
    }
  }
  
  if (missingPackages.length > 0) {
    console.log(`📦 Installing missing packages: ${missingPackages.join(', ')}`);
    
    return new Promise((resolve, reject) => {
      const child = spawn('npm', ['install', '--save-dev', ...missingPackages], {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..')
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to install packages: ${missingPackages.join(', ')}`));
        }
      });
    });
  }
}

// Run the test runner
if (require.main === module) {
  ensureDependencies()
    .then(() => runTests())
    .catch((error) => {
      console.error('Failed to ensure dependencies:', error);
      process.exit(1);
    });
}

module.exports = {
  runTests,
  discoverTestFiles,
  runTestsWithCoverage,
  config
};
