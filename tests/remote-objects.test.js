// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

// Native Node.js test imports
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

// No custom expect needed - use native assert directly
const RemoteObjects = require('../');
const RestAdapter = require('../lib/rest-adapter');
const SharedClass = require('../lib/shared-class');

describe('RemoteObjects', function() {
  let remotes;
  beforeEach(function() { remotes = RemoteObjects.create(); });

  describe('RemoteObjects.handler()', function() {
    it('should throws an error if the provided adapter is not valid', function() {
      const invalidAdapter = function() {};
      assert.throws(() => {
        remotes.handler(invalidAdapter);
      }, (err) => {
        return err.message.includes('Invalid adapter class');
      });
    });

    it('should accept a provided adapter if valid', function() {
      remotes.handler(RestAdapter);
    });
  });

  describe('deleteClassByName()', () => {
    it('removes the class', () => {
      class TempClass {}

      const sharedClass = new SharedClass('TempClass', TempClass);
      remotes.addClass(sharedClass);
      assert(Object.keys(remotes._classes).includes('TempClass'));

      remotes.deleteClassByName('TempClass');
      assert(!Object.keys(remotes._classes).includes('TempClass'));
    });

    it('removes the remote hooks', () => {
      remotes.before('TempClass.' + 'find', function(ctx, next) { next(); });
      remotes.after('TempClass.' + 'find', function(ctx, next) { next(); });
      remotes.afterError('TempClass.' + 'find', function(ctx, next) { next(); });
      assert(Object.keys(remotes.listenerTree.before).includes('TempClass'));
      assert(Object.keys(remotes.listenerTree.after).includes('TempClass'));
      assert(Object.keys(remotes.listenerTree.afterError).includes('TempClass'));

      remotes.deleteClassByName('TempClass');
      assert(!Object.keys(remotes.listenerTree.before).includes('TempClass'));
      assert(!Object.keys(remotes.listenerTree.after).includes('TempClass'));
      assert(!Object.keys(remotes.listenerTree.afterError).includes('TempClass'));
    });
  });

  describe('deleteTypeByName()', () => {
    it('removes the type converter', () => {
      class MyType {}

      const registeredTypes = remotes._typeRegistry._types;
      remotes.defineObjectType('MyType', data => new MyType());
      assert(Object.keys(registeredTypes).includes('mytype'));

      remotes.deleteTypeByName('MyType');
      assert(!Object.keys(registeredTypes).includes('mytype'));
    });
  });
});
