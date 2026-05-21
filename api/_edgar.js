/**
 * _edgar.js  —  SEC EDGAR helpers
 *
 * Ticker symbols are the canonical unique key on US markets.
 * We use EDGAR's company_tickers.json as the bridge between
 * USASpending recipient names and SEC filings.
 */

const UA     = 'confluence-tracker/2.0 (contact@example.com)'
const EDGAR  = 'https://data.sec.gov'
const EFTS   = 'https://efts.sec.gov'

// ── In-memory cache ───────────────────────────────────────────────
let _tickerIndex      = null
let _tickerIndexAt    = 0
let _normIndex        = null   // pre-normalised for faster matching
const TTL = 60 * 60 * 1000    // 1 hour

// ── Normalise a company name for matching ─────────────────────────
// Strategy: remove only the most generic legal suffixes and punctuation,
// keep meaningful words. Short words (2 chars) kept if they're not noise.
const STRIP = /\b(incorporated|corporation|corp|inc|llc|ltd|limited|co|the|and|of|for|plc|lp|llp)\b\.?/gi
const NOISE = /[^a-z0-9\s]/g

function normName(name) {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(STRIP, ' ')
    .replace(NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Word-level Jaccard similarity between two normalised strings
function similarity(a, b) {
  const wa = new Set(a.split(' ').filter(w => w.length >= 2))
  const wb = new Set(b.split(' ').filter(w => w.length >= 2))
  if (wa.size === 0 || wb.size === 0) return 0
  const intersection = [...wa].filter(w => wb.has(w)).length
  const union = new Set([...wa, ...wb]).size
  return intersection / union
}

// ── Ticker index ──────────────────────────────────────────────────
export async function getTickerIndex() {
  const now = Date.now()
  if (_tickerIndex && now - _tickerIndexAt < TTL) return _tickerIndex

  const res = await fetch(`https://www.sec.gov/files/company_tickers.json`, {
    headers: { 'User-Agent': UA },
  })
  if (!res.ok) throw new Error(`EDGAR ticker index: ${res.status}`)

  const raw = await res.json()
  const index = {}
  const normIdx = {}

  for (const entry of Object.values(raw)) {
    const ticker = entry.ticker.toUpperCase()
    const record = {
      cik:    String(entry.cik_str).padStart(10, '0'),
      name:   entry.title,
      ticker,
      norm:   normName(entry.title),
    }
    index[ticker]        = record
    normIdx[record.norm] = record   // for exact-norm lookups
  }

  _tickerIndex   = index
  _normIndex     = normIdx
  _tickerIndexAt = now
  return index
}

/**
 * Resolve a USASpending recipient name to a ticker.
 *
 * Passes in order:
 *  1. Exact normalised-name match           → high confidence
 *  2. One name starts-with the other        → high confidence
 *  3. Jaccard word similarity ≥ 0.5         → medium confidence
 *
 * Returns ticker string or null.
 */
export function resolveTickerFromName(recipientName, tickerIndex) {
  if (!recipientName) return null
  const normRecipient = normName(recipientName)
  if (!normRecipient) return null

  // Pass 1: exact normalised match
  if (_normIndex?.[normRecipient]) return _normIndex[normRecipient].ticker

  let bestTicker = null
  let bestScore  = 0

  for (const { ticker, norm } of Object.values(tickerIndex)) {
    if (!norm) continue

    let score = 0

    // Pass 2: prefix match (one contains the other)
    if (norm === normRecipient) {
      score = 1.0
    } else if (norm.startsWith(normRecipient) || normRecipient.startsWith(norm)) {
      // weight by length ratio to avoid short strings matching everything
      const ratio = Math.min(norm.length, normRecipient.length) /
                    Math.max(norm.length, normRecipient.length)
      score = 0.7 * ratio
    } else {
      // Pass 3: Jaccard similarity
      score = similarity(normRecipient, norm) * 0.9
    }

    if (score > bestScore && score >= 0.45) {
      bestScore  = score
      bestTicker = ticker
    }
  }

  return bestTicker
}

/**
 * Fetch recent Form 4 activity for a CIK.
 * Returns summary stats — filing count, estimated buy total, latest date.
 * Real $ values require parsing the XML; we use filing count as a proxy.
 */
export async function getInsiderActivity(cik, daysBack = 60) {
  const paddedCik = String(cik).padStart(10, '0')
  const url = `${EDGAR}/submissions/CIK${paddedCik}.json`

  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return null

  const data   = await res.json()
  const recent = data.filings?.recent ?? {}
  const forms  = recent.form        ?? []
  const dates  = recent.filingDate  ?? []
  const cutoff = new Date(Date.now() - daysBack * 86_400_000)

  let filingCount = 0
  let latestDate  = null

  for (let i = 0; i < forms.length; i++) {
    if (forms[i] !== '4') continue
    const filed = new Date(dates[i])
    if (filed < cutoff) break   // newest-first, safe to stop
    filingCount++
    if (!latestDate) latestDate = dates[i]
  }

  if (filingCount === 0) return null

  return {
    cik:               paddedCik,
    filingCount,
    estimatedBuyTotal: filingCount * 80_000,  // proxy; real parsing needed for exact $
    latestDate,
    companyName:       data.name,
    isCluster:         filingCount >= 2,
  }
}

/**
 * Full-market Form 4 scan via EDGAR full-text search.
 * Returns entities sorted by filing frequency.
 */
export async function scanAllForm4s(daysBack = 30, minEstimatedBuy = 50_000) {
  const from = new Date(Date.now() - daysBack * 86_400_000).toISOString().slice(0, 10)
  const to   = new Date().toISOString().slice(0, 10)

  // Use correct EFTS parameter format with URLSearchParams
  const qs = new URLSearchParams({
    q:         '"Open Market"',
    forms:     '4',
    dateRange: 'custom',
    startdt:   from,
    enddt:     to,
    size:      '100',
  })

  const url = `${EFTS}/LATEST/search-index?${qs}`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) {
    console.error(`EFTS scan failed: ${res.status}`)
    return []
  }

  const data = await res.json()
  const hits = data.hits?.hits ?? []

  const byEntity = {}
  for (const hit of hits) {
    const name = hit._source?.entity_name
    const date = hit._source?.file_date
    if (!name) continue
    if (!byEntity[name]) byEntity[name] = { name, count: 0, latestDate: date }
    byEntity[name].count++
  }

  return Object.values(byEntity)
    .filter(e => e.count * 80_000 >= minEstimatedBuy)
    .sort((a, b) => b.count - a.count)
    .slice(0, 100)
}
