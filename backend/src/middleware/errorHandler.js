"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
var httpError_js_1 = require("../utils/httpError.js");
var errorHandler = function (err, _req, res, _next) {
    var status = 500;
    var message = 'Internal Server Error';
    if (err instanceof httpError_js_1.HttpError) {
        status = err.status;
        message = err.message;
    }
    else if (typeof err === 'object' && err !== null) {
        if ('status' in err && typeof err.status === 'number') {
            status = err.status;
        }
        if ('message' in err && typeof err.message === 'string') {
            message = err.message;
        }
    }
    res.status(status).json({ error: message });
};
exports.errorHandler = errorHandler;
