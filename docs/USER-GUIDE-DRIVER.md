# TruckOpti Driver Guide

This guide is for truck drivers using the TruckOpti driver app on a phone.

You can do everything from your phone browser. You need:

- A mobile number.
- Your PAN card.
- Your driving licence and vehicle RC.
- A bank account for payouts.
- Internet on your phone.

The driver app has four tabs at the bottom: **Home**, **Trips** (यात्राएं), **Earnings** (कमाई) and **Profile** (प्रोफाइल).
Source: `frontend/src/layouts/DriverLayout.tsx`

---

## 1. Register as a driver

Open the app and go to Driver Registration (`/driver/register`).

You must log in first. Driver applications are linked to your login account. Tap **Continue To Driver Login** if you are not logged in.
Source: `frontend/src/pages/DriverRegisterPage.tsx`

Registration has three steps.

### Step 1 — Personal Details

- Full name, as printed on your Aadhaar card.
- Mobile number, 10 digits.
- Last 4 digits of your Aadhaar, optional.
- PAN number, required. Example: `ABCDE1234F`.
- Home city, for example Mumbai.

### Step 2 — Vehicle Details

- Select your vehicle type. The options are:
  - Tata 407 (1 ton)
  - Eicher 14ft (3 ton)
  - Eicher 17ft (5 ton)
  - Ashok Leyland 19ft (7 ton)
  - BharatBenz 24ft (10 ton)
  - BharatBenz 32ft (15 ton)
- RC number, for example `MH01AB1234`.
- Driving licence number.
- Photo of your driving licence.
- Photo of your vehicle RC.

Take clear photos. Keep all four corners of the document in the frame.

### Step 3 — Payment Details

- Bank account number, required.
- IFSC code, required. Example: `SBIN0001234`.
- UPI ID, optional.

Your payouts go to this account.

Tap **Submit Application**. Your application status becomes **pending**. The app says the team reviews details within 24 to 48 hours and will inform you on your mobile number.
Source: `frontend/src/pages/DriverRegisterPage.tsx`

---

## 2. Complete your KYC documents

After registering, upload four documents. Open **Profile → Documents & KYC** (`/driver/kyc`).

The four documents are:

1. **RC Book** — chassis and engine numbers must be readable.
2. **Driving License** — commercial heavy vehicle licence. The expiry date must be visible.
3. **Aadhaar, combined** — front and back side in one clear photo. The 12-digit number must be readable.
4. **Truck Photo** — the full truck in frame. The number plate must be clearly visible.

Source: `frontend/src/services/driverKycDocuments.ts`, `frontend/src/pages/DriverKycPage.tsx`

Rules for uploads:

- File types: JPEG, PNG, WebP or PDF.
- Maximum size: 5 MB per file.
- Upload the original document only. No photocopies.
- Use even lighting. No glare.

Each document shows one status:

- **Pending** — not uploaded yet.
- **Uploading** — the file is being sent.
- **Pending review** — our verification team is checking it.
- **Review Needed** — rejected. The reason is shown. Tap **Re-upload** and send a better photo.
- **Accepted** — approved. No action needed.
- **Upload failed** — tap **Try again**.

When all four are ready, tap **Submit for verification**. The app says verification usually completes within 24 hours. The page also states that jobs unlock only after all four documents are accepted.
Source: `frontend/src/pages/DriverKycPage.tsx`

You can replace a document any time before it is accepted. After all four are accepted, your KYC is locked and becomes read-only.

You must be online to upload. The page shows a warning if your internet is off.

---

## 3. Wait for approval

Your application is checked by the admin team. On Home, your status shows as one of:

- **Verification Pending** — still under review.
- **Verified** — approved. You can go online and receive jobs.
- **Application Rejected** — contact support to resolve.
- **Account Suspended** — contact support.

Source: `frontend/src/pages/DriverDashboardPage.tsx`

---

## 4. Go online

When your status is Verified, Home shows an **Online/Offline** switch.

- Tap the switch to go online. It turns green and shows **Online**.
- Online means customers can see you and you can receive job offers.
- Tap again to go offline. You will not get offers while offline.

Source: `frontend/src/pages/DriverDashboardPage.tsx`

Keep the app open while you wait. Home shows **Looking for jobs...** when you are online and free.

---

## 5. Receive and accept a job offer

When a customer books a load for your truck, a job offer pops up from the bottom of the screen.

The offer card shows:

- Pickup location.
- Drop location.
- Load weight in kg.
- Estimated fare in rupees.
- A countdown timer.

Source: `frontend/src/pages/DriverDashboardPage.tsx`

You have two choices:

- **Accept** — the job becomes your active trip. The app opens the trip page.
- **Decline** — the offer closes. You stay available for the next offer.

Decide quickly. The timer counts down and the offer expires when it reaches zero. The timer turns red when only 10 seconds remain.

If you accept by mistake or lose internet, the pending offer reappears when you open the app again.

You can hold only one active job at a time.

---

## 6. Do the trip, step by step

Open the active trip from Home (**View Trip**) or directly after accepting (`/driver/trip/:jobId`).

The trip has seven steps, shown as a progress bar at the top.

Source: `frontend/src/pages/DriverTripPage.tsx`

### Step 1 — Navigate to pickup

- Check the pickup address on the shipment card.
- Tap **Open in Google Maps** for directions.
- When you reach, tap **Arrived at Pickup**.

### Step 2 — Pickup OTP

- Ask the sender for the 4-digit OTP shown in their TruckOpti app.
- Type the 4 digits.
- Tap **Verify OTP**.

### Step 3 — Loading photo

- Tap **Take Photo** and photograph the goods being loaded.
- This photo protects you in case of disputes.
- The loading photo is required. You cannot start the journey without it.
- Tap **Start Journey**.

### Step 4 — In transit

- Your live GPS location is shared with the customer.
- Keep GPS on and allow location permission for the app.
- The page shows the GPS status and the time of the last location sync.
- Tap **Navigate to Destination** for directions.
- When you reach, tap **Arrived at Destination**.

### Step 5 — Delivery OTP

- Ask the recipient for their 4-digit OTP.
- Type the 4 digits.
- Tap **Verify OTP**.

### Step 6 — Proof of delivery photo

- Tap **Take Photo** and photograph the delivered goods.
- This photo is your proof of delivery. It is required.
- Tap **Complete Delivery**.

### Step 7 — Done

The app confirms **Delivery Complete**. The trip amount is added to your wallet, and you return to Home.

### OTP rules

Both OTPs are 4 digits. This is enforced by the app and the database.
Source: `frontend/src/services/jobOfferOtpContract.test.ts`, `supabase/migrations/20261004000000_trip_transition_integrity.sql`

- You get up to 5 attempts per OTP.
- After a wrong OTP, the app shows how many attempts remain.
- After 5 wrong attempts, the OTP locks for 15 minutes.
- Source: `frontend/src/services/driverTripProgress.ts`

If the customer's OTP does not work, call support from the trip page.

---

## 7. Check your earnings

Open the **Earnings** tab (`/driver/earnings`).

Choose a period: **This Week**, **This Month** or **All Time**.

Source: `frontend/src/pages/DriverEarningsPage.tsx`

You will see:

- **Wallet Balance** — money available to withdraw now.
- **Earnings** — total fare of delivered trips in the selected period.
- **Trips Completed** — delivered trips in the period.
- **In Process** — withdrawal requests that are pending or approved.
- **Withdrawn** — payouts already paid to you.
- **Per-Trip Earnings** — each delivered trip with its route and fare.
- **Daily Summary** — trips and earnings grouped by date.

The wallet counts the fare of every delivered trip. Money already requested for withdrawal is reduced from the balance.

### Withdraw money

- Tap **Withdraw** on the Earnings page or **Request Withdrawal** on Home.
- Enter an amount. It cannot be more than your balance.
- Tap **Submit Request**.

The request is reviewed manually. The app says it usually settles within 1 to 2 business days. Each request shows a status: **Pending**, **Approved**, **Paid** or **Rejected**.
Source: `frontend/src/pages/DriverEarningsPage.tsx`, `frontend/src/pages/DriverDashboardPage.tsx`

### Export your statement

On the Earnings page, tap **CSV**, **XLSX** or **JSON** to download your trip earnings for the selected period.

---

## 8. See your trip history

Open the **Trips** tab (`/driver/history`).

Every job offer you received is listed here. Filter by **All**, **delivered** or **declined**.

Each trip card shows:

- Pickup and drop locations.
- Load weight.
- Estimated fare.
- Date and time of the offer.
- Status: **Completed**, **Accepted**, **Declined**, **Expired** or **Cancelled**.

Source: `frontend/src/pages/DriverHistoryPage.tsx`

---

## 9. Your profile

Open the **Profile** tab (`/driver/profile`).

Here you can check:

- Your name, vehicle and city.
- Your document links — driving licence, RC book and more.
- The **Documents & KYC** card with your current KYC status.

Tap **Sign Out** at the bottom of the menu to log out.

Source: `frontend/src/pages/DriverProfilePage.tsx`, `frontend/src/layouts/DriverLayout.tsx`

---

## 10. Common problems

- **Cannot upload KYC documents** — check your internet. Uploads need a working connection. Large files over 5 MB are rejected.
- **No job offers coming** — check three things: your status is Verified, you are Online, and all four KYC documents are accepted.
- **OTP not accepted** — confirm the 4 digits with the sender or recipient. Do not guess. Five wrong attempts lock the OTP for 15 minutes.
- **GPS not working** — allow location permission for the app in your phone settings and keep GPS on.
- **App seems stuck** — pull the page to refresh or close and reopen the app. Pending offers and active trips are restored from the server.

For any other problem, tap the **Support** button on Home or on the trip page to call support.

---

## Where these features live

| Feature | Route | Source file |
| --- | --- | --- |
| Driver registration | `/driver/register` | `frontend/src/pages/DriverRegisterPage.tsx` |
| KYC documents | `/driver/kyc` | `frontend/src/pages/DriverKycPage.tsx` |
| Home, online toggle, job offers | `/driver/dashboard` | `frontend/src/pages/DriverDashboardPage.tsx` |
| Active trip, OTPs, photos | `/driver/trip/:jobId` | `frontend/src/pages/DriverTripPage.tsx` |
| Earnings and withdrawal | `/driver/earnings` | `frontend/src/pages/DriverEarningsPage.tsx` |
| Trip history | `/driver/history` | `frontend/src/pages/DriverHistoryPage.tsx` |
| Profile | `/driver/profile` | `frontend/src/pages/DriverProfilePage.tsx` |

Routes are defined in `frontend/src/App.tsx`.
