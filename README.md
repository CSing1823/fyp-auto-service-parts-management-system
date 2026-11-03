# FYP Workshop Management System

Web-based workshop management system for customers, vehicles, enquiries, reminders, inventory usage, and staff authentication.

## Requirements

- Node.js
- MongoDB database connection string

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local `.env` file using `.env.example` as a guide.

3. Start the Express backend in a terminal:

   ```bash
   npm start
   ```

4. Open `public/index.html` with VS Code Live Server. The workspace Live Server setting serves `public/` at the frontend root on port `5501`.
5. Leave the backend running separately on port `3000` while using the frontend.

## Staff User

Seed a staff user with:

```bash
npm run seed-staff -- staff@email.com password "Staff Name" "Role"
```

Make sure `MONGODB_URI` is set before running the seed command.

## SMS Reminder Scheduling

In local development, the Express server processes due SMS reminders after MongoDB connects, then checks again every hour by default. Set `SMS_REMINDER_CHECK_INTERVAL_MS` in the local `.env` to override the interval. When Mocean is not configured locally, the existing mock SMS behavior is used.

In Vercel Production and Preview, the server does not start a persistent reminder interval. Locally, `setInterval()` remains enabled when Vercel runtime indicators are absent and `NODE_ENV` is not `production`. Configure an external scheduler to send an hourly `POST` request to:

```text
/api/cron/sms-reminders
```

The request must include `Authorization: Bearer <CRON_SECRET>`. Keep `CRON_SECRET` only in server-side environment settings (including Vercel Production); never put it in frontend JavaScript. The endpoint returns processing counts plus `remainingCount` and `hasMore`; it processes no more than 25 reminders per call. It uses the same reminder processor as local scheduling and the protected staff processing action.

Configure these server environment variables for Vercel Production:

- `MONGODB_URI`
- `MOCEAN_API_TOKEN`
- `MOCEAN_FROM`
- `CRON_SECRET`
- `SMS_REMINDER_CHECK_INTERVAL_MS` is used only by the local interval; the production scheduler controls its cadence.

SMS states are stored on each service record. `Sent` means Mocean accepted the submission, not that the handset received it. Definite provider failures become `Failed` and can be retried manually by staff. Network timeouts or interrupted outcomes become `Unknown` and are not automatically retried, to avoid sending a possible duplicate. Review an Unknown attempt with the provider before taking any manual action.

## Explicit Database Migrations

Normal server startup does not run database migrations. They are preserved as an explicit maintenance command and require an additional confirmation flag:

```bash
npm run migrate -- --confirm
```

Do not run this command against Production until all of the following are complete:

1. Take and verify a restorable MongoDB Atlas backup or snapshot.
2. Run the command against a restored staging copy first.
3. Confirm the intended `MONGODB_URI` is configured in the command environment without printing it in logs or sharing it.
4. Record collection counts and representative records before the run.
5. After the run, verify counts, sample records, and the customer, vehicle/service, and inventory workflows before allowing normal writes.

The migration functions can rename `customers` to `Customers` or copy records between those collections; rewrite up to 500 `Customers` records into the customer payload shape; create `Vehicles&Services` and copy up to 1,000 legacy `oilServiceRecords`; and rename `partsUsageLogs` to `InventoryUsage` or replace matching IDs while copying. Review the current migration functions and backup before every execution, because these operations can replace or move collection data.

The automatic reminder date boundary remains unchanged: automatic processing and staff retry require `reminderDate <= today <= nextOilServiceDueDate`. A Failed reminder outside that date window cannot be retried through the normal Retry action. If the business needs a later resend, use a separate staff-authorized override that confirms the vehicle still has no newer service record and explicitly rechecks the provider outcome; do not silently widen the automatic scheduler's eligibility. A reminder with a newer service record is marked `Superseded` and is not sent.
