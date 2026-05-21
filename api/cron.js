/**
 * /api/cron.js
 *
 * Vercel Cron Job — runs daily at 7am UTC.
 * Configured in vercel.json under "crons".
 *
 * What it does:
 *  1. Fetches fresh signals (both confluence + form4 modes)
 *  2. Compares against signals seen in the last run (stored in Vercel KV)
 *  3. Sends an email alert via Resend for any new signals above threshold
 *  4. Updates KV with the new signal set
 *
 * Required environment variables (set in Vercel dashboard):
 *   KV_REST_API_URL      — from Vercel KV dashboard
 *   KV_REST_API_TOKEN    — from Vercel KV dashboard
 *   RESEND_API_KEY       — from resend.com (free tier: 3000 emails/month)
 *   ALERT_EMAIL          — your email address to receive alerts
 *   CRON_SECRET          — any random string, used to secure the endpoint
 *
 * Vercel KV free tier: 30MB storage, 30K requests/month — more than enough.
 */

import { kv } from '@vercel/kv'
import { Resend } from 'resend'
import { getTickerIndex, getInsiderActivity, scanAllForm4s } from './_edgar.js'
import { fetchAwards } from './_usaspending.js'
import { resolveTickerFromName } from './_edgar.js'
import { scoreSignal } from './_score.js'

const KV_KEY_SEEN     = 'signals:seen'       // Set of signal IDs seen before
const KV_KEY_LAST_RUN = 'signals:lastrun'    // Timestamp of last cron run
const KV_KEY_HISTORY  = 'signals:history'    // Last N signal snapshots

const ALERT_MIN_SCORE = 50   // Only alert on signals above this score
const HISTORY_MAX     = 30   // Keep last 30 cron run snapshots

// ─────────────────────────────────────────────────────────────────
// Signal ID: deterministic key for deduplication
// ─────────────────────────────────────────────────────────────────
function signalId(signal) {
  // Confluence: ticker + contract date window
  if (signal.mode === 'confluence' && signal.contractDate) {
    const week = signal.contractDate.slice(0, 7) // YYYY-MM
    return `${signal.ticker}:confluence:${week}`
  }
  // Form 4: ticker + filing month
  const month = (signal.insiderLatestDate || '').slice(0, 7)
  return `${signal.ticker}:form4:${month}`
}

// ─────────────────────────────────────────────────────────────────
// Run both signal modes
// ─────────────────────────────────────────────────────────────────
async function fetchAllSignals() {
  const daysBack = 7 // Cron runs daily, look back 7 days for freshness

  const tickerIndex = await getTickerIndex()

  // Confluence signals
  const startDate = new Date(Date.now() - daysBack * 86_400_000).toISOString().slice(0, 10)
  const endDate   = new Date().toISOString().slice(0, 10)

  const [awards, form4Entities] = await Promise.allSettled([
    fetchAwards({ startDate, endDate, minVal: 10_000_000, limit: 100 }),
    scanAllForm4s(daysBack, 100_000),
  ])

  const confluenceSignals = []
  const form4Signals = []

  // --- Confluence ---
  if (awards.status === 'fulfilled') {
    const tickerToAward = {}
    for (const award of awards.value) {
      const ticker = resolveTickerFromName(award['Recipient Name'], tickerIndex)
      if (!ticker) continue
      if (!tickerToAward[ticker] || award['Award Amount'] > tickerToAward[ticker]['Award Amount']) {
        tickerToAward[ticker] = { ...award, resolvedTicker: ticker }
      }
    }

    const chunks = []
    const tickers = Object.keys(tickerToAward)
    for (let i = 0; i < tickers.length; i += 6) chunks.push(tickers.slice(i, i + 6))

    for (const chunk of chunks) {
      const results = await Promise.allSettled(
        chunk.map(async ticker => {
          const entry = tickerIndex[ticker]
          if (!entry) return null
          const insider = await getInsiderActivity(entry.cik, daysBack)
          if (!insider || insider.estimatedBuyTotal < 50_000) return null

          const award = tickerToAward[ticker]
          const daysApart = Math.abs(
            (new Date(award['Start Date'] || Date.now()) - new Date(insider.latestDate || Date.now())) / 86_400_000
          )

          const score = scoreSignal({
            insiderBuyTotal: insider.estimatedBuyTotal,
            insiderCount: insider.filingCount,
            contractValue: award['Award Amount'] || 0,
            daysApart,
            mode: 'confluence',
          })

          if (score < ALERT_MIN_SCORE) return null

          return {
            ticker, company: insider.companyName || entry.name, mode: 'confluence', score,
            insiderBuyTotal: insider.estimatedBuyTotal, insiderFilings: insider.filingCount,
            insiderLatestDate: insider.latestDate, isCluster: insider.isCluster,
            contractValue: award['Award Amount'], contractAgency: award['Awarding Agency'],
            contractDate: award['Start Date'], naicsCode: award['naics_code'],
            naicsDescription: award['naics_description'],
            daysApart: Math.round(daysApart),
          }
        })
      )
      for (const r of results) if (r.status === 'fulfilled' && r.value) confluenceSignals.push(r.value)
    }
  }

  // --- Form 4 only ---
  if (form4Entities.status === 'fulfilled') {
    for (const entity of form4Entities.value.slice(0, 50)) {
      const ticker = resolveTickerFromName(entity.name, tickerIndex)
      if (!ticker) continue
      const entry = tickerIndex[ticker]
      if (!entry) continue

      const buyTotal = entity.count * 80_000
      const score = scoreSignal({ insiderBuyTotal: buyTotal, insiderCount: entity.count, mode: 'form4' })
      if (score < ALERT_MIN_SCORE) continue

      form4Signals.push({
        ticker, company: entity.name, mode: 'form4', score,
        insiderBuyTotal: buyTotal, insiderFilings: entity.count,
        insiderLatestDate: entity.latestDate, isCluster: entity.count >= 2,
        contractValue: null, contractAgency: null, contractDate: null,
      })
    }
  }

  return [...confluenceSignals, ...form4Signals].sort((a, b) => b.score - a.score)
}

// ─────────────────────────────────────────────────────────────────
// Email template
// ─────────────────────────────────────────────────────────────────
function buildEmail(newSignals, allSignals, runDate) {
  const fmt = n => n == null ? '—' : n >= 1e9 ? `$${(n/1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n/1e6).toFixed(0)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(0)}K` : `$${n}`

  const signalRows = newSignals.map(s => `
    <tr style="border-bottom:1px solid #eee">
      <td style="padding:8px 12px;font-weight:600;font-family:monospace">${s.ticker}</td>
      <td style="padding:8px 12px;color:#555">${s.company}</td>
      <td style="padding:8px 12px;text-align:center">
        <span style="background:${s.score>=75?'#f0fdf4':s.score>=50?'#fffbeb':'#fef2f2'};
                     color:${s.score>=75?'#15803d':s.score>=50?'#b45309':'#b91c1c'};
                     padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600">
          ${s.score}
        </span>
      </td>
      <td style="padding:8px 12px;font-size:12px">
        ${s.mode === 'confluence' ? `${s.isCluster?'Cluster':'Insider'} buy ${fmt(s.insiderBuyTotal)}<br>${s.contractAgency?.replace('Dept of ','')}: ${fmt(s.contractValue)}` : `${s.insiderFilings} Form 4${s.insiderFilings>1?'s':''} — ${fmt(s.insiderBuyTotal)} est.`}
      </td>
    </tr>`).join('')

  return {
    subject: `${newSignals.length} new confluence signal${newSignals.length !== 1 ? 's' : ''} — ${runDate}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111">
  <div style="margin-bottom:24px">
    <h1 style="font-size:18px;font-weight:600;margin:0 0 4px">Confluence Signal Tracker</h1>
    <p style="color:#888;font-size:13px;margin:0">${runDate} · ${newSignals.length} new signal${newSignals.length!==1?'s':''} (score ≥ ${ALERT_MIN_SCORE})</p>
  </div>

  <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px">
    <thead>
      <tr style="background:#f5f5f5;text-align:left">
        <th style="padding:8px 12px">Ticker</th>
        <th style="padding:8px 12px">Company</th>
        <th style="padding:8px 12px;text-align:center">Score</th>
        <th style="padding:8px 12px">Signal</th>
      </tr>
    </thead>
    <tbody>${signalRows}</tbody>
  </table>

  <p style="font-size:12px;color:#888;border-top:1px solid #eee;padding-top:16px;margin:0">
    ${allSignals.length} total signals tracked · Research tool only — not financial advice ·
    <a href="https://www.sec.gov/cgi-bin/browse-edgar" style="color:#2563eb">SEC EDGAR</a> ·
    <a href="https://usaspending.gov" style="color:#2563eb">USASpending.gov</a>
  </p>
</body>
</html>`,
  }
}

// ─────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Security: verify the cron secret header
  const secret = req.headers['x-cron-secret'] ?? req.query.secret
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const runDate = new Date().toISOString().slice(0, 10)

  try {
    // 1. Fetch fresh signals
    const freshSignals = await fetchAllSignals()

    // 2. Load previously seen signal IDs from KV
    let seenIds = new Set()
    try {
      const stored = await kv.get(KV_KEY_SEEN)
      if (Array.isArray(stored)) seenIds = new Set(stored)
    } catch { /* KV not configured yet — first run */ }

    // 3. Find new signals
    const newSignals = freshSignals.filter(s => !seenIds.has(signalId(s)))

    // 4. Update KV: add new IDs to seen set, store history snapshot
    const updatedSeen = [...seenIds, ...newSignals.map(signalId)]
    // Cap seen set at 500 entries to avoid unbounded growth
    const cappedSeen = updatedSeen.slice(-500)

    let history = []
    try {
      history = (await kv.get(KV_KEY_HISTORY)) ?? []
    } catch {}
    history.unshift({ date: runDate, signalCount: freshSignals.length, newCount: newSignals.length })
    if (history.length > HISTORY_MAX) history = history.slice(0, HISTORY_MAX)

    await Promise.allSettled([
      kv.set(KV_KEY_SEEN, cappedSeen),
      kv.set(KV_KEY_LAST_RUN, new Date().toISOString()),
      kv.set(KV_KEY_HISTORY, history),
    ])

    // 5. Send email alert if there are new high-score signals
    let emailSent = false
    if (newSignals.length > 0 && process.env.RESEND_API_KEY && process.env.ALERT_EMAIL) {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const { subject, html } = buildEmail(newSignals, freshSignals, runDate)
      await resend.emails.send({
        from: 'Confluence Tracker <onboarding@resend.dev>', // update with your verified Resend domain
        to: process.env.ALERT_EMAIL,
        subject,
        html,
      })
      emailSent = true
    }

    return res.status(200).json({
      ok: true,
      runDate,
      totalSignals: freshSignals.length,
      newSignals: newSignals.length,
      emailSent,
      signals: newSignals,
    })

  } catch (err) {
    console.error('[cron]', err)
    return res.status(500).json({ error: err.message })
  }
}
