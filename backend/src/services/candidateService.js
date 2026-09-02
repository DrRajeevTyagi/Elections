"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCandidatesByPost = exports.listCandidates = void 0;
var datastore_js_1 = require("../storage/datastore.js");
var listCandidates = function () { return datastore_js_1.dataStore.getCandidates(); };
exports.listCandidates = listCandidates;
var listCandidatesByPost = function (post) {
    return (0, exports.listCandidates)().filter(function (candidate) { return candidate.post === post; });
};
exports.listCandidatesByPost = listCandidatesByPost;
