/**
 * _score.js  —  Confluence scoring model
 *
 * Scores a signal 0–100 based on:
 *  - Insider buy size (log scale)
 *  - Cluster (multiple insiders)
 *  - Contract value (absolute + as % of estimated revenue)
 *  - Timing proximity of the two signals
 *  - Mode: confluence (both signals) vs form4-only (insider only)
 */

export function scoreSignal({ insiderBuyTotal, insiderCount, contractValue = 0, daysApart = null, mode = 'confluence' }) {
  let score = 0

  // --- Insider component (max 50 pts) ---
  // Buy size on log scale: $50K → ~15, $500K → ~25, $5M → ~35
  const buyScore = Math.min(35, Math.max(0, (Math.log10(Math.max(insiderBuyTotal, 1000)) - 3) * 14))
  score += buyScore

  // Cluster bonus
  const clusterBonus = Math.min(15, (insiderCount - 1) * 7)
  score += clusterBonus

  if (mode === 'form4') {
    // Form 4 only: scale to full 100 based on insider signals alone
    return Math.round(Math.min(100, score * 2))
  }

  // --- Contract component (max 35 pts) ---
  // Contract value: $5M → ~5pts, $50M → ~15, $500M → ~25, $5B → ~35
  if (contractValue > 0) {
    const contractScore = Math.min(35, Math.max(0, (Math.log10(contractValue) - 6) * 14))
    score += contractScore
  }

  // --- Timing proximity (max 15 pts) ---
  // Signals within 7 days: 15pts, 30 days: ~10pts, 60 days: ~5pts, 90+: 0
  if (daysApart !== null) {
    const timingScore = Math.max(0, 15 - (daysApart / 6))
    score += timingScore
  }

  return Math.round(Math.min(100, Math.max(0, score)))
}

export function scoreLabel(score) {
  if (score >= 75) return 'Strong'
  if (score >= 50) return 'Moderate'
  if (score >= 30) return 'Weak'
  return 'Low'
}
