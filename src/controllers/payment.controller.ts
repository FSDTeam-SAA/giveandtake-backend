import { Request, Response, NextFunction } from "express";
import { paymentInfo } from "../models/paymentInfo.model";
import { calculateJobRefund, JOB_REFUND_ADMIN_RATE } from '../utils/jobPackagePolicy';
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
import { createNotification } from "../sockets/notification.service";
import { ElevatorPitch } from "../models/elevatorPitch.model";
import { removeElevatorPitchArtifacts } from "../services/videoProcessing.queue";
import {
  isCandidatePitchAvailable,
  isPaidLengthCandidatePitch,
} from "../services/candidatePitchEntitlement.service";
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


const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * MILLIS_PER_DAY);

const normalizePlanValid = (valid?: string | null) =>
  (valid || "").trim().toLowerCase();

/***********************
 * REFUND CALC HELPERS *
 ***********************/
const formatCurrency = (value: number) => Number(value.toFixed(2));

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
    if (captureDetails.amount.currency_code !== 'USD' || Math.round(numericAmount * 100) !== Math.round(plan.price * 100)) {
      throw new AppError(400, 'Captured amount does not match the selected package. Contact support for payment reconciliation.');
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
      data: payments.map(payment => ({ ...payment.toObject(),
        ...(payment.duration === 'credits' && payment.createdAt ? { refundQuote: {
          ...calculateJobRefund(payment.amount, payment.jobPostsUsed ?? 0, payment.createdAt),
          eligible: payment.paymentStatus === 'complete' && !payment.refundProcessing && calculateJobRefund(payment.amount, payment.jobPostsUsed ?? 0, payment.createdAt).eligible,
        } } : {}),
      })),
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
      data: payments.map(payment => ({ ...payment.toObject(),
        ...(payment.duration === 'credits' && payment.createdAt ? { refundQuote: {
          ...calculateJobRefund(payment.amount, payment.jobPostsUsed ?? 0, payment.createdAt),
          eligible: payment.paymentStatus === 'complete' && !payment.refundProcessing && calculateJobRefund(payment.amount, payment.jobPostsUsed ?? 0, payment.createdAt).eligible,
        } } : {}),
      })),
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

  if (payment.paymentStatus !== 'complete') throw new AppError(400, 'Only completed payments can be refunded');
  if (!req.user || (!['admin', 'super-admin'].includes(req.user.role) && String(req.user._id) !== String(payment.userId))) {
    throw new AppError(403, 'You cannot refund this payment');
  }
  const user = await User.findById(payment.userId);
  if (!user) {
    throw new AppError(404, "User not found");
  }

  const locked = await paymentInfo.findOneAndUpdate(
    { _id: payment._id, paymentStatus: 'complete', refundProcessing: { $ne: true } },
    { $set: { refundProcessing: true } }, { new: true },
  );
  if (!locked) throw new AppError(409, 'This payment already has a refund in progress');
  payment.jobPostsUsed = locked.jobPostsUsed;
  let providerAttempted = false;
  try {
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
    refundWindowDays = 30;
    const cutoff = addDays(paymentStart, refundWindowDays);
    if (now > cutoff) throw new AppError(400, 'Job packages are non-refundable after 30 days from payment.');
    const jobPostsDuringWindow = payment.jobPostsUsed ?? await Job.countDocuments({
      billingPlanId: payment._id,
      createdAt: { $gte: paymentStart, $lte: now },
    });
    deductions = calculateJobRefund(payment.amount, jobPostsDuringWindow, paymentStart, now).deductions;
    notes.push(`${jobPostsDuringWindow} job posts charged at $99.99 each.`);

  } else {
    throw new AppError(
      400,
      "Refund policy is not defined for this subscription type."
    );
  }

  const grossCents = Math.max(Math.round(payment.amount * 100) - Math.round(deductions * 100), 0);
  const adminCents = Math.round(grossCents * JOB_REFUND_ADMIN_RATE);
  const adminFee = adminCents / 100;
  const refundAmount = (grossCents - adminCents) / 100;

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

  providerAttempted = true;
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

  payment.refundProcessing = false;
  payment.paymentStatus = "refunded";
  payment.planStatus = "deactivate";
  payment.refundTransactionId = refundTransactionId;
  payment.refundDate = new Date();
  payment.refundAdminFee = adminFee;
  payment.refundDeductions = deductions;
  payment.refundNotes = notes.join(" | ");
  await payment.save();

  if (audience === "candidate") {
    const pitch = await ElevatorPitch.findOne({ userId: payment.userId });
    const pitchStillAvailable = pitch
      ? await isCandidatePitchAvailable(pitch, payment.userId)
      : false;
    if (
      pitch &&
      isPaidLengthCandidatePitch(pitch) &&
      !pitchStillAvailable
    ) {
      // Hide the paid-length pitch before touching storage. Even if R2 is
      // temporarily unavailable, the candidate immediately sees the normal
      // free upload screen and playback remains blocked.
      pitch.status = "deactivate";
      await pitch.save();

      try {
        await removeElevatorPitchArtifacts({
          userId: String(payment.userId),
          rawKey: pitch.video?.rawKey ?? pitch.video?.url ?? undefined,
        });
        await ElevatorPitch.deleteOne({ _id: pitch._id });
        payment.pitchRemovedAt = new Date();
        await payment.save();
      } catch (pitchCleanupError) {
        // The nightly targeted expiry/refund cleanup will retry this record.
        console.error(
          "[payment] Failed to remove refunded candidate pitch assets:",
          pitchCleanupError
        );
      }
    }
  }

  try {
    await createNotification({
      to: user._id as any,
      message:
        audience === "candidate"
          ? "Your refund has been issued. Please upload a free 30-second elevator video pitch if you have not already done so."
          : "Your refund has been issued.",
      type: "Refund processed",
      id: payment._id as any,
    });
  } catch (notificationError) {
    // The provider refund is already complete; notification delivery must not
    // make the refund endpoint report a false failure.
    console.error("[payment] Failed to create refund notification:", notificationError);
  }

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
  } catch (error) {
    // An ambiguous provider failure remains locked for reconciliation; retrying
    // blindly could send a second refund. Validation failures are safe to retry.
    if (!providerAttempted) await paymentInfo.updateOne({ _id: payment._id }, { $set: { refundProcessing: false } });
    throw error;
  }
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
    plan: paymentIntent.metadata.planValid === 'credits' ? {
      _id: plan._id, for: paymentIntent.metadata.audience, valid: 'credits',
      jobPostCredits: paymentIntent.metadata.jobPostCredits === 'unlimited' ? null : Number(paymentIntent.metadata.jobPostCredits),
    } : plan,
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
    if (plan.archived) throw new AppError(400, 'This package is no longer available for purchase');
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
        ...(plan.valid === 'credits' ? { jobPostCredits: plan.jobPostCredits === null ? 'unlimited' : String(plan.jobPostCredits) } : {}),
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
