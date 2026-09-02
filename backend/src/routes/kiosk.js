"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.kioskRouter = void 0;
var express_1 = require("express");
var env_js_1 = require("../config/env.js");
var voteService_js_1 = require("../services/voteService.js");
var kioskService_js_1 = require("../services/kioskService.js");
var asyncHandler_js_1 = require("../utils/asyncHandler.js");
var httpError_js_1 = require("../utils/httpError.js");
exports.kioskRouter = (0, express_1.Router)();
exports.kioskRouter.post('/activate', (0, asyncHandler_js_1.asyncHandler)(function (req, res) {
    var secret = req.body.secret;
    if (!secret || secret !== env_js_1.env.kioskSecret) {
        throw new httpError_js_1.UnauthorizedError('Invalid kiosk activation secret');
    }
    var pollState = (0, voteService_js_1.getPollState)();
    if (!pollState.settings.isOpen) {
        throw new httpError_js_1.ForbiddenError('Poll is closed');
    }
    var session = kioskService_js_1.kioskService.createSession();
    res.status(201).json({ token: session.token });
}));
exports.kioskRouter.post('/deactivate', (0, asyncHandler_js_1.asyncHandler)(function (req, res) {
    var token = req.body.token;
    if (typeof token === 'string') {
        kioskService_js_1.kioskService.revokeSession(token);
    }
    res.status(204).send();
}));
