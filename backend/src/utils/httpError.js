"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnauthorizedError = exports.ForbiddenError = exports.BadRequestError = exports.HttpError = void 0;
var HttpError = /** @class */ (function (_super) {
    __extends(HttpError, _super);
    function HttpError(status, message) {
        var _this = _super.call(this, message) || this;
        _this.status = status;
        return _this;
    }
    return HttpError;
}(Error));
exports.HttpError = HttpError;
var BadRequestError = /** @class */ (function (_super) {
    __extends(BadRequestError, _super);
    function BadRequestError(message) {
        return _super.call(this, 400, message) || this;
    }
    return BadRequestError;
}(HttpError));
exports.BadRequestError = BadRequestError;
var ForbiddenError = /** @class */ (function (_super) {
    __extends(ForbiddenError, _super);
    function ForbiddenError(message) {
        return _super.call(this, 403, message) || this;
    }
    return ForbiddenError;
}(HttpError));
exports.ForbiddenError = ForbiddenError;
var UnauthorizedError = /** @class */ (function (_super) {
    __extends(UnauthorizedError, _super);
    function UnauthorizedError(message) {
        return _super.call(this, 401, message) || this;
    }
    return UnauthorizedError;
}(HttpError));
exports.UnauthorizedError = UnauthorizedError;
