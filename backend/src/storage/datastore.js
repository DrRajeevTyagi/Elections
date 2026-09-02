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
exports.dataStore = exports.DataStore = void 0;
var promises_1 = require("fs/promises");
var path_1 = require("path");
var crypto_1 = require("crypto");
var env_js_1 = require("../config/env.js");
var posts_js_1 = require("../config/posts.js");
var cloneCandidates = function (candidates) {
    return candidates.map(function (candidate) { return (__assign({}, candidate)); });
};
var createDefaultPollState = function () { return ({
    settings: {
        isOpen: false,
        allowRevote: false
    },
    secretKey: env_js_1.env.kioskSecret
}); };
var createDefaultData = function () { return ({
    candidates: cloneCandidates(posts_js_1.DEFAULT_CANDIDATES),
    votes: [],
    pollState: createDefaultPollState()
}); };
var isCandidate = function (value) {
    return (typeof value === 'object' &&
        value !== null &&
        typeof value.id === 'string' &&
        typeof value.name === 'string' &&
        typeof value.post === 'string');
};
var isStoredVote = function (value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    var candidateVote = value;
    return (typeof candidateVote.id === 'string' &&
        typeof candidateVote.timestamp === 'number' &&
        candidateVote.selections !== undefined &&
        typeof candidateVote.selections === 'object');
};
var DataStore = /** @class */ (function () {
    function DataStore() {
        this.data = createDefaultData();
        this.writeQueue = Promise.resolve();
        this.filePath = env_js_1.env.dataFile;
    }
    DataStore.prototype.init = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.loadFromDisk()];
                    case 1:
                        _a.sent();
                        this.ensureCandidateCoverage();
                        return [4 /*yield*/, this.flush()];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    DataStore.prototype.loadFromDisk = function () {
        return __awaiter(this, void 0, void 0, function () {
            var raw, parsed, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 6]);
                        return [4 /*yield*/, (0, promises_1.readFile)(this.filePath, 'utf-8')];
                    case 1:
                        raw = _a.sent();
                        parsed = JSON.parse(raw);
                        this.data = this.mergeWithDefaults(parsed !== null && parsed !== void 0 ? parsed : {});
                        return [3 /*break*/, 6];
                    case 2:
                        error_1 = _a.sent();
                        if (!(error_1.code === 'ENOENT')) return [3 /*break*/, 4];
                        this.data = createDefaultData();
                        return [4 /*yield*/, this.persist()];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 5];
                    case 4: throw error_1;
                    case 5: return [3 /*break*/, 6];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    DataStore.prototype.mergeWithDefaults = function (parsed) {
        var _a, _b, _c, _d;
        var defaults = createDefaultData();
        if (Array.isArray(parsed.candidates) &&
            parsed.candidates.length > 0 &&
            parsed.candidates.every(function (candidate) { return isCandidate(candidate); })) {
            defaults.candidates = cloneCandidates(parsed.candidates);
        }
        if (Array.isArray(parsed.votes) && parsed.votes.every(function (vote) { return isStoredVote(vote); })) {
            defaults.votes = parsed.votes.map(function (vote) { return ({
                id: vote.id,
                timestamp: vote.timestamp,
                selections: __assign({}, vote.selections)
            }); });
        }
        if (parsed.pollState && typeof parsed.pollState === 'object') {
            var pollState = parsed.pollState;
            var basePollState = defaults.pollState;
            defaults.pollState = {
                secretKey: typeof pollState.secretKey === 'string' ? pollState.secretKey : basePollState.secretKey,
                settings: {
                    isOpen: (_b = (_a = pollState.settings) === null || _a === void 0 ? void 0 : _a.isOpen) !== null && _b !== void 0 ? _b : basePollState.settings.isOpen,
                    allowRevote: (_d = (_c = pollState.settings) === null || _c === void 0 ? void 0 : _c.allowRevote) !== null && _d !== void 0 ? _d : basePollState.settings.allowRevote
                }
            };
        }
        return defaults;
    };
    DataStore.prototype.persist = function () {
        return __awaiter(this, void 0, void 0, function () {
            var directory;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        directory = (0, path_1.dirname)(this.filePath);
                        return [4 /*yield*/, (0, promises_1.mkdir)(directory, { recursive: true })];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, (0, promises_1.writeFile)(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    DataStore.prototype.queuePersist = function () {
        var _this = this;
        this.writeQueue = this.writeQueue
            .then(function () { return _this.persist(); })
            .catch(function (error) {
            console.error('Failed to persist election data', error);
        });
    };
    DataStore.prototype.flush = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.writeQueue];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    DataStore.prototype.ensureCandidateCoverage = function () {
        var postsWithCandidates = new Set(this.data.candidates.map(function (candidate) { return candidate.post; }));
        for (var _i = 0, POST_IDS_1 = posts_js_1.POST_IDS; _i < POST_IDS_1.length; _i++) {
            var post = POST_IDS_1[_i];
            if (!postsWithCandidates.has(post)) {
                this.data.candidates.push({
                    id: post.toLowerCase() + '-placeholder',
                    name: post + ' Candidate',
                    post: post
                });
            }
        }
    };
    DataStore.prototype.getCandidates = function () {
        return this.data.candidates.map(function (candidate) { return (__assign({}, candidate)); });
    };
    DataStore.prototype.setCandidates = function (candidates) {
        this.data.candidates = cloneCandidates(candidates);
        this.ensureCandidateCoverage();
        this.queuePersist();
    };
    DataStore.prototype.getPollState = function () {
        return {
            secretKey: this.data.pollState.secretKey,
            settings: __assign({}, this.data.pollState.settings)
        };
    };
    DataStore.prototype.updatePollState = function (updater) {
        this.data.pollState = updater(this.getPollState());
        this.queuePersist();
        return this.getPollState();
    };
    DataStore.prototype.addVote = function (selections) {
        var vote = {
            id: (0, crypto_1.randomUUID)(),
            timestamp: Date.now(),
            selections: __assign({}, selections)
        };
        this.data.votes.push(vote);
        this.queuePersist();
        return vote;
    };
    DataStore.prototype.getVotes = function () {
        return this.data.votes.map(function (vote) { return ({
            id: vote.id,
            timestamp: vote.timestamp,
            selections: __assign({}, vote.selections)
        }); });
    };
    DataStore.prototype.resetVotes = function () {
        this.data.votes = [];
        this.queuePersist();
    };
    return DataStore;
}());
exports.DataStore = DataStore;
exports.dataStore = new DataStore();
