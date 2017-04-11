"use strict";
// tslint:disable:missing-jsdoc no-backbone-get-set-outside-model
const bodyParser = require("body-parser");
const express = require("express");
const mongoose = require("mongoose");
const errorHandler_1 = require("./middlewares/errorHandler");
const notFoundHandler_1 = require("./middlewares/notFoundHandler");
const app = express();
// view engine setup
app.set('views', `${__dirname}/views`);
app.set('view engine', 'ejs');
app.use(bodyParser.json());
// The extended option allows to choose between parsing the URL-encoded data
// with the querystring library (when false) or the qs library (when true).
app.use(bodyParser.urlencoded({ extended: true }));
// 静的ファイル
// app.use(express.static(__dirname + '/../public'));
// mongoose
mongoose.Promise = global.Promise;
mongoose.connect(process.env.MONGOLAB_URI);
// routers
const router_1 = require("./routers/router");
const webhook_1 = require("./routers/webhook");
app.use('/', router_1.default);
app.use('/webhook', webhook_1.default);
// 404
app.use(notFoundHandler_1.default);
// error handlers
app.use(errorHandler_1.default);
module.exports = app;
