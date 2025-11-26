import express from "express";
import { globalErrorHandler } from "./middlewares/globalErrorHandler";
import { notFound } from "./middlewares/notFound";
import cors from "cors";
import path from "path";

import userRoutes from "./routes/user.routes";
import jobRoutes from "./routes/job.route";
import jobCategoryRoutes from "./routes/jobCategory.routes";
import subscriptionPlanRoutes from "./routes/subscriptionPlan.route";
import exprienceRoutes from "./routes/exprience.route";
import contactUsRoutes from "./routes/contactUs.route";
import recruiterAccoumntRoutes from "./routes/recruiterAccount.routes";
import followingRoutes from "./routes/following.route";
import messageRoomesRoutes from "./routes/messageRoom.route";
import messageRoutes from "./routes/message.route";
import appliedJobsRoutes from "./routes/appliedJob.route";
import notificationRoutes from "./routes/notification.route";
import paymentRoutes from "./routes/payment.route";
import adminDashboardRoutes from "./routes/adminDashboard.routes";
import bookmarkRoutes from "./routes/bookmark.routes";
import blogRoutes from "./routes/blog.route";
import awardAndHonorRoutes from "./routes/awardAndHonor.route";
import elevatorPitchRoutes from "./routes/elevatorPitch.route";
import createResumeRoutes from "./routes/createResume.routes";
import companyRoutes from "./routes/company.route";
import newsLetterRoutes from "./routes/newsletter.routes";
import resumeRoutes from "./routes/resume.route";
import skillRoutes from "./routes/skill.route";
import courencyRoutes from "./routes/courency.routes";
import languageRoutes from "./routes/language.routes";
import universityRoutes from "./routes/university.routes";
import contentRoutes from "./routes/contentRoutes";
import faqRoutes from "./routes/faq.routes";
import chatbotRoutes from "./routes/chatbot.routes";
import countryRoutes from "./routes/country.routes";


const app = express();

app.use(
  cors({
    origin: "*", //  frontend origin
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  })
);

app.use(express.json());

const uploadsDir = path.resolve(__dirname, "../uploads");
app.use("/uploads", express.static(uploadsDir));

app.use("/api/v1", userRoutes);

app.use("/api/v1", jobRoutes);

app.use("/api/v1/category", jobCategoryRoutes);

app.use("/api/v1/subscription", subscriptionPlanRoutes);

app.use("/api/v1/experiences", exprienceRoutes);

/********************
 * APIS FOR CONTACT *
 ********************/
app.use("/api/v1/contact", contactUsRoutes);

/**************************
 * APIS FOR RECRUITER APP *
 **************************/
app.use("/api/v1/recruiter", recruiterAccoumntRoutes);

/*****************************
 * APIS FOR FcompanyRoutesOLLOWING SYSTEM *
 *****************************/
app.use("/api/v1/following", followingRoutes);

/****************************
 * APIS FOR MESSAGING ROOMS *
 ****************************/
app.use("/api/v1/message-room", messageRoomesRoutes);

/*****************************
 * APIS FOR MESSAGING SYSTEM *
 *****************************/
app.use("/api/v1/message", messageRoutes);

/*************************
 * APIS FOR APPLIED JOBS *
 *************************/
app.use("/api/v1/applied-jobs", appliedJobsRoutes);

/********************************
 * APIS FOR NOTIFICATION SYSTEM *
 ********************************/
app.use("/api/v1/notifications", notificationRoutes);

/*********************
 * APIS FOR PAYMENTS *
 *********************/
app.use("/api/v1/payments", paymentRoutes);

/****************************
 * APIS FOR ADMIN DASHBOARD *
 ****************************/
app.use("/api/v1/admin", adminDashboardRoutes);

/********************
 * APIS FOR BOOKING *
 ********************/
app.use("/api/v1/bookmarks", bookmarkRoutes);

/******************
 * APIS FOR BLOGS *
 ******************/
app.use("/api/v1/blogs", blogRoutes);

/******************************
 * APIS FOR AWARDS AND HONORS *
 ******************************/
app.use("/api/v1/awards", awardAndHonorRoutes);

/**********************************
 * APIS FOR CREATE elevator pitch *
 **********************************/
app.use("/api/v1/elevator-pitch", elevatorPitchRoutes);

/**************************
 * APIS FOR CREATE RESUME *
 **************************/
app.use("/api/v1/create-resume", createResumeRoutes);

/*********************
 * APIS FOR COMPANYS *
 *********************/
app.use("/api/v1/company", companyRoutes);

/************************
 * APIS FOR NEWSLETTERS *
 ************************/
app.use("/api/v1/newsletter", newsLetterRoutes);

/********************
 * APIS FOR RESUME *
 ********************/
app.use("/api/v1/resume", resumeRoutes);
app.use("/api/v1/skill", skillRoutes);
app.use("/api/v1/university", universityRoutes);
app.use("/api/v1/language", languageRoutes);
app.use("/api/v1/courency", courencyRoutes);

app.use("/api/v1/content", contentRoutes);
app.use("/api/v1/countries", countryRoutes);

app.use("/api/v1/faqs", faqRoutes);
app.use("/api/v1/chatbot", chatbotRoutes);

app.use(notFound as never);
app.use(globalErrorHandler);

export default app;
