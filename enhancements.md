# Enhancement Plans

This file tracks our enhancement plans for the project

## Dependency Updates

### Production Dependencies
- **async**: Upgrade from `^3.1.0` to `^3.2.4`
- **body-parser**: Upgrade from `^1.12.4` to `^1.20.2` (verify middleware usage with Express)
- **debug**: Upgrade from `^4.1.1` to `^4.3.4`
- **eventemitter2**: Upgrade from `^5.0.1` to `^6.4.3` (major update, check for breaking changes)
- **express**: Change from loose version "4.x" to pinned version `4.18.2`
- **inflection**: Upgrade from `^1.7.1` to `^1.13.1`
- **js2xmlparser**: Upgrade from `^3.0.0` to `^4.0.1`
- **qs**: Upgrade from `^6.2.1` to `^6.11.2`
- **strong-globalize**: Upgrade from `^5.0.2` to `^7.1.1` (test changes for internationalization)
- **traverse**: Upgrade from `^0.6.6` to `^0.6.7`
- **xml2js**: Upgrade from `^0.4.8` to `^0.4.23`

Note: Packages like `depd`, `escape-string-regexp`, `jayson`, `loopback-datatype-geopoint`, `loopback-phase`, `mux-demux`, `request` and `sse` remain unchanged. The `request` package is deprecated and may need to be replaced eventually

### Development Dependencies
- **bluebird**: Upgrade from `^3.4.1` to `^3.7.2`
- **chai**: Upgrade from `^4.1.2` to `^4.3.7`
- **coveralls**: Upgrade from `^3.0.1` to `^3.1.1`
- **eslint**: Upgrade from `^6.5.1` to `^8.45.0` (this major update may require config adjustments)
- **eventsource**: Upgrade from `^1.0.5` to `^1.1.0`
- **mocha**: Upgrade from `^6.2.1` to `^10.2.0` (review breaking changes)
- **nyc**: Upgrade from `^14.1.1` to `^15.1.0`
- **requirejs**: Upgrade from `^2.2.0` to `^2.3.6`
- **socket.io**: Upgrade from `^2.1.1` to `^4.6.1` (major changes; ensure compatibility with client and server code)
- **supertest**: Upgrade from `^4.0.2` to `^6.3.3`

Note: `dirty-chai`, `eslint-config-loopback` and `event-stream` remain unchanged. For `event-stream`, consider alternatives due to past security issues

## Limitations and Considerations
- Major updates (e.g. eventemitter2, eslint, mocha, socket.io) might introduce breaking changes that require code review and thorough testing
- Some configuration files and test setups may need adjustments to be compatible with newer versions
- Always review changelogs for packages to understand any critical changes
- Consider migrating from deprecated packages like `request` to modern alternatives such as axios or got 

## Enhancement Journal

4. Upgraded `loopback-phase` from 3.1.0 to 3.4.0
  - Added promise-based phase execution support
  - Improved error handling in phase pipelines
  - Updated to use Node.js 14+ runtime features
  - Migrated callback-style phase execution to async/await pattern
  - Integrated security fixes from lodash dependency updates

3. Bluebird Replacement
- Removed Bluebird from devDependencies in package.json
- Verified that no code explicitly imports Bluebird, relying on native Promise instead

2. EventEmitter Replacement
- Replaced eventemitter2 (deprecated) with Node's native EventEmitter in lib/remote-objects.js
  - Updated the require statement from `require('eventemitter2').EventEmitter2` to `const {EventEmitter} = require('events')`
  - Removed eventemitter2 from package.json dependencies
  - Updated associated comments to reflect the change

1. Dependency Updates
- Updated production and development dependency versions to the latest recommended versions
