/**
 * /api/debug.js
 *
 * Diagnostic endpoint — shows exactly where the signal pipeline
 * succeeds or fails at each stage. Never returns demo data.
 *
 * GET /api/debug?daysBack=90&minContractVal=1000000
 */

import { getTickerIndex, resolveTickerFromName, getInsiderActivity } from './_edgar.js'
import { fetchAwards } from './_usaspending.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')

  const daysBack       = Number(req.query.daysBack       ?? 90)
  const minContractVal = Number(req.query.minContractVal ?? 1_000_000)
  const startDate = new Date(Date.now() - daysBack * 86_400_000).toISOString().slice(0, 10)
  const endDate   = new Date().toISOString().slice(0, 10)

  const report = {
    params: { daysBack, minContractVal, startDate, endDate },
    stages: {},
  }

  // ── Stage 1: USASpending ──────────────────────────────────────
  let awards = []
  try {
    awards = await fetchAwards({ startDate, endDate, minVal: minContractVal, limit: 100 })
    report.stages.usaspending = {
      ok: true,
      awardsReturned: awards.length,
      sample: awards.slice(0, 5).map(a => ({
        recipient: a['Recipient Name'],
        amount: a['Award Amount'],
        agency: a['Awarding Agency'],
        date: a['Start Date'],
      })),
    }
  } catch (err) {
    report.stages.usaspending = { ok: false, error: err.message }
    return res.status(200).json(report)
  }

  // ── Stage 2: EDGAR ticker index ───────────────────────────────
  let tickerIndex = {}
  try {
    tickerIndex = await getTickerIndex()
    report.stages.tickerIndex = {
      ok: true,
      totalTickers: Object.keys(tickerIndex).length,
      sampleTickers: Object.keys(tickerIndex).slice(0, 5),
    }
  } catch (err) {
    report.stages.tickerIndex = { ok: false, error: err.message }
    return res.status(200).json(report)
  }

  // ── Stage 3: Name → ticker resolution ────────────────────────
  const resolutionResults = awards.slice(0, 30).map(a => {
    const name = a['Recipient Name']
    const ticker = resolveTickerFromName(name, tickerIndex)
    return { name, ticker: ticker ?? '(no match)', matched: !!ticker }
  })

  const matched = resolutionResults.filter(r => r.matched)
  report.stages.nameResolution = {
    attempted: resolutionResults.length,
    matched: matched.length,
    matchRate: `${Math.round(matched.length / resolutionResults.length * 100)}%`,
    results: resolutionResults,
  }

  if (matched.length === 0) {
    report.stages.nameResolution.diagnosis =
      'Zero matches — name normalisation is not finding overlap between USASpending recipient names and EDGAR company names. Sample names above show what USASpending is returning.'
    return res.status(200).json(report)
  }

  // ── Stage 4: Form 4 check on matched tickers ─────────────────
  const form4Results = []
  for (const { name, ticker } of matched.slice(0, 10)) {
    const entry = tickerIndex[ticker]
    if (!entry) continue
    try {
      const insider = await getInsiderActivity(entry.cik, daysBack)
      form4Results.push({
        ticker,
        company: entry.name,
        cik: entry.cik,
        recipientName: name,
        hasForm4Activity: !!insider,
        filingCount: insider?.filingCount ?? 0,
        estimatedBuyTotal: insider?.estimatedBuyTotal ?? 0,
        latestDate: insider?.latestDate ?? null,
      })
    } catch (err) {
      form4Results.push({ ticker, error: err.message })
    }
  }

  const withForm4 = form4Results.filter(r => r.hasForm4Activity && r.filingCount > 0)
  report.stages.form4Check = {
    tickersChecked: form4Results.length,
    withRecentForm4s: withForm4.length,
    results: form4Results,
    diagnosis: withForm4.length === 0
      ? 'Tickers resolved OK but none have recent Form 4 filings in this window. Try increasing daysBack.'
      : `${withForm4.length} ticker(s) have both a contract award and recent Form 4 activity.`,
  }

  report.conclusion = withForm4.length > 0
    ? `Pipeline working — ${withForm4.length} confluence match(es) found. If signals tab shows demo, check minScore threshold.`
    : matched.length > 0
      ? 'Name resolution working but no Form 4 activity found. Likely just a quiet period — try daysBack=90 or 120.'
      : 'Name resolution is the bottleneck. See nameResolution.results for details.'

  return res.status(200).json(report)
}
