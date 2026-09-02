"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getResults = void 0;
var posts_js_1 = require("../config/posts.js");
var datastore_js_1 = require("../storage/datastore.js");
var countVotes = function (votes) {
    var _a;
    var tally = new Map();
    for (var _i = 0, votes_1 = votes; _i < votes_1.length; _i++) {
        var vote = votes_1[_i];
        for (var _b = 0, _c = Object.entries(vote.selections); _b < _c.length; _b++) {
            var _d = _c[_b], post = _d[0], candidateId = _d[1];
            var key = post + ':' + candidateId;
            tally.set(key, ((_a = tally.get(key)) !== null && _a !== void 0 ? _a : 0) + 1);
        }
    }
    return tally;
};
var getResults = function () {
    var votes = datastore_js_1.dataStore.getVotes();
    var tally = countVotes(votes);
    var candidates = datastore_js_1.dataStore.getCandidates();
    return posts_js_1.POST_IDS.map(function (post) {
        var postCandidates = candidates.filter(function (candidate) { return candidate.post === post; });
        var candidatesWithTotals = postCandidates.map(function (candidate) {
            var _a;
            return ({
                candidate: candidate,
                total: (_a = tally.get(post + ':' + candidate.id)) !== null && _a !== void 0 ? _a : 0
            });
        });
        candidatesWithTotals.sort(function (a, b) { return b.total - a.total; });
        return {
            post: post,
            candidates: candidatesWithTotals
        };
    });
};
exports.getResults = getResults;
