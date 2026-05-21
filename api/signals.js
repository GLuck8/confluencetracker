/**
 * /api/signals.js
 *
 * Vercel serverless function — the main signal engine.
 *
 * Two modes:
 *
 *  mode=confluence (default)
 *    1. Fetch large contract awards from USASpending (last N days)
 *    2. For each award recipient, resolve to a ticker via EDGAR ticker index
 *       (exact unique match — tickers are canonical on US markets)
 *    3. Check that ticker's CIK for recent Form 4 open-market purchases
 *    4. Score and return matched signals
 *
 *  mode=form4
 *    1. Scan EDGAR full-text search for all recent Form 4 "Open Market" filings
 *    2. Resolve entity names to tickers via EDGAR ticker index
 *    3. Return ranked by insider activity (no contract filter)
 *
 * Query params:
 *   mode          'confluence' | 'form4'       default: confluence
 *   minInsiderBuy  number (USD)                default: 50000
 *   minContractVal number (USD)                default: 5000000
 *   minScore       number 0-100                default: 20
 *   daysBack       number                      default: 60
 *   demo           'true'                      forces demo data
 */

import { getTickerIndex, resolveTickerFromName, getInsiderActivity, scanAllForm4s } from './_edgar.js'
import { fetchAwards } from './_usaspending.js'
import { scoreSignal } from './_score.js'

const DEFAULTS = {
  mode: 'confluence',
  minInsiderBuy: 50_000,
  minContractVal: 5_000_000,
  minScore: 20,
  daysBack: 60,
}

// ─────────────────────────────────────────────────────────────────
// CONFLUENCE MODE: contracts → tickers → Form 4 cross-reference
// ─────────────────────────────────────────────────────────────────
async function confluenceSignals({ minInsiderBuy, minContractVal, minScore, daysBack }) {
  const startDate = new Date(Date.now() - daysBack * 86_400_000).toISOString().slice(0, 10)
  const endDate = new Date().toISOString().slice(0, 10)

  // Step 1: fetch large contracts
  const awards = await fetchAwards({ startDate, endDate, minVal: minContractVal, limit: 150 })
  if (awards.length === 0) return []

  // Step 2: load EDGAR ticker index (cached)
  const tickerIndex = await getTickerIndex()

  // Step 3: resolve each award recipient to a ticker
  // Ticker is the unique canonical key — no ambiguity on US markets
  const tickerToAward = {}
  for (const award of awards) {
    const recipientName = award['Recipient Name']
    const ticker = resolveTickerFromName(recipientName, tickerIndex)
    if (!ticker) continue
    // Keep the largest contract per ticker
    const existing = tickerToAward[ticker]
    if (!existing || award['Award Amount'] > existing['Award Amount']) {
      tickerToAward[ticker] = { ...award, resolvedTicker: ticker }
    }
  }

  const resolvedTickers = Object.keys(tickerToAward)
  if (resolvedTickers.length === 0) return []

  // Step 4: check each resolved ticker for Form 4 insider activity
  // Batch in groups of 8 to avoid hammering EDGAR
  const signals = []
  const chunks = []
  for (let i = 0; i < resolvedTickers.length; i += 8) {
    chunks.push(resolvedTickers.slice(i, i + 8))
  }

  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map(async ticker => {
        const entry = tickerIndex[ticker]
        if (!entry) return null

        const insider = await getInsiderActivity(entry.cik, daysBack)
        if (!insider || insider.estimatedBuyTotal < minInsiderBuy) return null

        const award = tickerToAward[ticker]
        const contractDate = new Date(award['Start Date'] || Date.now())
        const insiderDate = new Date(insider.latestDate || Date.now())
        const daysApart = Math.abs((contractDate - insiderDate) / 86_400_000)

        const score = scoreSignal({
          insiderBuyTotal: insider.estimatedBuyTotal,
          insiderCount: insider.filingCount,
          contractValue: award['Award Amount'] || 0,
          daysApart,
          mode: 'confluence',
        })

        if (score < minScore) return null

        return {
          ticker,
          company: insider.companyName || entry.name,
          cik: entry.cik,
          mode: 'confluence',
          score,
          // Insider data
          insiderBuyTotal: insider.estimatedBuyTotal,
          insiderFilings: insider.filingCount,
          insiderLatestDate: insider.latestDate,
          isCluster: insider.isCluster,
          // Contract data
          contractValue: award['Award Amount'],
          contractAgency: award['Awarding Agency'],
          contractSubAgency: award['Awarding Sub Agency'] || '',
          contractDate: award['Start Date'],
          naicsCode: award['naics_code'],
          naicsDescription: award['naics_description'],
          daysApart: Math.round(daysApart),
        }
      })
    )

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) signals.push(r.value)
    }
  }

  return signals.sort((a, b) => b.score - a.score)
}

// ─────────────────────────────────────────────────────────────────
// FORM 4 ONLY MODE: full-market insider buy scan
// ─────────────────────────────────────────────────────────────────
async function form4Signals({ minInsiderBuy, minScore, daysBack }) {
  // Scan EDGAR for recent "Open Market" Form 4s across all companies
  const entities = await scanAllForm4s(daysBack, minInsiderBuy)
  if (entities.length === 0) return []

  // Resolve entity names to tickers via EDGAR ticker index
  const tickerIndex = await getTickerIndex()
  const signals = []

  for (const entity of entities.slice(0, 80)) {
    const ticker = resolveTickerFromName(entity.name, tickerIndex)
    if (!ticker) continue
    const entry = tickerIndex[ticker]
    if (!entry) continue

    const buyTotal = entity.count * 80_000 // estimated
    const score = scoreSignal({
      insiderBuyTotal: buyTotal,
      insiderCount: entity.count,
      mode: 'form4',
    })

    if (score < minScore) continue

    signals.push({
      ticker,
      company: entity.name,
      cik: entry.cik,
      mode: 'form4',
      score,
      insiderBuyTotal: buyTotal,
      insiderFilings: entity.count,
      insiderLatestDate: entity.latestDate,
      isCluster: entity.count >= 2,
      // No contract data in this mode
      contractValue: null,
      contractAgency: null,
      contractDate: null,
    })
  }

  return signals.sort((a, b) => b.score - a.score)
}

// ─────────────────────────────────────────────────────────────────
// Demo data (always available as fallback)
// ─────────────────────────────────────────────────────────────────
function demoData(mode, minScore) {
  const confluence = [
    { ticker: 'LDOS', company: 'Leidos Holdings', cik: '1336920', mode: 'confluence', score: 88,
      insiderBuyTotal: 920_000, insiderFilings: 3, isCluster: true,
      insiderLatestDate: new Date(Date.now() - 10 * 864e5).toISOString().slice(0,10),
      contractValue: 490_000_000, contractAgency: 'Dept of Defence',
      contractSubAgency: 'US Army', contractDate: new Date(Date.now() - 14 * 864e5).toISOString().slice(0,10),
      naicsCode: '541512', naicsDescription: 'Computer Systems Design', daysApart: 4, _demo: true },
    { ticker: 'KTOS', company: 'Kratos Defence & Security', cik: '1069258', mode: 'confluence', score: 76,
      insiderBuyTotal: 620_000, insiderFilings: 2, isCluster: true,
      insiderLatestDate: new Date(Date.now() - 8 * 864e5).toISOString().slice(0,10),
      contractValue: 95_000_000, contractAgency: 'Dept of Defence',
      contractSubAgency: 'DARPA', contractDate: new Date(Date.now() - 12 * 864e5).toISOString().slice(0,10),
      naicsCode: '336411', naicsDescription: 'Aircraft Manufacturing', daysApart: 4, _demo: true },
    { ticker: 'CACI', company: 'CACI International', cik: '16058', mode: 'confluence', score: 68,
      insiderBuyTotal: 310_000, insiderFilings: 2, isCluster: true,
      insiderLatestDate: new Date(Date.now() - 20 * 864e5).toISOString().slice(0,10),
      contractValue: 210_000_000, contractAgency: 'Dept of Homeland Security',
      contractSubAgency: 'CISA', contractDate: new Date(Date.now() - 25 * 864e5).toISOString().slice(0,10),
      naicsCode: '541519', naicsDescription: 'Other Computer Services', daysApart: 5, _demo: true },
    { ticker: 'BAH', company: 'Booz Allen Hamilton', cik: '1443646', mode: 'confluence', score: 55,
      insiderBuyTotal: 185_000, insiderFilings: 1, isCluster: false,
      insiderLatestDate: new Date(Date.now() - 35 * 864e5).toISOString().slice(0,10),
      contractValue: 340_000_000, contractAgency: 'Dept of Defence',
      contractSubAgency: 'NSA', contractDate: new Date(Date.now() - 40 * 864e5).toISOString().slice(0,10),
      naicsCode: '541611', naicsDescription: 'Management Consulting', daysApart: 5, _demo: true },
  ]

  const form4 = [
    { ticker: 'AAPL', company: 'Apple Inc.', cik: '0000320193', mode: 'form4', score: 82,
      insiderBuyTotal: 4_200_000, insiderFilings: 4, isCluster: true,
      insiderLatestDate: new Date(Date.now() - 3 * 864e5).toISOString().slice(0,10),
      contractValue: null, contractAgency: null, contractDate: null, _demo: true },
    { ticker: 'NVDA', company: 'NVIDIA Corporation', cik: '1045810', mode: 'form4', score: 74,
      insiderBuyTotal: 2_800_000, insiderFilings: 3, isCluster: true,
      insiderLatestDate: new Date(Date.now() - 6 * 864e5).toISOString().slice(0,10),
      contractValue: null, contractAgency: null, contractDate: null, _demo: true },
    { ticker: 'MSFT', company: 'Microsoft Corporation', cik: '789019', mode: 'form4', score: 61,
      insiderBuyTotal: 1_100_000, insiderFilings: 2, isCluster: true,
      insiderLatestDate: new Date(Date.now() - 12 * 864e5).toISOString().slice(0,10),
      contractValue: null, contractAgency: null, contractDate: null, _demo: true },
    { ticker: 'JPM', company: 'JPMorgan Chase & Co.', cik: '19617', mode: 'form4', score: 48,
      insiderBuyTotal: 650_000, insiderFilings: 1, isCluster: false,
      insiderLatestDate: new Date(Date.now() - 18 * 864e5).toISOString().slice(0,10),
      contractValue: null, contractAgency: null, contractDate: null, _demo: true },
    ...confluence,
  ]

  const base = mode === 'form4' ? form4 : confluence
  return base.filter(s => s.score >= minScore)
}

// ─────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 's-maxage=300') // cache 5 min on Vercel edge
  if (req.method === 'OPTIONS') return res.status(200).end()

  const mode          = req.query.mode          ?? DEFAULTS.mode
  const minInsiderBuy = Number(req.query.minInsiderBuy ?? DEFAULTS.minInsiderBuy)
  const minContractVal= Number(req.query.minContractVal?? DEFAULTS.minContractVal)
  const minScore      = Number(req.query.minScore      ?? DEFAULTS.minScore)
  const daysBack      = Number(req.query.daysBack      ?? DEFAULTS.daysBack)
  const forceDemo     = req.query.demo === 'true'

  if (forceDemo) {
    return res.status(200).json({
      signals: demoData(mode, minScore),
      source: 'demo', fetchedAt: new Date().toISOString(), mode,
    })
  }

  try {
    const signals = mode === 'form4'
      ? await form4Signals({ minInsiderBuy, minScore, daysBack })
      : await confluenceSignals({ minInsiderBuy, minContractVal, minScore, daysBack })

    if (signals.length === 0) {
      return res.status(200).json({
        signals: demoData(mode, minScore),
        source: 'demo-fallback', fetchedAt: new Date().toISOString(), mode,
        note: 'Live APIs returned no signals for current parameters.',
      })
    }

    return res.status(200).json({
      signals, source: 'live', fetchedAt: new Date().toISOString(), mode,
    })

  } catch (err) {
    console.error('[signals]', err)
    return res.status(200).json({
      signals: demoData(mode, minScore),
      source: 'demo-fallback', fetchedAt: new Date().toISOString(), mode,
      error: err.message,
    })
  }
}
