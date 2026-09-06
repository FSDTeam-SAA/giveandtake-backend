import { paymentInfo } from '../models/paymentInfo.model'
import { IPaymentInfo, PaymentStatus } from '../interface/paymentInfo.interface'
import { computeExpiryFromStart } from './subscription'
import { sendEmail } from './sendEmail'

const NO_REPLY_EMAIL = process.env.NO_REPLY_EMAIL || 'no-reply@evpitch.com'

const AUDIENCE_FROM_EMAIL: Record<string, string> = {
  candidate: process.env.CANDIDATE_EMAIL_FROM || 'noreplycandidate@evpitch.com',
  recruiter: process.env.RECRUITER_EMAIL_FROM || 'noreplyrecruiter@evpitch.com',
  company: process.env.COMPANY_EMAIL_FROM || 'noreplycompany@evpitch.com',
}

export const resolveSenderForAudience = (audience?: string | null) =>
  AUDIENCE_FROM_EMAIL[(audience || '').toLowerCase()] || NO_REPLY_EMAIL

/**
 * Receipt email shared by every payment provider so a Stripe receipt is
 * byte-for-byte the same as a PayPal one apart from the transaction id.
 */
export const buildReceiptEmailHtml = ({
  userName,
  transactionId,
  createdAt,
  amount,
  isYearlyPlan,
  isJobPackage = false,
}: {
  userName: string
  transactionId: string
  createdAt: Date | string | undefined
  amount: number
  isYearlyPlan: boolean
  isJobPackage?: boolean
}) => `<!doctype html>
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
                Dear <strong>${userName}</strong>,
              </p>
              <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5;">
                Thanks for choosing to upgrade your plan with <strong>Elevator Video Pitch©</strong>! Below is a copy of your receipt. You can also download this from your personal account panel.
              </p>

              <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5;">
                ${isJobPackage ? 'Your job post credits never expire. Use them whenever you need, with no monthly or yearly posting limits. Refunds are available within 30 days of payment, less $99.99 per job posted and a 10% administration fee on the remaining balance.' : 'As you have paid for a subscription plan, you are now entitled to upload a 60-second elevator video pitch to your profile.'}
              </p>
              ${
                isYearlyPlan
                  ? `<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5;">
                Because you have purchased our yearly plan, you are also entitled to a full Elevator Video Pitch review and full Resume/CV review and redraft.
              </p>
              <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5;">
                Please send your CV/Resume to <a href="mailto:admin@evpitch.com" style="color:#2B7FD0;text-decoration:none;">Admin@evpitch.com</a> and we will revert with a polished new CV within 5 working days.
              </p>
              <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5;">
                Please remove your personal contact information including your phone number (and address if you have this on your CV) before sending us your CV. We look forward to hearing good news about your new role!
              </p>
              <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5;">
                Please bookmark <a href="mailto:admin@evpitch.com" style="color:#2B7FD0;text-decoration:none;">admin@evpitch.com</a> to ensure you receive your redrafted CV.
              </p>`
                  : ''
              }

              <!-- Receipt card -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e6eef6;border-radius:6px;">
                <tr>
                  <td style="padding:16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:13px;color:#6b7280;vertical-align:top;padding-bottom:8px;">Invoice #</td>
                        <td style="font-size:14px;color:#111;vertical-align:top;padding-bottom:8px;text-align:right;"><strong>${transactionId}</strong></td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#6b7280;vertical-align:top;padding-bottom:8px;">Date</td>
                        <td style="font-size:14px;color:#111;vertical-align:top;padding-bottom:8px;text-align:right;">${createdAt}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#6b7280;vertical-align:top;padding-bottom:8px;">Amount</td>
                        <td style="font-size:14px;color:#111;vertical-align:top;padding-bottom:8px;text-align:right;"><strong>${amount.toFixed(
                          2
                        )}</strong></td>
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
`

/**
 * Persists a completed/pending/failed subscription payment and emails the
 * receipt when it completed. Shared by the PayPal capture and Stripe confirm
 * flows so both produce identical subscription state (duration + expiry).
 */
export const recordAndNotifyPayment = async ({
  user,
  plan,
  amount,
  paymentStatus,
  transactionId,
  paymentMethod,
  seasonId,
}: {
  user: { _id: unknown; name: string; email: string; role?: string }
  plan: { _id: unknown; for?: string; valid?: string; jobPostCredits?: number | null }
  amount: number
  paymentStatus: PaymentStatus
  transactionId: string
  paymentMethod: string
  seasonId?: string
}): Promise<IPaymentInfo> => {
  const existing = await paymentInfo.findOne({ transactionId })
  if (existing) return existing
  const audience = (plan.for || user.role || '').toLowerCase()
  if (plan.valid === 'credits' && plan.jobPostCredits !== null && (!Number.isSafeInteger(plan.jobPostCredits) || (plan.jobPostCredits ?? 0) <= 0)) {
    throw new Error('The purchased job package has no valid credit allocation')
  }
  const planValidity = (plan.valid || '').toLowerCase()
  const derivedDuration =
    planValidity === 'credits' ? 'credits' : planValidity === 'monthly'
      ? 'monthly'
      : planValidity === 'yearly'
      ? 'yearly'
      : 'payg'

  const isYearlyPlan = derivedDuration === 'yearly'
  const expiresAt =
    computeExpiryFromStart(new Date(), derivedDuration) ?? undefined

  let newPayment: IPaymentInfo
  try {
  newPayment = await paymentInfo.create({
    userId: user._id,
    planId: plan._id,
    amount,
    paymentStatus,
    transactionId,
    paymentMethod,
    seasonId,
    duration: derivedDuration,
    ...(derivedDuration === 'credits' ? { jobPostCredits: plan.jobPostCredits, jobPostsUsed: 0 } : {}),
    expiresAt,
  })
  } catch (error: any) {
    if (error?.code !== 11000) throw error
    const duplicate = await paymentInfo.findOne({ transactionId })
    if (!duplicate) throw error
    return duplicate
  }

  if (paymentStatus === 'complete') {
    const emailBody = buildReceiptEmailHtml({
      userName: user.name,
      transactionId: newPayment.transactionId,
      createdAt: newPayment.createdAt,
      amount,
      isYearlyPlan,
      isJobPackage: derivedDuration === 'credits',
    })

    try {
      await sendEmail(user.email, 'Payment Complete', emailBody, {
        from: resolveSenderForAudience(audience),
        includeLegalFooter: true,
      })
    } catch (emailError) {
      // The money already moved — a receipt failure must not fail the request.
      console.error('[payment] Failed to send receipt email:', emailError)
    }
  }

  return newPayment
}
