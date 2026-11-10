# Wustaad POS

Billing and order app for the outlet. It runs on an Android tablet (or any browser) and keeps its data in Supabase.

**What it does**

- **Billing:** tap menu items, choose Dine-in (with table no.), Takeaway or Online (Swiggy / Zomato / Website / Phone), discount, Cash / UPI / Card.
- **GST:** CGST + SGST worked out on every bill. Bill numbers follow GST rules (`WS/2627/00001`, consecutive, restarting every 1 April). Swiggy/Zomato orders get no GST because the platform pays it (Sec 9(5)).
- **Token numbers:** every order gets a token that restarts each day (at 4 AM by default, so late-night orders don't reset at midnight). It's printed big on the bill.
- **Token screen:** open `#/display` on a TV or spare tablet. It shows *Preparing* and *Ready — please collect*, with a chime when an order is ready. No login needed.
- **Orders board:** Preparing → Ready → Picked up, updating live on every device. Reprint, kitchen ticket (KOT) and cancel-with-reason are here too.
- **Rewards by mobile number:** each bill with a mobile number counts as a visit (max one per day). Rules like "every 5th visit → free Double Ka Meetha" are set by the admin. When a reward is due, the billing screen shows a **Give free** button and the item goes on the bill at ₹0. The bill prints *"Visit #3 – 2 more visits for a FREE …"*.
- **Customer rewards page:** `#/rewards` lets customers check their visits and rewards with their number.
- **Thermal printing:** 80 mm or 58 mm ESC/POS printers, via the RawBT Android app, Bluetooth, or the normal print dialog.
- **Works offline:** if the internet drops, billing continues. Bills are stored on the tablet with tokens 901, 902… and synced automatically when the internet comes back, with no duplicates.
- **Admin:** sales reports (by day, hour, order type, payment mode; top items; GST totals; cancelled bills), the full bills list with CSV export for your CA, menu (prices, sold-out toggle), reward rules, customers, staff and shop settings.
- **Roles:** *Cashier* can bill, manage orders, see today's and yesterday's bills, and cancel a bill within 15 minutes. *Admin* can do everything. These rules are enforced in the database, not just in the app.

---

## Try it without Supabase (demo)

Needs Node.js 20.19 or newer.

```bash
npm install
npm run demo
```

Open the address it prints. Log in as `owner@demo.in` (admin) or `cashier@demo.in` (cashier) with any password. Demo data is stored only in that browser.

## Set up for real

### 1. Supabase project
1. Create a free project at [supabase.com](https://supabase.com) and pick the **Mumbai (ap-south-1)** region.
2. Open **SQL Editor → New query**, paste all of `supabase/schema.sql` and click **Run**.
3. Do the same with `supabase/seed.sql` for a sample menu and two reward rules. Edit the prices later in the app.

### 2. The owner (admin) login
1. **Authentication → Users → Add user → Create new user**: your email and a password. Tick **Auto Confirm User**.
2. In the SQL Editor, run this with your email and name:
   ```sql
   insert into public.staff (user_id, name, role)
   select id, 'Pritesh', 'admin' from auth.users where email = 'you@example.com';
   ```
3. Add cashiers the same way: create the login in Supabase, then go to **Admin → Staff** in the app.
4. Recommended: in the Authentication settings, turn off **Allow new users to sign up**, so only logins you create can get in.

### 3. Connect the app
```bash
cp .env.example .env      # then fill in the URL and anon key from Project Settings → API
npm install
npm run dev
```

### 4. Put it online and install it on the tablet
The app must be on **https** for offline mode and Bluetooth to work. Any free static host works.

- **Vercel / Netlify / Cloudflare Pages:** import the repo. Build command `npm run build`, output folder `dist`. Add the two `VITE_…` variables in the host's settings.
- On the tablet, open the site in **Chrome → ⋮ → Add to Home screen**. It then opens full-screen like an app.

Then fill in **Admin → Settings**: shop name, address, GSTIN, FSSAI, GST rate, bill prefix.

### 5. Printer (set once per tablet, in **Printer**)
- **Recommended:** install **RawBT** from the Play Store, connect the thermal printer inside RawBT (Bluetooth / USB / Wi-Fi), then choose *Android tablet + RawBT app*.
- **Bluetooth (BLE) printers:** choose *Bluetooth printer directly* and tap *Pair printer*. You need to pair again after the app restarts.
- **Counter PC:** choose *Normal print dialog*. Set paper size to 80 mm and margins to none.
- Tap **Print a test bill**. Turn on *Also print a kitchen ticket (KOT)* if the kitchen needs one.
- If Android blocks the automatic print, tap **🖨 Print bill** in the popup after placing the order.

### 6. Token screen and rewards link
- On the TV/display tablet, open `https://your-site/#/display` and tap **🔔 Tap for sound + full screen**.
- Print a QR code of `https://your-site/#/rewards` at the counter so customers can check their visits.

---

## How the numbers work

| What | Rule |
|---|---|
| Token | 1, 2, 3… restarts every business day (Settings → *New day at*, default 4 AM). Offline bills use 901, 902… |
| Bill number | `PREFIX/FY/00001`, e.g. `WS/2627/00042`. Consecutive, restarts on 1 April. Cancelled bills keep their number and are marked cancelled, as GST requires. |
| GST | Default 5% (2.5% CGST + 2.5% SGST). Menu prices are *before* GST unless you tick *Menu prices already include GST*. Totals are rounded to the rupee. Confirm the rate with your CA. |
| Visits | One per customer per business day. Cancelling a bill gives back the visit and any reward used on it. |
| Rewards | Earned = visits ÷ rule's visit count (or just once if the rule doesn't repeat). Available = earned − already used. A customer can use the reward on the visit that unlocks it. |
| Prices | The database always takes prices from the menu table, so a tampered tablet can't bill at a different price. |

## Things to know

- **Swiggy/Zomato orders are entered by hand.** Choose *Online → Swiggy/Zomato* so they show up in sales and on the kitchen board (they're kept off the customer token screen). Pulling orders in automatically needs an integration partner such as UrbanPiper, which is paid and needs their approval.
- **The rewards page has no OTP.** Anyone who types a number sees its visit count and rewards, but never the name. Adding OTP needs an SMS provider (e.g. MSG91), which costs money per SMS.
- **Customer privacy (DPDP Act):** tell customers you're saving their number for rewards. To remove someone on request, use **Admin → Customers → Delete**.
- **Supabase free plan:** projects pause after 7 days with no activity, and there are no automatic backups. Use **Admin → Reports → Export CSV** regularly, or move to the Pro plan once the shop is running.

## Project layout

```
supabase/schema.sql      tables, security rules, and all billing logic (tokens, GST, rewards, reports)
supabase/seed.sql        sample menu + reward rules
src/lib/realApi.js       every call to Supabase
src/lib/mockApi.js       in-browser copy of the backend for `npm run demo`
src/lib/offline.js       offline bill queue + sync
src/print/               bill/KOT layout, ESC/POS bytes, printer connections
src/pages/               POS, Orders, Display, RewardsCheck, PrinterSettings, admin/*
public/                  app icon, manifest, service worker (offline)
```
