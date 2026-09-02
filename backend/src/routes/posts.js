"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postsRouter = void 0;
var express_1 = require("express");
var posts_js_1 = require("../config/posts.js");
var candidateService_js_1 = require("../services/candidateService.js");
var asyncHandler_js_1 = require("../utils/asyncHandler.js");
var httpError_js_1 = require("../utils/httpError.js");
exports.postsRouter = (0, express_1.Router)();
exports.postsRouter.get('/', (0, asyncHandler_js_1.asyncHandler)(function (_req, res) {
    var posts = posts_js_1.POST_IDS.map(function (postId) { return ({
        post: postId,
        candidates: (0, candidateService_js_1.listCandidatesByPost)(postId)
    }); });
    res.json({
        posts: posts,
        candidates: (0, candidateService_js_1.listCandidates)()
    });
}));
exports.postsRouter.get('/:postId/candidates', (0, asyncHandler_js_1.asyncHandler)(function (req, res) {
    var postId = req.params.postId;
    if (!postId || !(0, posts_js_1.isValidPostId)(postId)) {
        throw new httpError_js_1.BadRequestError('Invalid post identifier');
    }
    res.json({
        post: postId,
        candidates: (0, candidateService_js_1.listCandidatesByPost)(postId)
    });
}));
