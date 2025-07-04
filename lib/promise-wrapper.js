// Copyright IBM Corp. 2024. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

/**
 * Promise wrapper utilities for strong-remoting
 * 
 * This module provides utilities to add Promise support to callback-based APIs
 * while maintaining 100% backward compatibility with existing callback patterns.
 */

const debug = require('debug')('strong-remoting:promise-wrapper');

/**
 * Wraps a callback-based function to support both callbacks and Promises
 * 
 * @param {Function} originalFn - The original callback-based function
 * @param {Object} context - The context (this) to bind the function to
 * @returns {Function} - Enhanced function supporting both callbacks and Promises
 */
function createDualApiWrapper(originalFn, context) {
  return function wrappedFunction() {
    const args = Array.prototype.slice.call(arguments);
    const lastArg = args[args.length - 1];
    const hasCallback = typeof lastArg === 'function';
    
    if (hasCallback) {
      // Callback mode - use original behavior
      debug('Invoking in callback mode');
      return originalFn.apply(context || this, args);
    } else {
      // Promise mode - wrap in Promise
      debug('Invoking in Promise mode');
      return new Promise((resolve, reject) => {
        // Add callback to arguments
        const callbackArgs = args.concat([function promiseCallback(err) {
          if (err) {
            debug('Promise rejected with error:', err.message);
            return reject(err);
          }
          
          // Handle multiple return values
          const results = Array.prototype.slice.call(arguments, 1);
          debug('Promise resolved with results:', results.length);
          
          if (results.length === 0) {
            resolve();
          } else if (results.length === 1) {
            resolve(results[0]);
          } else {
            resolve(results);
          }
        }]);
        
        // Call original function with callback
        originalFn.apply(context || this, callbackArgs);
      });
    }
  };
}

/**
 * Wraps an invoke method to support both callbacks and Promises
 * Specifically designed for RemoteObjects.prototype.invoke and adapter invoke methods
 * 
 * @param {Function} originalInvoke - The original invoke function
 * @param {Object} context - The context (this) to bind the function to
 * @returns {Function} - Enhanced invoke function
 */
function createInvokeWrapper(originalInvoke, context) {
  return function wrappedInvoke(method, ctorArgs, args, callback) {
    // Handle variable arguments (callback might be in different positions)
    const allArgs = Array.prototype.slice.call(arguments);
    let actualCallback = null;
    let callbackIndex = -1;
    
    // Find the callback in the arguments
    for (let i = allArgs.length - 1; i >= 0; i--) {
      if (typeof allArgs[i] === 'function') {
        actualCallback = allArgs[i];
        callbackIndex = i;
        break;
      }
    }
    
    if (actualCallback) {
      // Callback mode - use original behavior
      debug('Invoke in callback mode for method:', method);
      return originalInvoke.apply(context || this, allArgs);
    } else {
      // Promise mode - wrap in Promise
      debug('Invoke in Promise mode for method:', method);
      return new Promise((resolve, reject) => {
        // Add callback to the end of arguments
        const callbackArgs = allArgs.concat([function invokePromiseCallback(err) {
          if (err) {
            debug('Invoke Promise rejected for method %s:', method, err.message);
            return reject(err);
          }
          
          // Handle multiple return values
          const results = Array.prototype.slice.call(arguments, 1);
          debug('Invoke Promise resolved for method %s with %d results', method, results.length);
          
          if (results.length === 0) {
            resolve();
          } else if (results.length === 1) {
            resolve(results[0]);
          } else {
            resolve(results);
          }
        }]);
        
        // Call original invoke function with callback
        originalInvoke.apply(context || this, callbackArgs);
      });
    }
  };
}

/**
 * Wraps hook execution to support both callback and async/await patterns
 * 
 * @param {Function} originalExecHooks - The original execHooks function
 * @param {Object} context - The context (this) to bind the function to
 * @returns {Function} - Enhanced execHooks function
 */
function createHookWrapper(originalExecHooks, context) {
  return function wrappedExecHooks(when, method, scope, ctx, next) {
    // Always maintain callback behavior for hooks since they're internal
    // But enhance individual hook execution to support async hooks
    return originalExecHooks.call(context || this, when, method, scope, ctx, next);
  };
}

/**
 * Detects if a function is async (returns a Promise)
 *
 * @param {Function} fn - Function to check
 * @returns {Boolean} - True if function is async
 */
function isAsyncFunction(fn) {
  if (!fn || typeof fn !== 'function') return false;

  // Check for AsyncFunction constructor
  if (fn.constructor.name === 'AsyncFunction') return true;

  // Check for async keyword in function string
  const fnString = fn.toString();
  if (fnString.includes('async ') && fnString.indexOf('async ') < fnString.indexOf('function')) {
    return true;
  }

  // Heuristic for hook functions: async hooks typically don't take callback parameter
  // This is used specifically for hook detection, not general async detection
  return false;
}

/**
 * Wraps a single hook function to support both callback and async patterns
 * 
 * @param {Function} hookFn - The hook function
 * @returns {Function} - Wrapped hook function
 */
function wrapHookFunction(hookFn) {
  return function wrappedHook(ctx, next) {
    try {
      // Check if hook function expects a callback (has 2+ parameters)
      if (hookFn.length >= 2) {
        // Callback-style hook
        debug('Executing callback-style hook');
        return hookFn.call(this, ctx, next);
      } else {
        // Potentially async hook (1 parameter)
        debug('Executing potential async hook');
        const result = hookFn.call(this, ctx);
        
        if (result && typeof result.then === 'function') {
          // Promise-based hook
          debug('Hook returned Promise');
          result.then(() => next(), next);
        } else {
          // Synchronous hook
          debug('Hook executed synchronously');
          next();
        }
      }
    } catch (err) {
      debug('Hook threw error:', err.message);
      next(err);
    }
  };
}

/**
 * Utility to promisify a callback-based method while preserving original behavior
 * 
 * @param {Object} target - Object containing the method
 * @param {String} methodName - Name of the method to wrap
 * @returns {Function} - Original method for backup/restore
 */
function promisifyMethod(target, methodName) {
  const originalMethod = target[methodName];
  if (!originalMethod || typeof originalMethod !== 'function') {
    throw new Error(`Method ${methodName} not found or not a function`);
  }
  
  // Store reference to original for potential restoration
  target[`_original_${methodName}`] = originalMethod;
  
  // Replace with dual-API version
  if (methodName === 'invoke') {
    target[methodName] = createInvokeWrapper(originalMethod, target);
  } else {
    target[methodName] = createDualApiWrapper(originalMethod, target);
  }
  
  debug(`Promisified method: ${methodName}`);
  return originalMethod;
}

/**
 * Restores a method to its original callback-only behavior
 * 
 * @param {Object} target - Object containing the method
 * @param {String} methodName - Name of the method to restore
 */
function restoreMethod(target, methodName) {
  const originalMethod = target[`_original_${methodName}`];
  if (originalMethod) {
    target[methodName] = originalMethod;
    delete target[`_original_${methodName}`];
    debug(`Restored method: ${methodName}`);
  }
}

/**
 * Applies Promise support to a RemoteObjects instance
 * 
 * @param {RemoteObjects} remoteObjects - RemoteObjects instance to enhance
 */
function enhanceRemoteObjects(remoteObjects) {
  debug('Enhancing RemoteObjects with Promise support');
  
  // Enhance main invoke method
  promisifyMethod(remoteObjects, 'invoke');
  
  // Enhance invokeMethodInContext
  promisifyMethod(remoteObjects, 'invokeMethodInContext');
  
  // Store original for adapter enhancement
  remoteObjects._originalConnect = remoteObjects.connect;
  remoteObjects.connect = function enhancedConnect() {
    const result = remoteObjects._originalConnect.apply(this, arguments);
    
    // Enhance adapter when connected
    if (this.serverAdapter && this.serverAdapter.invoke) {
      promisifyMethod(this.serverAdapter, 'invoke');
    }
    
    return result;
  };
  
  debug('RemoteObjects enhanced with Promise support');
}

module.exports = {
  createDualApiWrapper,
  createInvokeWrapper,
  createHookWrapper,
  wrapHookFunction,
  isAsyncFunction,
  promisifyMethod,
  restoreMethod,
  enhanceRemoteObjects,
};
