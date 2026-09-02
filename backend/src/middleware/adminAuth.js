"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdminSecret = void 0;
var env_js_1 = require("../config/env.js");
var httpError_js_1 = require("../utils/httpError.js");
var HEADER = 'x-admin-secret';
var requireAdminSecret = function (req, _res, next) {
    var secret = req.header(HEADER);
    if (!secret || secret !== env_js_1.env.adminSecret) {
        throw new httpError_js_1.UnauthorizedError('Admin authentication failed');
    }
    next();
};
exports.requireAdminSecret = requireAdminSecret;
