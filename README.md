# S.A Computers — Stock prototype

A working prototype of a stock system for **S.A Computers, RT Nagar, Bengaluru**:
used laptops and desktops, bulk orders for buyers like Cashify, and walk-in shop sales.

## Run it

```bash
npm install
npm run dev        # open http://localhost:3000
```

Deploy: push this folder to GitHub and import it on vercel.com (no settings needed).

## What's inside

| Screen | What it does |
| --- | --- |
| Home | Machines ready to sell, where all stock is, money in the last 30 days, what needs attention |
| All machines | Every machine by serial — search, filter, scan, download to Excel, full history per machine |
| Ready stock | Ready machines by spec × grade, plus "A buyer is asking — can you fill it?" |
| Check & grade | Test → battery → upgrade → grade → wipe. Opens the next machine automatically |
| Add stock | New purchase batch from an Excel sheet (any column order) or by scanning serials |
| Big orders | Auto-picks the right machines (closest spec, oldest stock first), books them, Excel serial list, dispatch |
| Shop sale | Sells one machine, blocks machines booked for big orders, prints a warranty slip |
| Batches | Money back, profit so far and expected profit for every purchase batch |

## Prototype notes

- All data is sample data (~1,300 machines), saved in the browser. "Reset demo data" in the sidebar restores it.
- `src/lib/data/` is the only layer that changes when this moves to a real database (Supabase).
  Screens only talk to `store.ts` and `selectors.ts`.

## 8-minute demo script

1. **Home** — "398 machines ready to sell", stock split by shop/godown, profit last 30 days.
2. **Add stock** → "Download a sample sheet (200 machines)" → upload it → Add → lands in Check & grade.
3. **Check & grade** → open a machine → battery 85% → Grade A → wiped → Mark ready. Next one opens by itself.
4. **Ready stock** → "120 × i5 8th gen, 8 GB, 256 GB, Grade A" → "Yes — you have N" → **Book 120 for a buyer** → Book.
5. **Big orders** → download the serial list (Excel).
6. **Shop sale** → type a serial from that order → blocked. Type "T480" → sell → print the warranty slip.
7. **Batches** → which lots made money, which had too much scrap.
8. Close: "Tell me how you do it today and I'll fit it to you."
