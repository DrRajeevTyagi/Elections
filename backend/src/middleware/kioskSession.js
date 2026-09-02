"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireKioskSession = void 0;
var kioskService_js_1 = require("../services/kioskService.js");
var httpError_js_1 = require("../utils/httpError.js");
var TOKEN_HEADER = 'x-kiosk-token';
var requireKioskSession = function (req, res, next) {
    var token = req.header(TOKEN_HEADER);
    if (!token) {
        throw new httpError_js_1.UnauthorizedError('Kiosk session token missing');
    }
    var session = kioskService_js_1.kioskService.consumeSession(token.trim());
    res.locals.kioskSession = session;
    next();
};
exports.requireKioskSession = requireKioskSession;
