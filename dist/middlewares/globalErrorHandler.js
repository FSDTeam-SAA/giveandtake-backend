"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalErrorHandler = void 0;
// import config from '../app/config';
const zod_1 = require("zod");
const handleZodError_1 = __importDefault(require("../errors/handleZodError"));
const handleValidationError_1 = __importDefault(require("../errors/handleValidationError"));
const handleCastErrror_1 = __importDefault(require("../errors/handleCastErrror"));
const handleDuplicateKeyError_1 = __importDefault(require("../errors/handleDuplicateKeyError"));
const AppError_1 = __importDefault(require("../errors/AppError"));
// import { TErrorSources } from '../app/interface/error';
// import handleZodError from '../app/errors/handleZodError';
// import handleValidationError from '../app/errors/handleValidationError';
// import handleCastError from '../app/errors/handleCastErrror';
// import handleDuplicateError from '../app/errors/handleDuplicateKeyError';
// import AppError from '../app/errors/AppError';
const setErrorDetails = (simplifiedError) => {
    return {
        statusCode: simplifiedError.statusCode,
        message: simplifiedError.message,
        errorSources: simplifiedError.errorSources,
    };
};
// 14-2,3
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
const globalErrorHandler = (err, req, res, 
// eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
next) => {
    // setting default values
    let statusCode = 500;
    let message = 'An unexpected error occurred';
    let errorSources = [
        {
            path: '',
            message: 'Something went wrong',
        },
    ];
    if (err instanceof zod_1.ZodError) {
        const simplifiedError = (0, handleZodError_1.default)(err);
        ({ statusCode, message, errorSources } = setErrorDetails(simplifiedError));
    }
    else if (err?.name === 'ValidationError') {
        // Mongoose validation error
        const simplifiedError = (0, handleValidationError_1.default)(err);
        ({ statusCode, message, errorSources } = setErrorDetails(simplifiedError));
    }
    else if (err?.name === 'CastError') {
        // Mongoose cast error
        const simplifiedError = (0, handleCastErrror_1.default)(err);
        ({ statusCode, message, errorSources } = setErrorDetails(simplifiedError));
    }
    else if (err?.code === 11000) {
        // duplicate key error mongoose
        const simplifiedError = (0, handleDuplicateKeyError_1.default)(err);
        ({ statusCode, message, errorSources } = setErrorDetails(simplifiedError));
    }
    else if (err instanceof AppError_1.default) {
        // APPError handle custom
        statusCode = err?.statusCode;
        message = err?.message;
        errorSources = [
            {
                path: '',
                message: err.message,
            },
        ];
    }
    else if (err instanceof Error) {
        //default error pattern
        message = err?.message;
        errorSources = [
            {
                path: '',
                message: err.message,
            },
        ];
    }
    return res.status(statusCode).json({
        success: false,
        message,
        errorSources,
        // error: err,
        // stack: config.NODE_ENV === 'production' ? null : err.stack,
    });
};
exports.globalErrorHandler = globalErrorHandler;
