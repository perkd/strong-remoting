#!/usr/bin/env node

// Copyright IBM Corp. 2024. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

/**
 * Enhanced coverage reporting with c8
 * 
 * This script provides comprehensive coverage reporting with multiple formats,
 * threshold checking, and integration with CI/CD pipelines.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const config = {
  coverageDir: path.join(__dirname, '..', 'coverage'),
  thresholds: {
    statements: 80,
    branches: 70,
    functions: 75,
    lines: 80
  },
  reporters: ['text', 'html', 'lcov', 'json'],
  exclude: [
    'tests/**',
    'coverage/**',
    'scripts/**',
    'node_modules/**',
    '*.config.js'
  ]
};

/**
 * Main coverage reporting function
 */
async function generateCoverageReport() {
  console.log('📊 Generating comprehensive coverage report...');
  
  try {
    // Parse command line arguments
    const args = parseArgs();
    
    // Clean previous coverage data if requested
    if (args.clean) {
      await cleanCoverageData();
    }
    
    // Generate coverage reports
    const success = await runCoverageReporting(args);
    
    if (success) {
      console.log('✅ Coverage report generated successfully!');
      
      // Display coverage summary
      await displayCoverageSummary();
      
      // Check thresholds if requested
      if (args.checkThresholds) {
        const thresholdsPassed = await checkCoverageThresholds();
        if (!thresholdsPassed) {
          console.log('❌ Coverage thresholds not met');
          process.exit(1);
        }
      }
      
      process.exit(0);
    } else {
      console.log('❌ Coverage report generation failed');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('💥 Coverage reporting error:', error);
    process.exit(1);
  }
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    reporters: config.reporters,
    clean: false,
    checkThresholds: true,
    outputDir: config.coverageDir,
    format: 'all',
    open: false,
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--reporters':
        parsed.reporters = args[++i].split(',');
        break;
      case '--clean':
        parsed.clean = true;
        break;
      case '--no-thresholds':
        parsed.checkThresholds = false;
        break;
      case '--output-dir':
        parsed.outputDir = args[++i];
        break;
      case '--format':
        parsed.format = args[++i];
        break;
      case '--open':
        parsed.open = true;
        break;
      case '--help':
        displayHelp();
        process.exit(0);
        break;
    }
  }
  
  return parsed;
}

/**
 * Clean previous coverage data
 */
async function cleanCoverageData() {
  console.log('🧹 Cleaning previous coverage data...');
  
  const fs = require('fs').promises;
  
  try {
    // Remove coverage directory
    await fs.rmdir(config.coverageDir, { recursive: true });
    console.log('✅ Coverage data cleaned');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('⚠️  Warning: Could not clean coverage data:', error.message);
    }
  }
}

/**
 * Run coverage reporting with c8
 */
async function runCoverageReporting(args) {
  const reporterArgs = args.reporters.map(reporter => `--reporter=${reporter}`);
  
  const c8Args = [
    'c8',
    ...reporterArgs,
    `--reports-dir=${args.outputDir}`,
    '--exclude=tests/**',
    '--exclude=coverage/**',
    '--exclude=scripts/**',
    '--exclude=node_modules/**',
    '--all',
    '--clean',
    'npm', 'test'
  ];
  
  console.log(`🚀 Running: npx ${c8Args.join(' ')}`);
  
  return new Promise((resolve) => {
    const child = spawn('npx', c8Args, {
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
      console.error('Coverage reporting error:', error);
      resolve(false);
    });
  });
}

/**
 * Display coverage summary from JSON report
 */
async function displayCoverageSummary() {
  try {
    const summaryPath = path.join(config.coverageDir, 'coverage-summary.json');
    
    if (!fs.existsSync(summaryPath)) {
      console.log('ℹ️  Coverage summary not available');
      return;
    }
    
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    const total = summary.total;
    
    console.log('\n📊 Coverage Summary:');
    console.log('┌─────────────┬─────────┬─────────┬─────────┬─────────┐');
    console.log('│ Type        │ Total   │ Covered │ Skipped │ Pct     │');
    console.log('├─────────────┼─────────┼─────────┼─────────┼─────────┤');
    console.log(`│ Statements  │ ${pad(total.statements.total, 7)} │ ${pad(total.statements.covered, 7)} │ ${pad(total.statements.skipped, 7)} │ ${pad(total.statements.pct + '%', 7)} │`);
    console.log(`│ Branches    │ ${pad(total.branches.total, 7)} │ ${pad(total.branches.covered, 7)} │ ${pad(total.branches.skipped, 7)} │ ${pad(total.branches.pct + '%', 7)} │`);
    console.log(`│ Functions   │ ${pad(total.functions.total, 7)} │ ${pad(total.functions.covered, 7)} │ ${pad(total.functions.skipped, 7)} │ ${pad(total.functions.pct + '%', 7)} │`);
    console.log(`│ Lines       │ ${pad(total.lines.total, 7)} │ ${pad(total.lines.covered, 7)} │ ${pad(total.lines.skipped, 7)} │ ${pad(total.lines.pct + '%', 7)} │`);
    console.log('└─────────────┴─────────┴─────────┴─────────┴─────────┘');
    
    // Display file-level coverage for files below threshold
    console.log('\n📁 Files below threshold:');
    let hasLowCoverage = false;
    
    Object.entries(summary).forEach(([file, data]) => {
      if (file === 'total') return;
      
      const statements = data.statements.pct;
      const branches = data.branches.pct;
      const functions = data.functions.pct;
      const lines = data.lines.pct;
      
      if (statements < config.thresholds.statements ||
          branches < config.thresholds.branches ||
          functions < config.thresholds.functions ||
          lines < config.thresholds.lines) {
        
        hasLowCoverage = true;
        const relativePath = path.relative(process.cwd(), file);
        console.log(`  ❌ ${relativePath}: ${statements}% statements, ${branches}% branches, ${functions}% functions, ${lines}% lines`);
      }
    });
    
    if (!hasLowCoverage) {
      console.log('  ✅ All files meet coverage thresholds');
    }
    
  } catch (error) {
    console.warn('⚠️  Could not display coverage summary:', error.message);
  }
}

/**
 * Check if coverage meets thresholds
 */
async function checkCoverageThresholds() {
  try {
    const summaryPath = path.join(config.coverageDir, 'coverage-summary.json');
    
    if (!fs.existsSync(summaryPath)) {
      console.log('⚠️  Cannot check thresholds: coverage summary not found');
      return false;
    }
    
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    const total = summary.total;
    
    const checks = [
      { name: 'statements', actual: total.statements.pct, threshold: config.thresholds.statements },
      { name: 'branches', actual: total.branches.pct, threshold: config.thresholds.branches },
      { name: 'functions', actual: total.functions.pct, threshold: config.thresholds.functions },
      { name: 'lines', actual: total.lines.pct, threshold: config.thresholds.lines }
    ];
    
    let allPassed = true;
    
    console.log('\n🎯 Threshold Check:');
    checks.forEach(check => {
      const passed = check.actual >= check.threshold;
      const status = passed ? '✅' : '❌';
      console.log(`  ${status} ${check.name}: ${check.actual}% (threshold: ${check.threshold}%)`);
      if (!passed) allPassed = false;
    });
    
    return allPassed;
    
  } catch (error) {
    console.error('Error checking thresholds:', error);
    return false;
  }
}

/**
 * Pad string to specified length
 */
function pad(str, length) {
  return String(str).padStart(length);
}

/**
 * Display help information
 */
function displayHelp() {
  console.log(`
Coverage Reporter for strong-remoting

Usage: node scripts/coverage-reporter.js [options]

Options:
  --reporters <list>     Comma-separated list of reporters (text,html,lcov,json)
  --clean               Clean previous coverage data before generating
  --no-thresholds       Skip threshold checking
  --output-dir <dir>    Output directory for coverage reports
  --format <format>     Report format (all, text, html, lcov, json)
  --open                Open HTML report in browser after generation
  --help                Show this help message

Examples:
  node scripts/coverage-reporter.js --clean --reporters text,html
  node scripts/coverage-reporter.js --no-thresholds --open
  node scripts/coverage-reporter.js --format html --open
`);
}

// Run the coverage reporter
if (require.main === module) {
  generateCoverageReport();
}

module.exports = {
  generateCoverageReport,
  displayCoverageSummary,
  checkCoverageThresholds,
  config
};
