# Confluence Signal Tracker

A personal investment research tool that cross-references:
- **SEC Form 4** open-market insider purchases (full US market, no fixed ticker list)
- **USASpending.gov** government contract awards

**Two modes:**
- **Confluence** — contract-first discovery. Fetches large contract awards, resolves each recipient to a ticker via the EDGAR ticker index (canonical, unique on US markets), then checks that ticker for recent Form 4 insider buying. Ticker universe is fully open-ended.
- **Form 4 only** — scans EDGAR for all open-market purchases across the full market. No contract filter.

**Daily alerts** via Vercel Cron + Vercel KV (deduplication) + Resend (email).

> ⚠ Research tool only — not financial advice.

---

## Quick start

```bash
git clone https://github.com/YOUR_USERNAME/confluence-tracker.git
cd confluence-tracker
npm install
npm install -g vercel
vercel login
vercel dev          # runs Vite + API functions together at localhost:3000
```

## Deploy

```bash
# Push to GitHub, then:
vercel --prod
# Or: connect repo in Vercel dashboard → auto-deploys on every push
```

## Project structure

```
api/
  _edgar.js          # EDGAR helpers: ticker index, Form 4 fetching, name→ticker resolution
  _usaspending.js    # USASpending award fetching
  _score.js          # Confluence scoring model (0–100)
  signals.js         # Main signal endpoint (confluence + form4 modes)
  backtest.js        # Historical simulation
  cron.js            # Daily cron: fetch → deduplicate via KV → email alert
  alert-history.js   # Returns cron run history for the Settings tab

src/
  App.jsx                       # Root: mode toggle, tabs, shared state
  components/
    FilterBar.jsx               # Filters (contract filter hidden in form4 mode)
    SignalCard.jsx              # Expandable signal row
    BacktestTab.jsx             # Equity curve + trade log
    ExportTab.jsx               # Watchlist + IBKR/CSV export
    SettingsTab.jsx             # Alert setup guide + cron history
    ScoreRing.jsx               # SVG score ring
  hooks/useData.js              # useSIgnals + useBacktest with debounce/abort
  lib/utils.js                  # Formatting, CSV export
```

## Ticker resolution

Tickers are the canonical unique key on US markets.

The app downloads `https://data.sec.gov/files/company_tickers.json` — the EDGAR index of every
listed US company with their ticker → CIK mapping. This is cached in memory for 1 hour.

**Confluence mode flow:**
1. USASpending returns `"Recipient Name": "Lockheed Martin Corporation"`
2. Name normalisation strips stopwords (Inc, Corp, LLC, Holdings, etc.)
3. Fuzzy match against EDGAR index → resolves to `LMT`
4. CIK for LMT → check `data.sec.gov/submissions/CIK{cik}.json` for recent Form 4s
5. Score and return if both signals present

Because tickers are unique, there's no ambiguity at the resolution step.

## Alert setup (optional)

Requires three things — all have free tiers:

| Service | Purpose | Free tier |
|---------|---------|-----------|
| Vercel KV | Stores seen signal IDs between cron runs | 30MB, 30K req/month |
| Resend | Sends email alerts | 3,000 emails/month |
| Vercel Cron | Runs the daily check | 1 cron job on free plan |

### Steps

1. **Vercel KV**: Dashboard → Storage → Create → KV → connect to project.
   Vercel auto-adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`.

2. **Resend**: Sign up at resend.com → create API key → verify your domain (2 DNS records).
   Add `RESEND_API_KEY` to Vercel env vars.

3. **Env vars** in Vercel → Settings → Environment Variables:
   ```
   ALERT_EMAIL     your@email.com
   CRON_SECRET     any-random-string
   ```

4. **Update `api/cron.js`**: change the `from` address to your verified Resend domain.

5. **Update `vercel.json`**: replace `REPLACE_WITH_YOUR_CRON_SECRET` with your secret.

6. Push to GitHub → deploy → test at `GET /api/cron?secret=YOUR_SECRET`.

The cron runs at 7am UTC daily. Change the schedule in `vercel.json` (standard cron syntax).

## Scoring model

| Factor | Max pts | Notes |
|--------|---------|-------|
| Insider buy size | 35 | Log scale: $50K→15, $500K→25, $5M→35 |
| Cluster bonus | 15 | (n−1) × 7, capped at 15 |
| Contract value | 35 | Log scale, confluence mode only |
| Timing proximity | 15 | Signals within 7d→15pts, 60d→5pts |

Form 4 mode doubles the insider score to fill 0–100.

## IBKR export

Watchlist tab → star signals → Download IBKR watchlist → import in TWS: File → Import → Watchlist.

## Extending

No fixed ticker list to maintain. In confluence mode, any company that wins a US government
contract above your minimum threshold will automatically be checked for insider activity.
