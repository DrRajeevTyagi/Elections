"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = void 0;
var cors_1 = require("cors");
var express_1 = require("express");
var morgan_1 = require("morgan");
var errorHandler_js_1 = require("./middleware/errorHandler.js");
var index_js_1 = require("./routes/index.js");
var createApp = function () {
    var app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    app.use(express_1.default.json());
    app.use((0, morgan_1.default)('dev'));
    app.use('/api', index_js_1.apiRouter);
    app.use(errorHandler_js_1.errorHandler);
    return app;
};
exports.createApp = createApp;
