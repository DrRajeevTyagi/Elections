"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = void 0;
var express_1 = require("express");
exports.healthRouter = (0, express_1.Router)();
exports.healthRouter.get('/', function (_req, res) {
    res.json({ status: 'ok', timestamp: Date.now() });
});
