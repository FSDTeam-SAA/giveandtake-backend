"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const globalErrorHandler_1 = require("./middlewares/globalErrorHandler");
const notFound_1 = require("./middlewares/notFound");
const cors_1 = __importDefault(require("cors"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const job_route_1 = __importDefault(require("./routes/job.route"));
const jobCategory_routes_1 = __importDefault(require("./routes/jobCategory.routes"));
const subscriptionPlan_route_1 = __importDefault(require("./routes/subscriptionPlan.route"));
const exprience_route_1 = __importDefault(require("./routes/exprience.route"));
const contactUs_route_1 = __importDefault(require("./routes/contactUs.route"));
const recruiterAccount_routes_1 = __importDefault(require("./routes/recruiterAccount.routes"));
const following_route_1 = __importDefault(require("./routes/following.route"));
const messageRoom_route_1 = __importDefault(require("./routes/messageRoom.route"));
const message_route_1 = __importDefault(require("./routes/message.route"));
const appliedJob_route_1 = __importDefault(require("./routes/appliedJob.route"));
const notification_route_1 = __importDefault(require("./routes/notification.route"));
const payment_route_1 = __importDefault(require("./routes/payment.route"));
const adminDashboard_routes_1 = __importDefault(require("./routes/adminDashboard.routes"));
const bookmark_routes_1 = __importDefault(require("./routes/bookmark.routes"));
const blog_route_1 = __importDefault(require("./routes/blog.route"));
const awardAndHonor_route_1 = __importDefault(require("./routes/awardAndHonor.route"));
const elevatorPitch_route_1 = __importDefault(require("./routes/elevatorPitch.route"));
const createResume_routes_1 = __importDefault(require("./routes/createResume.routes"));
const company_route_1 = __importDefault(require("./routes/company.route"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: '*', //  frontend origin
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
}));
// Serve static files with directory listing disabled
app.use('/storage', express_1.default.static(path_1.default.join(__dirname, '../storage'), {
    dotfiles: 'deny', // Prevent access to dotfiles (.env, etc.)
    index: false, // Disable directory index
    redirect: false, // Disable path redirects
}));
app.use(express_1.default.json());
app.use('/api/v1', user_routes_1.default);
/*****************
 * APIS FOR JOBS *
 *****************/
app.use('/api/v1', job_route_1.default);
app.use('/api/v1/category', jobCategory_routes_1.default);
app.use('/api/v1/subscription', subscriptionPlan_route_1.default);
app.use('/api/v1/experiences', exprience_route_1.default);
/********************
 * APIS FOR CONTACT *
 ********************/
app.use('/api/v1/contact', contactUs_route_1.default);
/**************************
 * APIS FOR RECRUITER APP *
 **************************/
app.use('/api/v1/recruiter', recruiterAccount_routes_1.default);
/*****************************
 * APIS FOR FcompanyRoutesOLLOWING SYSTEM *
 *****************************/
app.use('/api/v1/following', following_route_1.default);
/****************************
 * APIS FOR MESSAGING ROOMS *
 ****************************/
app.use('/api/v1/message-room', messageRoom_route_1.default);
/*****************************
 * APIS FOR MESSAGING SYSTEM *
 *****************************/
app.use('/api/v1/message', message_route_1.default);
/*************************
 * APIS FOR APPLIED JOBS *
 *************************/
app.use('/api/v1/applied-jobs', appliedJob_route_1.default);
/********************************
 * APIS FOR NOTIFICATION SYSTEM *
 ********************************/
app.use('/api/v1/notifications', notification_route_1.default);
/*********************
 * APIS FOR PAYMENTS *
 *********************/
app.use('/api/v1/payments', payment_route_1.default);
/****************************
 * APIS FOR ADMIN DASHBOARD *
 ****************************/
app.use('/api/v1/admin', adminDashboard_routes_1.default);
/********************
 * APIS FOR BOOKING *
 ********************/
app.use('/api/v1/bookmarks', bookmark_routes_1.default);
/******************
 * APIS FOR BLOGS *
 ******************/
app.use('/api/v1/blogs', blog_route_1.default);
/******************************
 * APIS FOR AWARDS AND HONORS *
 ******************************/
app.use('/api/v1/awards', awardAndHonor_route_1.default);
/**********************************
 * APIS FOR CREATE elevator pitch *
 **********************************/
app.use('/api/v1/elevator-pitch', elevatorPitch_route_1.default);
/**************************
 * APIS FOR CREATE RESUME *
 **************************/
app.use('/api/v1/create-resume', createResume_routes_1.default);
/*********************
 * APIS FOR COMPANYS *
 *********************/
app.use('/api/v1/company', company_route_1.default);
app.use(notFound_1.notFound);
app.use(globalErrorHandler_1.globalErrorHandler);
exports.default = app;
