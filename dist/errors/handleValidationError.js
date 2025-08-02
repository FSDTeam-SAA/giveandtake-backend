"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const handleValidationError = (err) => {
    const statusCode = 400;
    const errorSources = Object.values(err.errors).map((valueItems) => {
        return {
            path: valueItems.path,
            message: valueItems.message,
        };
    });
    return {
        statusCode,
        message: 'Validation Error',
        errorSources,
    };
};
exports.default = handleValidationError;
