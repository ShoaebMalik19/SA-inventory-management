# S.A Computers — Stock system (v1)

Stock, checking, big orders, shop sales and returns for **S.A Computers, RT Nagar, Bengaluru**.
Used laptops and desktops, tracked one serial number at a time.

## Run it on your laptop (no setup)

```bash
npm install
npm run dev          # open http://localhost:3000
```

The first start creates its own database in `./.data` (a real Postgres engine, embedded) and fills it
with ~1,300 sample machines. Log in with a sample PIN:

| Who | Role | PIN | Lands on |
| --- | --- | --- | --- |
| Shop owner | Owner — everything, staff, settings | 1111 | Home |
| Manager | Everything except staff & settings | 2222 | Home |
| Ravi (technician) | Add stock, check & grade, move, labels | 3333 | Check & grade |
| Salma (counter) | Shop sales, returns, look up stock | 4444 | Shop sale |

The owner changes names and PINs on **Staff**, and can **Reset sample data** from the sidebar.
To start completely fresh, stop the app and delete the `.data` folder.

## Go live (Supabase + Vercel, about 10 minutes, free tiers)

1. **Database** — create a project on supabase.com (region: Mumbai `ap-south-1`).
   Open **Connect → Transaction pooler** and copy the URI (port `6543`). Put the database password in it.
2. **Code** — push this folder to a GitHub repository.
3. **Hosting** — on vercel.com: *Add New → Project →* import the repo. Under *Environment Variables* add
   `DATABASE_URL` = the Supabase URI, and `SESSION_SECRET` = any long random text. Deploy.
4. Open the Vercel link. The first visit creates the tables and the sample data (takes a few seconds).
   Log in as the owner and change all PINs before real staff use it.

You can also create the tables by hand with `supabase/schema.sql` in the Supabase SQL editor.
Row-level security is switched on for every table, so Supabase's public API can't read anything;
only this app's server talks to the database.

## What's inside

| Screen | What it does |
| --- | --- |
| Home | Machines ready to sell, where all stock is, money in and owed, what needs attention (incl. specs running low), who did what |
| All machines | Every machine by serial — search, filter, camera scan, Excel download, tick many to move or label |
| Ready stock | Ready machines by spec × grade, plus "A buyer is asking — can you fill it?" |
| Check & grade | Test → battery → upgrade → grade → wipe. Opens the next machine automatically. Repairs too |
| Add stock | New purchase batch from an Excel sheet (any column order, bad rows flagged) or by scanning serials |
| Big orders | Auto-picks machines (closest spec, oldest stock, no MacBooks), books them, Excel serial list, dispatch — dispatch makes the GST invoice |
| Shop sale | Sells one machine, blocks machines booked for big orders, records cash/UPI/card, prints the GST bill with warranty |
| Invoices | Every bill with FY numbering (SA/26-27/0001), printable A4 GST invoice, serial list annexure, monthly Excel for the accountant |
| Money to collect | What each buyer still owes, overdue first, record payments as they come in |
| Suppliers | What you owe each supplier per purchase batch, due dates, overdue first, record payments you make |
| Import stock | Bring in the stock the shop already has from its own Excel sheet — any column names, with status, grade, location, prices, supplier and date. Shows what it read before saving |
| Returns & warranty | Warranty check by serial, record a return with reason and refund — the machine goes back to checking |
| Labels | Printable labels with a real Code-128 barcode of the serial, for one machine or a whole batch |
| Batches | Money back, profit so far and expected profit for every purchase batch |
| Staff | Add people, set roles and PINs, switch off access |
| Settings | Shop name, address, GSTIN, state, invoice prefix, GST scheme (margin or normal), rate, warranty |

**GST:** second-hand laptops are billed under the margin scheme (Rule 32(5)) by default, so tax is only on the selling price minus the buying price. Prices include GST. Buyers in Karnataka get CGST + SGST; buyers in other states get IGST. The working is shown to owner and manager only and never printed. Ask the shop's accountant to confirm the scheme before the first real bill.

## Starting with the shop's real data

1. Log in as the owner and open **Import stock** (from the banner on Home, or the link on Add stock).
2. **Clear sample data** — type START. Staff, PINs and business settings stay; bill numbers restart at 0001. After this, "Reset sample data" disappears so real data can't be overwritten.
3. Upload the shop's stock sheet. Check the preview (columns read, rows that need fixing, totals) and press **Bring in**.
4. Change the four demo PINs on the Staff page and add the GSTIN in Settings.

## How it's built

```
src/
  app/                    screens (one folder each) + api/snapshot, api/staff
  components/             shared UI: app shell, login, machine panel, scanner, barcode, ui/*
  lib/
    data/types.ts         the data model
    data/selectors.ts     pure business maths (auto-pick, ready stock, batch profit) — used by server and browser
    data/store.ts         browser cache; every change goes through a server action
    roles.ts              who can do what (menu + server checks use the same table)
  server/
    db.ts                 Postgres: DATABASE_URL (Supabase) or embedded PGlite on a laptop
    schema.ts             tables, created automatically
    service.ts            all business rules, one transaction per action
    actions.ts            server actions: check login → check role → run → return what changed
    auth.ts, pin.ts       4-digit PIN login, scrypt-hashed PINs, signed httpOnly session cookie
    repo.ts               reading data; hides costs and profit from technician and counter roles
```

- **Security:** roles are enforced on the server for every change, not just hidden in the menu.
  Technician and counter accounts never receive buying prices, profit or batch costs.
- **Several people at once:** booking an order locks the ready stock, so two people can't book the
  same machine. Screens refresh every 45 seconds and whenever the tab comes back into view.
- **Every change is recorded** in the machine's history and the activity feed, with the staff name.

## Demo script (8 minutes)

1. Log in as **Shop owner** (1111). Home: "N machines ready to sell", stock by stage, profit in 30 days.
2. **Add stock** → "Download a sample sheet (200 machines)" → upload it → Add → lands in Check & grade.
3. **Check & grade** → open a machine → battery 85% → Grade A → wiped → Mark ready. The next one opens by itself.
4. **Ready stock** → "120 × i5 8th gen, 8 GB, 256 GB, Grade A" → **Book 120 for a buyer** → Book.
5. **Big orders** → download the serial list (Excel).
6. On a phone, log in as **Salma (counter)** (4444): type a serial from that order → blocked.
   Sell a T480 → warranty slip. Then **Returns & warranty** → check that serial → record a return.
7. Back as owner: the activity feed shows Salma's sale and return. **Batches** → which lots made money.
8. Close: "Tell me how you do it today and I'll fit it to you."


## Safety: backups, fixing mistakes, history

- **Backups** (owner → *Backups*): a full copy of everything is saved every night at about 3 AM (Vercel cron calling `/api/cron/backup`; set `CRON_SECRET` in Vercel so only Vercel can call it). If a night is missed, the next time anyone opens the app a copy is made. 30 nightly + 15 hand-made copies are kept inside the database. Each copy can be downloaded as a `.json.gz` file and restored later from the list or from the file. A restore saves a "before restore" copy first, and is all-or-nothing.
- **Download everything as Excel**: every machine, batch, sale, bill and payment in one workbook.
- **Fixing mistakes** — every fix is written to the machine's history and to *History* with before → after:
  - *Correct details* on any unsold machine (serial, specs, grade; cost and price for owner/manager).
  - *Undo check* puts a machine back in the queue (technicians: within 30 minutes; also an *Undo* button on the toast right after checking).
  - *Cancel this sale* on a shop bill (owner/manager): the bill keeps its number and gets a credit note `CN/26-27/0001`; the machine goes back to ready stock.
  - *Remove this batch* (owner/manager) while none of its machines have been checked.
- **History** (owner/manager): everything anyone did, filter by person and type, search, never editable.
- **Easy PIN warning**: the owner's Home shows who still uses a starting PIN like 1111.

## Reports

*Reports* (owner/manager): month by month — machines sold, sales, profit, profit per machine (a running month is compared with the same days of last month), week-by-week chart, shop vs big orders, money collected and paid out, GST summary from the bills (with credit notes), best sellers, stock age with the slowest machines, supplier quality (scrap and repair rates), and who did the work. Downloads as Excel.

## On a phone

Add it to the home screen (Chrome: ⋮ → *Add to Home screen*; iPhone Safari: Share → *Add to Home Screen*) — it opens full-screen like an app. Each role gets its own four bottom tabs. Check & grade and Shop sale keep the main button at the bottom where the thumb is; the camera scanner has a torch button; text boxes don't zoom on iPhone; after a sale the bill details can be sent to the customer on WhatsApp.
