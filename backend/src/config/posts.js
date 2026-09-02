"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CANDIDATES = exports.isValidPostId = exports.POST_IDS = void 0;
exports.POST_IDS = ['HB', 'HG', 'SSC', 'SRC', 'SCC'];
var isValidPostId = function (value) {
    return exports.POST_IDS.includes(value);
};
exports.isValidPostId = isValidPostId;
exports.DEFAULT_CANDIDATES = [
    { id: 'hb-1', name: 'Head Boy Candidate 1', post: 'HB' },
    { id: 'hg-1', name: 'Head Girl Candidate 1', post: 'HG' },
    { id: 'ssc-1', name: 'Sports Secretary Candidate 1', post: 'SSC' },
    { id: 'src-1', name: 'Student Representative Candidate 1', post: 'SRC' },
    { id: 'scc-1', name: 'Social Committee Candidate 1', post: 'SCC' }
];
