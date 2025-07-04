// Copyright IBM Corp. 2013,2018. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

const g = require('strong-globalize')();
/*!
 * Expose `JsonRpcAdapter`.
 */
module.exports = JsonRpcAdapter;

/*!
 * Module dependencies.
 */

const EventEmitter = require('events').EventEmitter;
const debug = require('debug')('strong-remoting:jsonrpc-adapter');
const util = require('util');
const inherits = util.inherits;
const jayson = require('jayson');
const express = require('express');
const bodyParser = require('body-parser');
const HttpContext = require('./http-context');

const json = bodyParser.json;
const urlencoded = bodyParser.urlencoded;

/**
 * Create a new `JsonRpcAdapter` with the given `options`.
 *
 * @param {Object} options
 * @return {JsonRpcAdapter}
 */

function JsonRpcAdapter(remotes) {
  EventEmitter.call(this);

  this.remotes = remotes;
  this.Context = HttpContext;
}

/**
 * Inherit from `EventEmitter`.
 */

inherits(JsonRpcAdapter, EventEmitter);

/*!
 * Simplified APIs
 */

JsonRpcAdapter.create =
  JsonRpcAdapter.createJsonRpcAdapter = function(remotes) {
    // add simplified construction / sugar here
    return new JsonRpcAdapter(remotes);
  };

/**
 * Get the path for the given method.
 */

JsonRpcAdapter.prototype.getRoutes = function(obj) {
  // build default route
  const routes = [
    {
      verb: 'POST',
      path: obj.name ? ('/' + obj.name) : '',
    },
  ];
  return routes;
};

JsonRpcAdapter.errorHandler = function() {
  return function restErrorHandler(err, req, res, next) {
    if (typeof err === 'string') {
      err = new Error(err);
      err.status = err.statusCode = 500;
    }

    res.statusCode = err.statusCode || err.status || 500;

    debug('Error in %s %s: %s', req.method, req.url, err.stack);
    const data = {
      name: err.name,
      status: res.statusCode,
      message: err.message || g.f('An unknown error occurred'),
    };

    for (const prop in err) {
      data[prop] = err[prop];
    }

    // TODO(bajtos) Remove stack info when running in production
    data.stack = err.stack;

    res.send({
      jsonrpc: '2.0',
      error: {code: -32000, message: g.f('Server error'), data: data},
      id: null,
    });
  };
};

// A mock wrapper function to help code generation.
// Note that we can't make it a real function and use .toString() on it because
// that causes a whole world of trouble when we run strong-remoting's unit tests
// with code coverage.
const mockWrapper = [
  'function mockWrapper(method) {',
  '  return function(__args__, jaysonCallback) {',
  '    // For JSONRPC, we expect (params, jaysonCallback) where params can be object or array',
  '    var rawArgs = Array.prototype.slice.call(arguments, 0, -1);', // Remove jayson callback
  '    var args = [];',
  '    ',
  '    // Handle named parameters (object) vs positional parameters (array)',
  '    if (rawArgs.length === 1 && typeof rawArgs[0] === "object" && !Array.isArray(rawArgs[0])) {',
  '      // Named parameters: extract values in the order defined by method.accepts',
  '      var namedParams = rawArgs[0];',
  '      if (method.accepts && method.accepts.length > 0) {',
  '        for (var i = 0; i < method.accepts.length; i++) {',
  '          var paramName = method.accepts[i].arg;',
  '          args.push(namedParams[paramName]);',
  '        }',
  '      }',
  '    } else {',
  '      // Positional parameters: use as-is, but skip empty arrays',
  '      if (rawArgs.length === 1 && Array.isArray(rawArgs[0]) && rawArgs[0].length === 0) {',
  '        args = [];',
  '      } else {',
  '        args = rawArgs;',
  '      }',
  '    }',
  '    ',
  '    var methodCallback = function(err, result) {',
  '      if (jaysonCallback) {',
  '        // Ensure callback is called asynchronously to avoid issues with jayson',
  '        process.nextTick(function() {',
  '          jaysonCallback(err, result);',
  '        });',
  '      }',
  '    };',
  '    args.push(methodCallback);', // Add our callback
  '    ',
  '    if (method.isStatic) {',
  '      method.getFunction().apply(method.ctor, args);',
  '    } else {',
  '      method.sharedCtor.invoke(method, function(err, instance) {',
  '        if (err) return jaysonCallback(err);',
  '        method.getFunction().apply(instance, args);',
  '      });',
  '    }',
  '  };',
  '}',
].join('\n');

/* istanbul ignore next */
JsonRpcAdapter.prototype.createHandler = function() {
  const corsOptions = this.remotes.options.cors;
  if (corsOptions !== undefined && corsOptions !== false) {
    throw new Error(g.f(
      'The REST adapter no longer comes with a built-in CORS middleware, ' +
        'the config option %j is no longer available.' +
        'See %s for more details.',
      'remoting.cors',
      'https://docs.strongloop.com/display/public/LB/Security+considerations',
    ));
  }

  const root = express.Router();
  const classes = this.remotes.classes();

  // Add a handler to tolerate empty json as connect's json middleware throws an error
  root.use(function(req, res, next) {
    if (req.is('application/json')) {
      if (req.get('Content-Length') === '0') {
        // This doesn't cover the transfer-encoding: chunked
        req._body = true; // Mark it as parsed
        req.body = {};
      }
    }
    next();
  });

  // Set strict to be `false` so that anything `JSON.parse()` accepts will be parsed
  debug('remoting options: %j', this.remotes.options);
  const jsonOptions = this.remotes.options.json || {strict: false};

  root.use(json(jsonOptions));

  root.use(JsonRpcAdapter.errorHandler());

  classes.forEach(function(sc) {
    const server = new jayson.server({});

    debug('Setting up JSONRPC route for class: %s', sc.name);

    // Create a custom middleware that wraps jayson and ensures correct Content-Type
    const jaysonMiddleware = new jayson.server.interfaces.middleware(server, {});

    const routePath = '/' + sc.name + '/jsonrpc';
    debug('Registering JSONRPC route: POST %s', routePath);

    root.post(routePath, function(req, res, next) {
      debug('JSONRPC request received for: %s at %s', sc.name, req.url);

      // Set Content-Type header before processing
      res.setHeader('Content-Type', 'application/json');

      jaysonMiddleware(req, res, next);
    });

    const methods = sc.methods();

    methods.forEach(function(method) {
      // Wrap the method so that it will keep its own receiver - the shared class
      let argsNames = '';
      if (method.accepts) {
        argsNames = method.accepts.map(function(item) {
          return item.arg;
        });
        argsNames = argsNames.join(',');
      } else {
        const m = method.getFunction();
        if (m.length > 1) {
          // The method has more args than cb
          // Build dummy param names
          const names = [];
          for (let i = 0; i < m.length - 1; i++) {
            names.push('param' + i);
          }
          argsNames = names.join(',');
        }
      }
      // Don't add 'cb' here - we handle the callback in the wrapper
      argsNames = argsNames || '';

      // Generate the function based on the wrapper
      // For JSONRPC, we always use a generic signature that can handle both named and positional parameters
      // The function will always be (params, jaysonCallback) where params can be an object or individual args
      const funcBody = mockWrapper.toString().
        replace('function mockWrapper(method) {', '').
        replace('__args__, jaysonCallback', 'params, jaysonCallback').
        replace(/}$/, '');
      /* jslint evil: true */
      const fn = new Function('method', funcBody)(method);
      if (debug.enabled) {
        debug('Generated function: %s', fn.toString());
      }

      debug('Registering JSONRPC method: %s for class: %s', method.name, sc.name);
      server.method(method.name, fn);
    });
  });

  // Add a catch-all route for debugging
  root.use(function(req, res, next) {
    debug('Unmatched request: %s %s', req.method, req.url);
    next();
  });

  return root;
};

JsonRpcAdapter.prototype.allRoutes = function() {
  const routes = [];
  const adapter = this;
  const classes = this.remotes.classes();
  let currentRoot = '';

  classes.forEach(function(sc) {
    adapter
      .getRoutes(sc)
      .forEach(function(classRoute) {
        currentRoot = classRoute.path;
        const methods = sc.methods();

        const functions = [];
        methods.forEach(function(method) {
          // Use functions to keep track of JS functions to dedupe
          if (functions.indexOf(method.fn) === -1) {
            functions.push(method.fn);
          } else {
            return; // Skip duplicate methods such as X.m1 = X.m2 = function() {...}
          }
          adapter.getRoutes(method).forEach(function(route) {
            if (method.isStatic) {
              addRoute(route.verb, route.path, method);
            } else {
              adapter
                .getRoutes(method.sharedCtor)
                .forEach(function(sharedCtorRoute) {
                  addRoute(route.verb, sharedCtorRoute.path + route.path, method);
                });
            }
          });
        });
      });
  });

  return routes;

  function addRoute(verb, path, method) {
    if (path === '/' || path === '//') {
      path = currentRoot;
    } else {
      path = currentRoot + path;
    }

    if (path[path.length - 1] === '/') {
      path = path.substr(0, path.length - 1);
    }

    // TODO this could be cleaner
    path = path.replace(/\/\//g, '/');

    routes.push({
      verb: verb,
      path: path,
      description: method.description,
      notes: method.notes,
      method: method.stringName,
      accepts: (method.accepts && method.accepts.length) ? method.accepts : undefined,
      returns: (method.returns && method.returns.length) ? method.returns : undefined,
      errors: (method.errors && method.errors.length) ? method.errors : undefined,
    });
  }
};
