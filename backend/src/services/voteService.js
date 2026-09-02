"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordVote = exports.ensurePollIsOpen = exports.getPollState = void 0;
var datastore_js_1 = require("../storage/datastore.js");
var httpError_js_1 = require("../utils/httpError.js");
var getPollState = function () { return datastore_js_1.dataStore.getPollState(); };
exports.getPollState = getPollState;
var ensurePollIsOpen = function () {
    var pollState = (0, exports.getPollState)();
    if (!pollState.settings.isOpen) {
        throw new httpError_js_1.ForbiddenError('Poll is currently closed');
    }
    return pollState;
};
exports.ensurePollIsOpen = ensurePollIsOpen;
var recordVote = function (selections) {
    (0, exports.ensurePollIsOpen)();
    return datastore_js_1.dataStore.addVote(selections);
};
exports.recordVote = recordVote;
