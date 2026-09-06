Job packages rollout
====================

This change covers the backend, public website and admin website. Flutter is unchanged.

The catalogue in `src/utils/jobPackagePolicy.ts` contains the ten requested prices and allocations for both companies and recruiters. Purchases use `duration: credits`, with a purchased allocation and a durable usage counter. `null` means unlimited. Credits do not expire, and purchases accumulate. Job creation and credit consumption run in one MongoDB transaction. Refunded purchases cannot supply credits.

Refunds must be requested no later than 30 days from the original payment timestamp. Each post charged to that purchase costs $99.99, including posts subsequently deleted. The existing administration fee remains 10% of the balance after job deductions, rounded to cents. No positive balance means no refund. Admin Payment Details displays usage, deadline, eligibility, deductions and fee. Candidate refund rules remain unchanged.

Deployment
----------

1. Use a maintenance window to pause purchases, job creation and expiry jobs. Back up the subscription plans and payment collections. MongoDB must support transactions (replica set or Atlas).
2. Build/deploy the backend with `JOB_POST_PAYWALL_ENABLED=true` (the local `.env` has been updated). Run `npm run migrate-job-packages` to preview the configured database. It does not create indexes or write data in preview mode.
3. Review the preview, then run `npm run migrate-job-packages -- --apply`. This converts existing purchased allocations before updating prices, creates missing packages, archives duplicate catalogue rows, and replaces PAYG catalogue entries with the requested packages. Existing PAYG purchases become one non-expiring credit. Run again safely if an interrupted migration needs completing.
4. Deploy the public and admin websites together with the backend/data change. Verify `/company-pricing`, `/recruiter-pricing`, admin `/plan`, and `/payment-details`, then resume traffic and scheduled jobs.

Existing purchases retain their recorded amount, original purchase timestamp and active/deactivated status. Monthly purchases retain the recorded monthly allowance; annual purchases retain the annual allocation. Plans advertised as unlimited become truly unlimited. Deactivated purchases are not automatically reactivated, since the old data does not distinguish expiry from manual deactivation.

Historical limitation: usage can only be reconstructed from remaining jobs with a `billingPlanId`. Jobs deleted before this rollout or older jobs without a purchase reference need reconciliation from a backup/audit source. The new durable counter prevents this loss for future posts. Do not assume a zero reconstructed count proves an old purchase was unused.

Refunds use a per-payment lock to prevent concurrent posts/refunds. If a payment provider times out after a refund attempt, its lock remains in place and admin shows “awaiting reconciliation”. Check the provider's transaction before clearing the lock; do not blindly retry a potentially completed refund.

Validation
----------

`npm test` covers the exact ten allocations/prices, non-expiry after six months, candidate expiry, refund deductions, zero balances, and the exact 30-day boundary. Run `npm run build` for backend compilation. Admin and website use `node node_modules/typescript/bin/tsc --noEmit --incremental false`.

Payment-provider integration and concurrent MongoDB transactions still need a staging checkout/post/refund smoke test. No real payment or refund is performed by these tests or the migration.
