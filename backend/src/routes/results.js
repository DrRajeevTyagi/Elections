"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resultsRouter = void 0;
var express_1 = require("express");
var resultsService_js_1 = require("../services/resultsService.js");
var asyncHandler_js_1 = require("../utils/asyncHandler.js");
exports.resultsRouter = (0, express_1.Router)();
exports.resultsRouter.get('/', (0, asyncHandler_js_1.asyncHandler)(function (_req, res) {
    var results = (0, resultsService_js_1.getResults)();
    res.json({ results: results });
}));
