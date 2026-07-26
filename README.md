# Stock Ledger auto-sync backend

This makes prices update in the portal with **zero manual steps**, once set
up. No copy/paste, no asking Claude, nothing to click daily.

## How it actually works

- `fetch_prices.py` fetches NSE closing prices via Yahoo Finance (Yahoo
  mirrors NSE and, unlike nseindia.com, doesn't block automated requests).
- A GitHub Action runs that script automatically on a schedule (weekdays,
  ~15 min after market close) and commits the results into
  `data/prices.json` and `data/indices.json` in this repo.
- The portal reads those two files directly from
  `raw.githubusercontent.com` — GitHub's raw file host sends the CORS
  header a browser page needs to read it. That header is the one thing
  nseindia.com will never send to a webpage, which is why nothing before
  this worked automatically.
- Net effect: every weekday afternoon, this repo's data updates itself,
  and the next time you open the portal, it just... has today's prices.

## Set it up (~10 minutes, free, no credit card)

### 1. Create the repo
- On GitHub: **New repository** → name it anything (e.g. `stock-ledger-data`)
  → **Public** (required for the free raw-file CORS access used below) →
  Create.

### 2. Upload these files
Keep the exact folder structure:
```
your-repo/
├── fetch_prices.py
├── requirements.txt
├── .github/workflows/update-prices.yml
└── data/
    ├── prices.json      (start it as literally: {})
    └── indices.json     (start it as literally: {})
```
Easiest way without using git day-to-day: on your repo's GitHub page,
"Add file" → "Upload files", drag in `fetch_prices.py` and
`requirements.txt`. For the `.github/workflows/update-prices.yml` file,
use "Create new file" and type that exact path as the filename — GitHub
will create the folders for you. Same for `data/prices.json` and
`data/indices.json` (create each with just `{}` as the content).

### 3. Turn on Actions and run it once
- Go to the **Actions** tab of your repo → you should see "Update NSE
  prices" listed → click it → **Run workflow** (this is the manual trigger,
  `workflow_dispatch`, so you don't have to wait for the schedule).
- It takes 1-3 minutes. Check the run went green. If it's red, click in —
  the most common cause is a typo in the file paths from step 2.
- After this first run, `data/prices.json` will have real numbers in it.

### 4. Get your raw data URL
It's:
```
https://raw.githubusercontent.com/<your-username>/<your-repo>/main/data
```
(swap in your actual username and repo name; keep `/main/data` as-is
unless you renamed the branch or folder).

### 5. Paste it into the portal
Open the ledger → **Automatic Sync** panel at the top of the Day Book
section → paste that URL in → click **Sync now** once to confirm it
works. From then on, it re-syncs by itself every time you open the page.

## What it actually tracks

The script's watchlist is the same ~510 NSE symbols already searchable in
the portal (Nifty 500 plus recent large IPOs), so anything you can search
for and add as a holding is already being tracked — you don't need to
configure the watchlist per stock.

Sector indices (Nifty Bank, IT, Auto, etc.) are tracked too, for the
Weekly vs. Indices table — see `INDEX_TICKERS` in `fetch_prices.py`. A few
of the newer/less common ones (Smallcap 100, Fin Service, Healthcare,
Consumer Durables, Oil & Gas, Midcap 100, Pvt Bank, Next 50) aren't in
there yet — I wasn't confident enough in their exact Yahoo ticker symbols
to include them without risking silently-wrong data. They'll just show
"—" in the portal until added. Tell me which ones you actually want and
I'll look up and verify the correct ticker for each rather than guess.

## Honest limitations

- **Schedule timing**: GitHub's cron scheduler can run up to ~15-20
  minutes late during high load (rare, but it happens — it's a shared free
  resource, not a guaranteed-to-the-minute clock).
- **GitHub disables schedules after 60 days of zero repo activity.** Since
  this workflow commits to the repo every time it runs, that resets the
  clock automatically — so as long as it's running, it keeps itself alive.
  If you ever pause it for over 2 months, you'll need to manually
  re-enable the schedule from the Actions tab.
- **Market holidays**: the script doesn't know the NSE holiday calendar —
  on a holiday, Yahoo simply won't have a new close, so that day is
  skipped automatically (no bad data written), it just won't add a new
  date until the next trading day.
- **Yahoo, not NSE directly**: prices are Yahoo Finance's numbers, which
  mirror NSE closely but are a secondary source, not the exchange feed
  itself. Fine for tracking returns; not something to reconcile a broker
  contract note against.
