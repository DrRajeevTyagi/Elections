"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var vitest_1 = require("vitest");
var mockedDataStore = {
    getVotes: vitest_1.vi.fn(),
    getCandidates: vitest_1.vi.fn()
};
vitest_1.vi.mock('../storage/datastore.js', function () { return ({
    dataStore: mockedDataStore
}); });
(0, vitest_1.describe)('resultsService', function () {
    var candidates = [
        { id: 'hb-1', name: 'Head Boy A', post: 'HB' },
        { id: 'hb-2', name: 'Head Boy B', post: 'HB' },
        { id: 'hg-1', name: 'Head Girl A', post: 'HG' }
    ];
    (0, vitest_1.beforeEach)(function () {
        mockedDataStore.getCandidates.mockReturnValue(candidates);
        mockedDataStore.getVotes.mockReturnValue([
            { id: 'vote-1', timestamp: 1, selections: { HB: 'hb-1', HG: 'hg-1', SSC: 'ssc-1', SRC: 'src-1', SCC: 'scc-1' } },
            { id: 'vote-2', timestamp: 2, selections: { HB: 'hb-1', HG: 'hg-1', SSC: 'ssc-1', SRC: 'src-1', SCC: 'scc-1' } },
            { id: 'vote-3', timestamp: 3, selections: { HB: 'hb-2', HG: 'hg-1', SSC: 'ssc-1', SRC: 'src-1', SCC: 'scc-1' } }
        ]);
    });
    (0, vitest_1.it)('aggregates totals per candidate', function () { return __awaiter(void 0, void 0, void 0, function () {
        var getResults, results, headBoyResults;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./resultsService.js'); })];
                case 1:
                    getResults = (_a.sent()).getResults;
                    results = getResults();
                    headBoyResults = results.find(function (group) { return group.post === 'HB'; });
                    (0, vitest_1.expect)(headBoyResults).toBeDefined();
                    (0, vitest_1.expect)(headBoyResults === null || headBoyResults === void 0 ? void 0 : headBoyResults.candidates[0].candidate.id).toBe('hb-1');
                    (0, vitest_1.expect)(headBoyResults === null || headBoyResults === void 0 ? void 0 : headBoyResults.candidates[0].total).toBe(2);
                    (0, vitest_1.expect)(headBoyResults === null || headBoyResults === void 0 ? void 0 : headBoyResults.candidates[1].candidate.id).toBe('hb-2');
                    (0, vitest_1.expect)(headBoyResults === null || headBoyResults === void 0 ? void 0 : headBoyResults.candidates[1].total).toBe(1);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('includes zero totals for candidates without votes', function () { return __awaiter(void 0, void 0, void 0, function () {
        var getResults, results, headBoyResults, hb1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    mockedDataStore.getVotes.mockReturnValueOnce([
                        { id: 'vote-1', timestamp: 1, selections: { HB: 'hb-2', HG: 'hg-1', SSC: 'ssc-1', SRC: 'src-1', SCC: 'scc-1' } }
                    ]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./resultsService.js'); })];
                case 1:
                    getResults = (_a.sent()).getResults;
                    results = getResults();
                    headBoyResults = results.find(function (group) { return group.post === 'HB'; });
                    hb1 = headBoyResults === null || headBoyResults === void 0 ? void 0 : headBoyResults.candidates.find(function (item) { return item.candidate.id === 'hb-1'; });
                    (0, vitest_1.expect)(hb1 === null || hb1 === void 0 ? void 0 : hb1.total).toBe(0);
                    return [2 /*return*/];
            }
        });
    }); });
});
