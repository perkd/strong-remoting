// Copyright IBM Corp. 2025. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

/**
 * Escape special characters in a string for use in a regular expression.
 * 
 * This is a native implementation that replaces the escape-string-regexp package.
 * It escapes all characters that have special meaning in regular expressions.
 * 
 * @param {string} string - The string to escape
 * @returns {string} The escaped string safe for use in RegExp constructor
 */
function escapeRegex(string) {
  if (typeof string !== 'string') {
    throw new TypeError('Expected a string');
  }
  
  // Escape all regex special characters: . * + ? ^ $ { } ( ) | [ ] \
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = escapeRegex;
