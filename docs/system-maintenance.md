# System Maintenance Tasks

This application now performs a number of automated clean-up and compliance jobs. All schedules use server time.

## Daily Midnight Jobs (00:00)

- **Deactivate expired subscriptions** – any `paymentInfo` record whose billing period has elapsed (monthly, yearly, or PAYG) is marked inactive.
- **Notify expiring recruiters/companies** – recruiters and companies receive an in-app notification that reads, “Your job advert recently posted is due to expire shortly. Kindly remember to update each applicant on the final status of their application, using our intuitive one-click feedback tool in your job applicants panel.”
- **Notify expired subscribers** – candidates and other subscribers with lapsed plans receive the notification “Your subscription has expired, please renew or upload a free 30-second elevator pitch video today.”
- **Remove users deactivated for 30+ days** – entries flagged with `deactivate = true` are fully deleted after the retention window.

## Daily Follow-up Jobs (00:01)

- **Remove upgraded elevator pitches after plan expiry** – once a paid elevator pitch plan has been inactive for one full day past its expiry, all associated video artifacts are deleted, the `ElevatorPitch` document is removed, and the owner receives “Your upgraded Elevator Video Pitch© has been removed because your subscription expired. Renew your plan to upload a new video.”
- **Purge job applications 30 days after job deactivation** – when a job has been archived or marked inactive for 30 days, all attached `AppliedJob`/CV submissions are deleted to keep the dataset lean.

## PAYG Advert Restrictions

- Jobs posted under a PAYG plan capture their original publication date and refuse further edits once the 30‑day window has passed. Recruiters/companies attempting to edit or reopen such adverts receive the notification “Your PAYG payment has expired, please subscribe or purchase a new PAYG voucher,” and the API returns a `403` with the same message.
- Deadline or publish-date updates are blocked if they would extend a PAYG advert past the original 30-day allowance.

## Email Change Hygiene

When a user updates their email address via `/user/emailChange`, the system now:

1. Stores the new email on the `User` document and issues a fresh verification token.
2. Propagates the new address to linked collections (`CreateResume`, `Company`, `RecruiterAccount`) so no stale copies of the old email remain.

This ensures that redundant or personally identifiable data is not retained beyond what is necessary for active records.
