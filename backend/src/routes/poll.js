"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollRouter = void 0;
var express_1 = require("express");
var adminAuth_js_1 = require("../middleware/adminAuth.js");
var kioskService_js_1 = require("../services/kioskService.js");
var voteService_js_1 = require("../services/voteService.js");
var datastore_js_1 = require("../storage/datastore.js");
var asyncHandler_js_1 = require("../utils/asyncHandler.js");
var sanitizePoll = function (_a) {
    var settings = _a.settings;
    return ({ settings: settings });
};
exports.pollRouter = (0, express_1.Router)();
exports.pollRouter.get('/', (0, asyncHandler_js_1.asyncHandler)(function (_req, res) {
    res.json({ poll: sanitizePoll((0, voteService_js_1.getPollState)()) });
}));
exports.pollRouter.post('/open', adminAuth_js_1.requireAdminSecret, (0, asyncHandler_js_1.asyncHandler)(function (_req, res) {
    var poll = datastore_js_1.dataStore.updatePollState(function (state) { return (__assign(__assign({}, state), { settings: __assign(__assign({}, state.settings), { isOpen: true }) })); });
    res.json({ poll: sanitizePoll(poll) });
}));
exports.pollRouter.post('/close', adminAuth_js_1.requireAdminSecret, (0, asyncHandler_js_1.asyncHandler)(function (_req, res) {
    kioskService_js_1.kioskService.clearSessions();
    var poll = datastore_js_1.dataStore.updatePollState(function (state) { return (__assign(__assign({}, state), { settings: __assign(__assign({}, state.settings), { isOpen: false }) })); });
    res.json({ poll: sanitizePoll(poll) });
}));
