"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteOldDeactivatedUsers = void 0;
const user_model_1 = require("../models/user.model");
const deleteOldDeactivatedUsers = async () => {
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const now = new Date();
    const result = await user_model_1.User.deleteMany({
        deactivate: true,
        dateOfdeactivate: { $lte: new Date(now.getTime() - THIRTY_DAYS) },
    });
    console.log(`${result.deletedCount} deactivated users deleted`);
};
exports.deleteOldDeactivatedUsers = deleteOldDeactivatedUsers;
