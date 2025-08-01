"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Following = void 0;
const mongoose_1 = require("mongoose");
const followingSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, required: true, ref: 'User' },
    recruiterId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, {
    timestamps: true,
});
exports.Following = (0, mongoose_1.model)('Following', followingSchema);
