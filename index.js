'use strict';

const express = require('express');
const app = express();
const routes = require('./routes.js');

app.use('/', express.static('client'));
app.get('/hello', routes.hello);
app.get('/feeds', routes.feeds);
app.get('/assets', routes.assets);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log('PWAssemble server listening on port', port);
});