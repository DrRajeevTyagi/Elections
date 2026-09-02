"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.kioskService = exports.KioskService = void 0;
var crypto_1 = require("crypto");
var httpError_js_1 = require("../utils/httpError.js");
var SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes
var KioskService = /** @class */ (function () {
    function KioskService() {
        this.sessions = new Map();
    }
    KioskService.prototype.createSession = function () {
        var token = (0, crypto_1.randomUUID)();
        var session = {
            token: token,
            activatedAt: Date.now()
        };
        this.sessions.set(token, session);
        return session;
    };
    KioskService.prototype.consumeSession = function (token) {
        var session = this.sessions.get(token);
        if (!session) {
            throw new httpError_js_1.UnauthorizedError('Invalid kiosk session token');
        }
        if (session.consumedAt) {
            throw new httpError_js_1.ForbiddenError('Kiosk session already used');
        }
        if (session.activatedAt + SESSION_TTL_MS < Date.now()) {
            this.sessions.delete(token);
            throw new httpError_js_1.ForbiddenError('Kiosk session expired');
        }
        session.consumedAt = Date.now();
        this.sessions.delete(token);
        return session;
    };
    KioskService.prototype.revokeSession = function (token) {
        this.sessions.delete(token);
    };
    KioskService.prototype.clearSessions = function () {
        this.sessions.clear();
    };
    return KioskService;
}());
exports.KioskService = KioskService;
exports.kioskService = new KioskService();
