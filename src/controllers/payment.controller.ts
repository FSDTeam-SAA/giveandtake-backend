import { Request, Response, NextFunction } from "express";
import { paymentInfo } from "../models/paymentInfo.model";
import catchAsync from "../utils/catchAsync";
import { SubscriptionPlan } from "../models/subscriptionPlan.model";
import { User } from "../models/user.model";
import { createOrder, captureOrder, refundOrder } from "../services/paypal.service";
import { buildMetaPagination, getPaginationParams } from "../utils/pagination";
import { refundProcessedTemplate, sendEmail } from "../utils/sendEmail";
import AppError from "../errors/AppError";
import { assertOwner } from "../utils/authz";
import { Job } from "../models/job.model";
import { AppliedJob } from "../models/appliedJob.model";
import { computeExpiryFromStart } from "../utils/subscription";
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
    // C6: derive the order amount from the server-side plan price when a planId
    // is supplied (never trust a client amount). Falls back to a validated
    // client amount for legacy callers; the authoritative check is at capture.
    const { planId } = req.body;
    let amountValue: string | undefined;
    if (planId) {
      const plan = await SubscriptionPlan.findById(planId);
      if (!plan) {
        res
          .status(404)
          .json({ success: false, message: "Subscription plan not found" });
        return;
      }
      amountValue = Number(plan.price).toFixed(2);
    } else if (
      req.body.amount != null &&
      !Number.isNaN(Number(req.body.amount))
    ) {
      amountValue = Number(req.body.amount).toFixed(2);
    }
    if (!amountValue || Number(amountValue) <= 0) {
      res
        .status(400)
        .json({ success: false, message: "Invalid payment amount" });
      return;
    }
    const order = await createOrder(amountValue);
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

const NO_REPLY_EMAIL = process.env.NO_REPLY_EMAIL || "no-reply@evpitch.com";
const AUDIENCE_FROM_EMAIL: Record<string, string> = {
  candidate:
    process.env.CANDIDATE_EMAIL_FROM || "noreplycandidate@evpitch.com",
  recruiter:
    process.env.RECRUITER_EMAIL_FROM || "noreplyrecruiter@evpitch.com",
  company: process.env.COMPANY_EMAIL_FROM || "noreplycompany@evpitch.com",
};

const resolveSenderForAudience = (audience?: string | null) =>
  AUDIENCE_FROM_EMAIL[(audience || "").toLowerCase()] || NO_REPLY_EMAIL;

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
    // C5: bind the payment to the authenticated user, not a client-supplied id.
    const { orderId, planId, seasonId } = req.body;
    const userId = req.user?._id;
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

    // C6: captured payment must be USD and at least the plan price. Blocks the
    // "pay $0.01 for any plan" bypass before any entitlement is recorded.
    const capturedCurrency = (
      captureDetails.amount.currency_code || ""
    ).toUpperCase();
    const expectedAmount = Number(plan.price);
    if (
      capturedCurrency !== "USD" ||
      Number.isNaN(expectedAmount) ||
      numericAmount + 0.001 < expectedAmount
    ) {
      throw new AppError(400, "Captured payment does not match the plan price");
    }

    const audience = (plan.for || user.role || "").toLowerCase();
    const planValidity = (plan.valid || "").toLowerCase();
    const derivedDuration =
      planValidity === "monthly"
        ? "monthly"
        : planValidity === "yearly"
        ? "yearly"
        : "payg";

    const isYearlyPlan = derivedDuration === "yearly";
    const expiresAt =
      computeExpiryFromStart(new Date(), derivedDuration) ?? undefined;

    const newPayment = await paymentInfo.create({
      userId,
      planId,
      amount: numericAmount,
      paymentStatus: mapPaypalStatusToEnum(captureDetails.status),
      transactionId: captureDetails.id,
      paymentMethod: "PayPal",
      seasonId,
      duration: derivedDuration,
      expiresAt,
    });

    const emailBody = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Receipt — Elevator Video Pitch</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <!-- Outer container -->
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f6f8;">
    <tr>
      <td align="center" style="padding:20px;">
        <!-- Inner container -->
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="padding:20px 24px;border-bottom:1px solid #eef0f2;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <h1 style="margin:0;font-size:20px;color:#111;">Elevator Video Pitch©</h1>
                    <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Payment Receipt</p>
                  </td>
                  <td style="text-align:right;vertical-align:middle;">
                    <!-- Company Logo -->
                     <div style="width:120px !important; max-width:120px !important; height:48px !important; overflow:hidden !important; border-radius:6px; display:inline-block;">
                      <img src="https://res.cloudinary.com/dftvlksve/image/upload/v1761363596/evp-logo_iuxk5w.jpg" 
                           alt="EVP Logo" 
                           class="logo-img"
                           style="width:120px !important; height:48px !important; display:block; border:0; outline:none; text-decoration:none;" 
                           width="120" 
                           height="48" />
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting & intro -->
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 12px;font-size:15px;color:#111;">
                Dear <strong>${user.name}</strong>,
              </p>
              <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5;">
                Thanks for choosing to upgrade your plan with <strong>Elevator Video Pitch©</strong>! Below is a copy of your receipt. You can also download this from your Account panel.
              </p>

              <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5;">
                As you have paid for a subscription plan, you are now entitled to upload a 60-second elevator video pitch to your profile.
              </p>
              ${
                isYearlyPlan
                  ? `<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5;">
                Because you selected our yearly plan, you are also entitled to a complimentary half-hour career-mentoring call with our partner, <strong>The Ladder Back Down&reg;</strong>. Please book your appointment at <a href="https://www.ladderbackdown.com/mentoring" style="color:#2B7FD0;text-decoration:none;">www.ladderbackdown.com/mentoring</a>. During this session you will receive live mentoring plus feedback on your Elevator Video Pitch.
              </p>
              <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5;">
                After booking, look out for a confirmation email from <a href="mailto:info@ladderbackdown.com" style="color:#2B7FD0;text-decoration:none;">info@ladderbackdown.com</a> that contains the UK phone/WhatsApp number to call at your scheduled time. Please check your inbox and any other folders to ensure you receive this acknowledgement.
              </p>`
                  : ""
              }

              <!-- Receipt card -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e6eef6;border-radius:6px;">
                <tr>
                  <td style="padding:16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:13px;color:#6b7280;vertical-align:top;padding-bottom:8px;">Invoice #</td>
                        <td style="font-size:14px;color:#111;vertical-align:top;padding-bottom:8px;text-align:right;"><strong>${newPayment.transactionId}</strong></td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#6b7280;vertical-align:top;padding-bottom:8px;">Date</td>
                        <td style="font-size:14px;color:#111;vertical-align:top;padding-bottom:8px;text-align:right;">${newPayment.createdAt}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#6b7280;vertical-align:top;padding-bottom:8px;">Amount</td>
                        <td style="font-size:14px;color:#111;vertical-align:top;padding-bottom:8px;text-align:right;"><strong>${numericAmount.toFixed(2)}</strong></td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Support -->
              <p style="margin:18px 0 6px;font-size:14px;color:#374151;">
                Please reach out to <a href="mailto:clientsupport@evpitch.com" style="color:#2B7FD0;text-decoration:none;">clientsupport@evpitch.com</a> if you have any queries.
              </p>

              <p style="margin:8px 0 0;font-size:14px;color:#374151;">
                Best regards,<br>
                <strong>Admin</strong><br>
                Elevator Video Pitch©
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;background:#fafafa;border-top:1px solid #eef0f2;text-align:center;font-size:12px;color:#9ca3af;">
              <div style="max-width:520px;margin:0 auto;">
                <p style="margin:0 0 8px;">Elevator Video Pitch©</p>
                <p style="margin:0;">If you did not make this purchase or need help, reply to this email or contact <a href="mailto:clientsupport@evpitch.com" style="color:#2B7FD0;text-decoration:none;">clientsupport@evpitch.com</a></p>
              </div>
            </td>
          </tr>
        </table>
        <!-- end inner container -->
      </td>
    </tr>
  </table>
</body>
</html>
`;


    if (captureDetails.status === "COMPLETED") {
      const sender = resolveSenderForAudience(audience);
      await sendEmail(user.email, "Payment Complete", emailBody, {
        from: sender,
        includeLegalFooter: true,
      });
    }

    res.status(200).json({
      message: "Payment captured successfully",
      payment: newPayment,
      success: true,
      data: {
        payment: newPayment,
      }
    });
  } catch (error) {
    // Preserve AppError status codes (e.g. the C6 amount-mismatch 400) and
    // never serialize the raw error object back to the client.
    const status = error instanceof AppError ? error.statusCode : 500;
    res.status(status).json({
      success: false,
      message:
        error instanceof AppError ? error.message : "Payment capture failed",
    });
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
    // C5: a user may only read their own payment history (admins bypass).
    assertOwner(req, userId);
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

  const refundResponse = await refundOrder(payment.transactionId, refundAmount);
  if (!refundResponse || refundResponse.status !== "COMPLETED") {
    throw new AppError(400, "Refund failed or was not completed");
  }

  payment.paymentStatus = "refunded";
  payment.refundTransactionId = refundResponse.id;
  payment.refundDate = new Date();
  payment.refundAdminFee = adminFee;
  payment.refundDeductions = deductions;
  payment.refundNotes = notes.join(" | ");
  await payment.save();

  await sendEmail(
    user.email,
    "Refund Processed - Elevator Video Pitch©",
    refundProcessedTemplate(user.name)
  );

  res.status(200).json({
    success: true,
    message: "Refund processed successfully",
    data: {
      refundTransactionId: refundResponse.id,
      status: refundResponse.status,
      refundAmount,
      deductions,
      adminFee,
      payment,
    },
  });
});
