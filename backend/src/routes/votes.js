"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.votesRouter = void 0;
var express_1 = require("express");
var posts_js_1 = require("../config/posts.js");
var candidateService_js_1 = require("../services/candidateService.js");
var voteService_js_1 = require("../services/voteService.js");
var kioskSession_js_1 = require("../middleware/kioskSession.js");
var asyncHandler_js_1 = require("../utils/asyncHandler.js");
var httpError_js_1 = require("../utils/httpError.js");
var validateVote = function (body) {
    if (!body || typeof body !== 'object') {
        throw new httpError_js_1.BadRequestError('Vote payload must be an object');
    }
    var submission = body;
    if (!submission.selections || typeof submission.selections !== 'object') {
        throw new httpError_js_1.BadRequestError('Selections are required');
    }
    var selections = submission.selections;
    var normalized = {};
    var _loop_1 = function (postId) {
        var selected = selections[postId];
        if (typeof selected !== 'string') {
            throw new httpError_js_1.BadRequestError('Missing candidate selection for ' + postId);
        }
        var candidates = (0, candidateService_js_1.listCandidatesByPost)(postId);
        if (!candidates.some(function (candidate) { return candidate.id === selected; })) {
            throw new httpError_js_1.BadRequestError('Invalid candidate selected for ' + postId);
        }
        normalized[postId] = selected;
    };
    for (var _i = 0, POST_IDS_1 = posts_js_1.POST_IDS; _i < POST_IDS_1.length; _i++) {
        var postId = POST_IDS_1[_i];
        _loop_1(postId);
    }
    return { selections: normalized };
};
exports.votesRouter = (0, express_1.Router)();
exports.votesRouter.post('/', kioskSession_js_1.requireKioskSession, (0, asyncHandler_js_1.asyncHandler)(function (req, res) {
    var submission = validateVote(req.body);
    var vote = (0, voteService_js_1.recordVote)(submission.selections);
    res.status(201).json({
        voteId: vote.id,
        timestamp: vote.timestamp
    });
}));
