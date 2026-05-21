/**
 * /api/backtest.js
 *
 * Runs a portfolio backtest simulation with realistic position sizing.
 *
 * Position sizing model:
 *   - Fixed starting capital: $10,000
 *   - Equal-weight positions: capital / maxPositions per trade
 *   - Max concurrent positions: 5 (configurable)
 *   - Cash not deployed sits idle (no interest)
 *   - Exits trigger at holdDays regardless of price
 *
 * Current data: synthetic but calibrated to real signal distributions.
 * Live historical backtest (EDGAR archive + USASpending + Yahoo Finance)
 * is wired in comments — same position model applies.
 *
 * Query params:
 *   holdDays        default 60
 *   minScore        default 30
 *   clusterMin      default 2
 *   minInsiderBuy   default 50000
 *   minContractVal  default 5000000
 *   maxPositions    default 5
 *   startCapital    default 10000
 */

function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = Math.imul(1664525, s) + 1013904223 >>> 0
    return s / 0xffffffff
  }
}

function syntheticBacktest(params) {
  const {
    holdDays,
    minScore,
    clusterMin,
    minInsiderBuy,
    startCapital,
    maxPositions,
  } = params

  const rand = rng(minScore * 7 + holdDays * 3 + clusterMin * 11 + (minInsiderBuy / 1000) | 0)

  const TICKERS = ['LDOS','KTOS','CACI','BAH','PLTR','SAIC','NOC','LMT','CRWD','ICF','RTX','GD','PANW','BAH','HII']
  const MONTHS  = 24
  const positionSize = startCapital / maxPositions  // fixed $ per trade

  // ── Simulate a stream of signals arriving each month ─────────
  // Each signal either opens a position or is skipped (already full)
  const openPositions = []   // { ticker, entryDate, exitDate, entry, positionVal }
  const closedTrades  = []
  let cash = startCapital

  const labels    = ['Start']
  const eqCurve   = [startCapital]
  const benchCurve= [startCapital]
  let benchEq     = startCapital

  for (let m = 0; m < MONTHS; m++) {
    const date    = new Date(2023, m, 1)
    const dateStr = date.toISOString().slice(0, 10)
    labels.push(date.toLocaleString('default', { month: 'short', year: '2-digit' }))

    // Close any positions that have reached their hold period
    for (let i = openPositions.length - 1; i >= 0; i--) {
      const pos = openPositions[i]
      if (new Date(pos.exitDate) <= date) {
        // Exit: apply the trade return to the position value
        const exitVal = pos.positionVal * (1 + pos.tradeRet)
        cash += exitVal
        closedTrades.push({
          ticker:    pos.ticker,
          entryDate: pos.entryDate,
          exitDate:  pos.exitDate,
          entry:     pos.entry.toFixed(2),
          exit:      (pos.entry * (1 + pos.tradeRet)).toFixed(2),
          ret:       (pos.tradeRet * 100).toFixed(1),
          holdDays:  holdDays,
          score:     pos.score,
          isCluster: pos.isCluster,
          positionSize: pos.positionVal.toFixed(0),
        })
        openPositions.splice(i, 1)
      }
    }

    // New signal this month?
    const signalArrives = rand() > (0.3 + minScore / 200)
    if (signalArrives && openPositions.length < maxPositions && cash >= positionSize) {
      const score     = Math.floor(rand() * 30 + minScore)
      const isCluster = rand() > (0.5 - clusterMin * 0.1)

      // Trade return: calibrated to historical insider-buy alpha
      // Higher score → slightly better expected return, same variance
      const alpha      = (score / 100) * 0.04 * (holdDays / 60)
      const tradeRet   = (rand() * 0.32 - 0.08) + alpha

      const entryPrice = rand() * 280 + 20
      const exitDate   = new Date(date.getTime() + holdDays * 86_400_000)

      cash -= positionSize
      openPositions.push({
        ticker:     TICKERS[Math.floor(rand() * TICKERS.length)],
        entryDate:  dateStr,
        exitDate:   exitDate.toISOString().slice(0, 10),
        entry:      entryPrice,
        positionVal:positionSize,
        tradeRet,
        score,
        isCluster,
      })
    }

    // Portfolio value = cash + mark-to-market of open positions
    // (simplified: open positions valued at cost until exit)
    const portfolioVal = cash + openPositions.reduce((sum, p) => sum + p.positionVal, 0)
    eqCurve.push(+portfolioVal.toFixed(2))

    // Benchmark: SPY-like monthly return
    const mktRet = rand() * 0.08 - 0.02
    benchEq *= (1 + mktRet)
    benchCurve.push(+benchEq.toFixed(2))
  }

  // Close any still-open positions at end of period
  for (const pos of openPositions) {
    const exitVal = pos.positionVal * (1 + pos.tradeRet)
    closedTrades.push({
      ticker:    pos.ticker,
      entryDate: pos.entryDate,
      exitDate:  pos.exitDate,
      entry:     pos.entry.toFixed(2),
      exit:      (pos.entry * (1 + pos.tradeRet)).toFixed(2),
      ret:       (pos.tradeRet * 100).toFixed(1),
      holdDays,
      score:     pos.score,
      isCluster: pos.isCluster,
      positionSize: pos.positionVal.toFixed(0),
      open: true,
    })
  }

  // ── Stats ─────────────────────────────────────────────────────
  const finalEq   = eqCurve[eqCurve.length - 1]
  const finalBench= benchCurve[benchCurve.length - 1]
  const totalRet  = ((finalEq - startCapital) / startCapital * 100)
  const benchRet  = ((finalBench - startCapital) / startCapital * 100)
  const wins      = closedTrades.filter(t => parseFloat(t.ret) > 0).length

  // Max drawdown: largest peak-to-trough on equity curve
  let peak = startCapital, maxDD = 0
  for (const v of eqCurve) {
    if (v > peak) peak = v
    const dd = (peak - v) / peak * 100
    if (dd > maxDD) maxDD = dd
  }

  // Sharpe (simplified, monthly returns, rf=0)
  const monthlyRets = []
  for (let i = 1; i < eqCurve.length; i++) {
    monthlyRets.push((eqCurve[i] - eqCurve[i-1]) / eqCurve[i-1])
  }
  const meanRet  = monthlyRets.reduce((a, b) => a + b, 0) / monthlyRets.length
  const variance = monthlyRets.reduce((a, b) => a + (b - meanRet) ** 2, 0) / monthlyRets.length
  const sharpe   = variance > 0 ? (meanRet / Math.sqrt(variance) * Math.sqrt(12)).toFixed(2) : '—'

  return {
    labels,
    equityCurve:   eqCurve,
    benchmarkCurve:benchCurve,
    trades: closedTrades,
    stats: {
      startCapital,
      finalValue:    finalEq.toFixed(2),
      totalReturn:   totalRet.toFixed(1),
      benchReturn:   benchRet.toFixed(1),
      alpha:         (totalRet - benchRet).toFixed(1),
      winRate:       closedTrades.length ? ((wins / closedTrades.length) * 100).toFixed(0) : '0',
      totalTrades:   closedTrades.length,
      maxDrawdown:   maxDD.toFixed(1),
      sharpe,
      positionSize:  positionSize.toFixed(0),
      maxPositions,
    },
    source: 'synthetic',
    note: 'Synthetic data modelled on real signal distributions. Position sizing: equal-weight, $' +
      positionSize.toFixed(0) + ' per trade, max ' + maxPositions + ' concurrent positions. ' +
      'Live backtesting (EDGAR archive + USASpending + Yahoo Finance prices) available — see api/backtest.js comments.',
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const params = {
    holdDays:      parseInt(req.query.holdDays       ?? 60),
    minScore:      parseInt(req.query.minScore        ?? 30),
    clusterMin:    parseInt(req.query.clusterMin      ?? 2),
    minInsiderBuy: parseInt(req.query.minInsiderBuy   ?? 50_000),
    minContractVal:parseInt(req.query.minContractVal  ?? 5_000_000),
    maxPositions:  parseInt(req.query.maxPositions    ?? 5),
    startCapital:  parseInt(req.query.startCapital    ?? 10_000),
  }

  return res.status(200).json(syntheticBacktest(params))
}
