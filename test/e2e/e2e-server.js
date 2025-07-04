// Copyright IBM Corp. 2014,2017. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

// this server should be started before running tests in the e2e directory
const express = require('express');
const path = require('path');
const FIXTURES = path.join(__dirname, 'fixtures');
const remotes = require(path.join(FIXTURES, 'remotes'));

const app = express();

// Add middleware for parsing JSON
app.use(express.json());

// Add the remotes handler
app.use(remotes.handler('rest'));

app.listen(3000, function() {
  console.log('e2e server listening...');
});
