"use strict";
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
var url_1 = require("url");
var dotenv_1 = require("dotenv");
dotenv_1.default.config();
var parseNumber = function (value, fallback) {
    if (!value)
        return fallback;
    var parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
};
var defaultDataFileUrl = new URL('../../data/data.json', import.meta.url);
exports.env = {
    port: parseNumber(process.env.PORT, 4000),
    adminSecret: (_a = process.env.ADMIN_SECRET) !== null && _a !== void 0 ? _a : 'admin-secret',
    kioskSecret: (_b = process.env.KIOSK_SECRET) !== null && _b !== void 0 ? _b : 'unlock-me',
    dataFile: (_c = process.env.DATA_FILE) !== null && _c !== void 0 ? _c : (0, url_1.fileURLToPath)(defaultDataFileUrl)
};
