import { Request, Response, NextFunction } from "express";
import { paymentInfo } from "../models/paymentInfo.model";
import catchAsync from "../utils/catchAsync";
import { SubscriptionPlan } from "../models/subscriptionPlan.model";
import { User } from "../models/user.model";
import { createOrder, captureOrder } from "../services/paypal.service";
import { buildMetaPagination, getPaginationParams } from "../utils/pagination";
import { sendEmail } from "../utils/sendEmail";
import AppError from "../errors/AppError";

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

/****************************
 * PAYPAL CAPTUREPAYPALPAYMENT *
 ****************************/
export const capturePaypalPayment = async (req: Request, res: Response) => {
  try {
    const { orderId, userId, planId, seasonId } = req.body;
    const capture = await captureOrder(orderId);
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError(400, "User not found");
    }

    const captureDetails = capture.purchase_units[0].payments.captures[0];

    const newPayment = await paymentInfo.create({
      userId,
      planId,
      amount: captureDetails.amount.value,
      paymentStatus: mapPaypalStatusToEnum(captureDetails.status),
      transactionId: captureDetails.id,
      paymentMethod: "PayPal",
      seasonId,
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
                    <h1 style="margin:0;font-size:20px;color:#111;">Elevator Video Pitch© Ltd</h1>
                    <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Payment Receipt</p>
                  </td>
                  <td style="text-align:right;vertical-align:middle;">
                    <!-- Optional logo or emoji -->
                    <div style="width:56px;height:56px;border-radius:8px;background:#2B7FD0;display:inline-block;line-height:56px;text-align:center;color:#fff;font-weight:bold;">
                      EVP
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
                Thanks for choosing to upgrade your plan with <strong>Elevator Video Pitch© Ltd</strong>! Below is a copy of your receipt. You can also download this from your Account pannel.
              </p>

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
                        <td style="font-size:14px;color:#111;vertical-align:top;padding-bottom:8px;text-align:right;"><strong>${captureDetails.amount.value}</strong></td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Support -->
              <p style="margin:18px 0 6px;font-size:14px;color:#374151;">
                Please reach out to <a href="mailto:Admin@evpitch.com" style="color:#2B7FD0;text-decoration:none;">Admin@evpitch.com</a> if you have any queries.
              </p>

              <p style="margin:8px 0 0;font-size:14px;color:#374151;">
                Best regards,<br>
                <strong>Admin</strong><br>
                Elevator Video Pitch© Ltd
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;background:#fafafa;border-top:1px solid #eef0f2;text-align:center;font-size:12px;color:#9ca3af;">
              <div style="max-width:520px;margin:0 auto;">
                <p style="margin:0 0 8px;">Elevator Video Pitch© Ltd</p>
                <p style="margin:0;">If you did not make this purchase or need help, reply to this email or contact <a href="mailto:Admin@evpitch.com" style="color:#2B7FD0;text-decoration:none;">Admin@evpitch.com</a></p>
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

    console.log(captureDetails);

    if (captureDetails.status === "COMPLETED") {
      console.log("ami hoisi");
      await sendEmail(user.email, "Payment Complete", emailBody);
      console.log("email sent");
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
