import { Request, Response, NextFunction } from "express";
import { paymentInfo } from "../models/paymentInfo.model";
import catchAsync from "../utils/catchAsync";
import { SubscriptionPlan } from "../models/subscriptionPlan.model";
import { User } from "../models/user.model";
import { createOrder, captureOrder, refundOrder } from "../services/paypal.service";
import {
  createPaymentIntent,
  retrievePaymentIntent,
  refundPaymentIntent,
  fromMinorUnits,
  constructWebhookEvent,
} from "../services/stripe.service";
import { isStripeConfigured, STRIPE_WEBHOOK_SECRET } from "../config/stripe";
import { buildMetaPagination, getPaginationParams } from "../utils/pagination";
import { refundProcessedTemplate, sendEmail } from "../utils/sendEmail";
import AppError from "../errors/AppError";
import { Job } from "../models/job.model";
import { AppliedJob } from "../models/appliedJob.model";
import { recordAndNotifyPayment } from "../utils/paymentReceipt";
import type StripeTypes from "stripe";
// import { refundOrder } from "../services/paypal.service"; // new service function
// JSON validation middleware
const validateJsonBody = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      success: false,
      error: "Invalid JSON payload",
      details: err.message,
    });
  }
  next();
};

/****************************
 * PAYPAL CREATEPAYPALORDER *
 ****************************/
export const createPaypalOrder = async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    const order = await createOrder(amount);
    res.status(200).json({
      success: true,
      message: "PayPal order created",
      orderId: order.id,
      links: order.links,
      data: {
        orderId: order.id,
        links: order.links,
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create PayPal order",
      error,
    });
  }
};

const mapPaypalStatusToEnum = (
  paypalStatus: string
): "complete" | "pending" | "failed" => {
  switch (paypalStatus.toUpperCase()) {
    case "COMPLETED":
      return "complete";
    case "PENDING":
      return "pending";
    case "FAILED":
    case "DECLINED":
    case "DENIED":
      return "failed";
    default:
      return "failed"; // fallback for unexpected values
  }
};

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;
const PAYG_FALLBACK_RATE = Number(process.env.PAYG_DEDUCTION_FALLBACK ?? 99);

const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * MILLIS_PER_DAY);

const normalizePlanValid = (valid?: string | null) =>
  (valid || "").trim().toLowerCase();

/***********************
 * REFUND CALC HELPERS *
 ***********************/
const formatCurrency = (value: number) => Number(value.toFixed(2));

const resolvePaygRate = async (audience: string) => {
  const paygPlan = await SubscriptionPlan.findOne({
    for: audience,
    valid: "PayAsYouGo",
  }).sort({ price: 1 });

  if (paygPlan?.price && paygPlan.price > 0) {
    return paygPlan.price;
  }
  return PAYG_FALLBACK_RATE;
};

/****************************
 * PAYPAL CAPTUREPAYPALPAYMENT *
 ****************************/
export const capturePaypalPayment = async (req: Request, res: Response) => {
  try {
    const { orderId, userId, planId, seasonId } = req.body;
    if (!planId) {
      throw new AppError(400, "Plan ID is required");
    }
    const capture = await captureOrder(orderId);
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError(400, "User not found");
    }

    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) {
      throw new AppError(404, "Subscription plan not found");
    }

    const captureDetails = capture.purchase_units[0].payments.captures[0];
    const numericAmount = Number(captureDetails.amount.value);
    if (Number.isNaN(numericAmount)) {
      throw new AppError(400, "Unable to determine payment amount");
    }

    const newPayment = await recordAndNotifyPayment({
      user,
      plan,
      amount: numericAmount,
      paymentStatus: mapPaypalStatusToEnum(captureDetails.status),
      transactionId: captureDetails.id,
      paymentMethod: "PayPal",
      seasonId,
    });

    res.status(200).json({
      message: "Payment captured successfully",
      payment: newPayment,
      success: true,
      data: {
        payment: newPayment,
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Payment capture failed", error });
  }
};

/*************************************
 * GET ALL PAYMENT HISTORY FOR ADMIN *
 *************************************/
export const getAllPayments = catchAsync(
  async (req: Request, res: Response) => {
    const { page, limit, skip } = getPaginationParams(req.query);

    const [payments, total] = await Promise.all([
      paymentInfo
        .find()
        .populate("userId", "name email")
        .populate("planId", "title price")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      paymentInfo.countDocuments(),
    ]);

    const meta = buildMetaPagination(total, page, limit);

    res.status(200).json({
      success: true,
      data: payments,
      meta,
    });
  }
);

/**************************************
 * GET ALL PAYMENT HISTORY FOR A USER *
 **************************************/
export const getPaymentsByUserId = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.params.userId;
    const { page, limit, skip } = getPaginationParams(req.query);

    const [payments, total] = await Promise.all([
      paymentInfo
        .find({ userId })
        .populate("planId", "title price valid")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      paymentInfo.countDocuments({ userId }),
    ]);

    const meta = buildMetaPagination(total, page, limit);

    res.status(200).json({
      success: true,
      data: payments,
      meta,
    });
  }
);


export const refundPaypalPayment = catchAsync(async (req: Request, res: Response) => {
  const { paymentId } = req.body;

  if (!paymentId) {
    throw new AppError(400, "Payment ID is required");
  }

  const payment = await paymentInfo
    .findById(paymentId)
    .populate("planId", "title valid for price");

  if (!payment) {
    throw new AppError(404, "Payment not found");
  }

  if (payment.paymentStatus === "refunded") {
    throw new AppError(400, "Payment already refunded");
  }

  const user = await User.findById(payment.userId);
  if (!user) {
    throw new AppError(404, "User not found");
  }

  const plan: any = payment.planId;
  if (!plan) {
    throw new AppError(400, "Subscription plan metadata is missing for this payment");
  }

  const audience = (plan.for || "").toLowerCase();
  const planValidity = normalizePlanValid(plan.valid);
  const paymentStart = payment.createdAt ?? payment.updatedAt ?? new Date();
  const now = new Date();
  const notes: string[] = [];
  let deductions = 0;
  let refundWindowDays: number | null = null;

  if (audience === "candidate") {
    if (planValidity === "monthly") {
      throw new AppError(
        400,
        "Monthly Candidates� subscriptions are nonrefundable as the admin fees will exceed the refund fees."
      );
    }

    if (planValidity === "yearly") {
      refundWindowDays = 30;
      const cutoff = addDays(paymentStart, refundWindowDays);
      if (now > cutoff) {
        throw new AppError(
          400,
          "Yearly Candidates� subscriptions are non-refundable after 30 days."
        );
      }

      const appliedJobExists = await AppliedJob.exists({
        userId: payment.userId,
        createdAt: { $gte: paymentStart },
      });

      if (appliedJobExists) {
        throw new AppError(
          400,
          "Yearly Candidates� subscriptions are non-refundable once a job application has been made."
        );
      }
    } else {
      throw new AppError(
        400,
        "Refunds are only available for yearly candidate upgrades."
      );
    }
  } else if (audience === "company" || audience === "recruiter") {
    if (planValidity === "monthly") {
      refundWindowDays = 7;
    } else if (planValidity === "yearly") {
      refundWindowDays = 30;
    } else {
      throw new AppError(
        400,
        "Refunds are only available for monthly or yearly subscriptions."
      );
    }

    const cutoff = addDays(paymentStart, refundWindowDays);
    if (now > cutoff) {
      throw new AppError(
        400,
        `This ${planValidity} ${audience} subscription is nonrefundable after ${refundWindowDays} days.`
      );
    }

    const jobPostsDuringWindow = await Job.countDocuments({
      userId: payment.userId,
      createdAt: {
        $gte: paymentStart,
        $lte: cutoff,
      },
    });

    if (jobPostsDuringWindow > 0) {
      const paygRate = await resolvePaygRate(audience);
      deductions = formatCurrency(jobPostsDuringWindow * paygRate);
      notes.push(
        `Deducted ${jobPostsDuringWindow} � PAYG rate ($${paygRate.toFixed(
          2
        )}) for job posts made during the refund window.`
      );
    }
  } else {
    throw new AppError(
      400,
      "Refund policy is not defined for this subscription type."
    );
  }

  const grossRefund = Math.max(payment.amount - deductions, 0);
  const adminFee = formatCurrency(grossRefund * 0.1);
  const refundAmount = formatCurrency(grossRefund - adminFee);

  if (refundAmount <= 0) {
    throw new AppError(
      400,
      "No refundable balance remains after deductions and admin fees."
    );
  }

  notes.push("10% admin fee applied.");

  // Route the refund back through whichever provider took the money.
  const isStripePayment =
    (payment.paymentMethod || "").toLowerCase() === "stripe";

  let refundTransactionId: string;
  let refundStatus: string;

  if (isStripePayment) {
    const stripeRefund = await refundPaymentIntent(
      payment.transactionId,
      refundAmount
    );
    // Stripe settles most refunds instantly ("succeeded") but some payment
    // methods legitimately sit in "pending" — both mean the refund was accepted.
    if (
      !stripeRefund ||
      (stripeRefund.status !== "succeeded" && stripeRefund.status !== "pending")
    ) {
      throw new AppError(400, "Refund failed or was not completed");
    }
    refundTransactionId = stripeRefund.id;
    refundStatus = stripeRefund.status;
  } else {
    const refundResponse = await refundOrder(
      payment.transactionId,
      refundAmount
    );
    if (!refundResponse || refundResponse.status !== "COMPLETED") {
      throw new AppError(400, "Refund failed or was not completed");
    }
    refundTransactionId = refundResponse.id;
    refundStatus = refundResponse.status;
  }

  payment.paymentStatus = "refunded";
  payment.refundTransactionId = refundTransactionId;
  payment.refundDate = new Date();
  payment.refundAdminFee = adminFee;
  payment.refundDeductions = deductions;
  payment.refundNotes = notes.join(" | ");
  await payment.save();

  try {
    await sendEmail(
      user.email,
      "Refund Processed - Elevator Video Pitch©",
      refundProcessedTemplate(user.name)
    );
  } catch (emailError) {
    // The refund is already settled and persisted — don't fail the request
    // just because the notification email bounced.
    console.error("[payment] Failed to send refund email:", emailError);
  }

  res.status(200).json({
    success: true,
    message: "Refund processed successfully",
    data: {
      refundTransactionId,
      status: refundStatus,
      refundAmount,
      deductions,
      adminFee,
      payment,
    },
  });
});

/* ============================================================
 *                      STRIPE INTEGRATION
 * ============================================================ */

/**
 * Records a succeeded Stripe PaymentIntent exactly once.
 *
 * Both the client-side confirm call and the webhook funnel through here, so
 * whichever arrives first writes the row and the other becomes a no-op.
 */
const finalizeStripePayment = async (
  paymentIntent: StripeTypes.PaymentIntent
) => {
  const existing = await paymentInfo.findOne({
    transactionId: paymentIntent.id,
  });
  if (existing) return existing;

  const { userId, planId, seasonId } = paymentIntent.metadata || {};

  if (!userId || !planId) {
    throw new AppError(
      400,
      "Payment is missing the user/plan metadata needed to activate a subscription"
    );
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, "User not found");
  }

  const plan = await SubscriptionPlan.findById(planId);
  if (!plan) {
    throw new AppError(404, "Subscription plan not found");
  }

  // amount_received is the authoritative settled figure.
  const amount = fromMinorUnits(
    paymentIntent.amount_received || paymentIntent.amount
  );

  return recordAndNotifyPayment({
    user,
    plan,
    amount,
    paymentStatus: "complete",
    transactionId: paymentIntent.id,
    paymentMethod: "Stripe",
    seasonId: seasonId || undefined,
  });
};

/*******************************
 * STRIPE: PUBLISHABLE KEY     *
 *******************************/
export const getStripeConfig = catchAsync(
  async (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: {
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
        configured: isStripeConfigured(),
      },
    });
  }
);

/**********************************
 * STRIPE: CREATE PAYMENT INTENT  *
 **********************************/
export const createStripePaymentIntent = catchAsync(
  async (req: Request, res: Response) => {
    if (!isStripeConfigured()) {
      throw new AppError(500, "Stripe is not configured on this server");
    }

    const { planId, userId, seasonId } = req.body;

    if (!planId) {
      throw new AppError(400, "Plan ID is required");
    }
    if (!userId) {
      throw new AppError(400, "User ID is required");
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new AppError(404, "User not found");
    }

    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) {
      throw new AppError(404, "Subscription plan not found");
    }

    // The charge amount always comes from the plan record, never from the
    // client, so a tampered request can't buy a plan at the wrong price.
    const amount = Number(plan.price);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError(400, "This plan does not require a payment");
    }

    const paymentIntent = await createPaymentIntent({
      amount,
      description: `${plan.title}${
        plan.valid ? ` (${plan.valid})` : ""
      } — Elevator Video Pitch`,
      metadata: {
        userId: String(user._id),
        planId: String(plan._id),
        planTitle: plan.title || "",
        planValid: plan.valid || "",
        audience: plan.for || "",
        ...(seasonId ? { seasonId: String(seasonId) } : {}),
      },
    });

    res.status(200).json({
      success: true,
      message: "Stripe payment intent created",
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount,
        currency: paymentIntent.currency,
        planTitle: plan.title,
        planValid: plan.valid,
      },
    });
  }
);

/**********************************
 * STRIPE: CONFIRM PAYMENT        *
 **********************************/
export const confirmStripePayment = catchAsync(
  async (req: Request, res: Response) => {
    if (!isStripeConfigured()) {
      throw new AppError(500, "Stripe is not configured on this server");
    }

    const { paymentIntentId } = req.body;
    if (!paymentIntentId) {
      throw new AppError(400, "Payment intent ID is required");
    }

    // Status is read straight from Stripe rather than trusted from the client.
    const paymentIntent = await retrievePaymentIntent(paymentIntentId);

    if (paymentIntent.status !== "succeeded") {
      throw new AppError(
        400,
        `Payment has not completed (status: ${paymentIntent.status})`
      );
    }

    const payment = await finalizeStripePayment(paymentIntent);

    res.status(200).json({
      success: true,
      message: "Payment confirmed successfully",
      payment,
      data: { payment },
    });
  }
);

/**********************************
 * STRIPE: WEBHOOK                *
 **********************************/
/**
 * Safety net for the case where the browser dies between Stripe confirming the
 * charge and our /stripe/confirm call landing. Mounted with a raw body parser
 * in app.ts because signature verification needs the unparsed payload.
 */
export const stripeWebhook = async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"];

  if (!STRIPE_WEBHOOK_SECRET) {
    res.status(400).json({
      received: false,
      message: "STRIPE_WEBHOOK_SECRET is not configured",
    });
    return;
  }

  let event: StripeTypes.Event;
  try {
    event = constructWebhookEvent(req.body as Buffer, String(signature));
  } catch (error) {
    console.error("[stripe] Webhook signature verification failed:", error);
    res
      .status(400)
      .json({ received: false, message: "Invalid webhook signature" });
    return;
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await finalizeStripePayment(
          event.data.object as StripeTypes.PaymentIntent
        );
        break;
      case "payment_intent.payment_failed":
        console.warn(
          "[stripe] Payment failed:",
          (event.data.object as StripeTypes.PaymentIntent).id
        );
        break;
      default:
        break;
    }
  } catch (error) {
    // Acknowledge regardless so Stripe stops retrying a payload we can't use;
    // the log is the signal for manual follow-up.
    console.error(`[stripe] Failed handling webhook ${event.type}:`, error);
  }

  res.status(200).json({ received: true });
};
