// Copyright IBM Corp. 2016,2017. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

// Native Node.js test imports
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

// Use native assert directly
const TypeRegistry = require('../lib/type-registry');

describe('TypeRegistry', function() {
  let registry;
  beforeEach(function() {
    registry = new TypeRegistry();
  });

  it('refuses to override built-in file type', function() {
    assert.throws(function() {
      registry.registerType('File', {
        fromTypedValue: function() {},
        fromSloppyValue: function() {},
        validate: function() {},
      });
    }, /file/);
  });
});
