"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var config_1 = require("vitest/config");
exports.default = (0, config_1.defineConfig)({
    test: {
        environment: 'node',
        globals: true,
        include: ['src/**/*.test.ts'],
        coverage: {
            provider: 'istanbul'
        }
    }
});
