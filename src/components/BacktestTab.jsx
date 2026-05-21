import { useEffect, useRef } from 'react'
import { Chart, registerables } from 'chart.js'
import { useBacktest } from '../hooks/useData'
import styles from './BacktestTab.module.css'

Chart.register(...registerables)

const SLIDERS = [
  { key: 'holdDays',     label: 'Hold period',          min: 14,  max: 180, step: 7,    fmt: v => `${v}d` },
  { key: 'minScore',     label: 'Min confluence score', min: 0,   max: 75,  step: 5,    fmt: v => v === 0 ? 'Any' : `${v}+` },
  { key: 'clusterMin',   label: 'Cluster threshold',    min: 1,   max: 4,   step: 1,    fmt: v => v === 1 ? 'Any' : `${v}+ insiders` },
  { key: 'maxPositions', label: 'Max concurrent trades',min: 1,   max: 10,  step: 1,    fmt: v => v },
  { key: 'startCapital', label: 'Starting capital',     min: 5000,max: 100000,step: 5000,fmt: v => `$${v.toLocaleString()}` },
]

export default function BacktestTab({ params, onChange }) {
  const { data: bt, loading } = useBacktest(params)
  const canvasRef  = useRef(null)
  const chartRef   = useRef(null)

  useEffect(() => {
    if (!canvasRef.current || !bt) return
    if (chartRef.current) chartRef.current.destroy()
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: bt.labels,
        datasets: [
          {
            label: 'Strategy',
            data: bt.equityCurve,
            borderColor: '#16a34a',
            backgroundColor: 'rgba(22,163,74,.07)',
            borderWidth: 2, pointRadius: 2, tension: .3, fill: true,
          },
          {
            label: 'S&P 500 (proxy)',
            data: bt.benchmarkCurve,
            borderColor: '#94a3b8',
            borderDash: [4, 3],
            borderWidth: 1.5, pointRadius: 0, tension: .3,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { font: { size: 11 }, maxTicksLimit: 8 }, grid: { display: false } },
          y: { ticks: { callback: v => '$' + Math.round(v).toLocaleString(), font: { size: 11 } } },
        },
      },
    })
  }, [bt])

  const set = (key, val) => onChange({ ...params, [key]: val })

  // Derived position size for display
  const posSize = bt?.stats?.positionSize
    ? `$${Number(bt.stats.positionSize).toLocaleString()}`
    : `$${Math.round((params.startCapital ?? 10000) / (params.maxPositions ?? 5)).toLocaleString()}`

  return (
    <div className={styles.wrap}>
      <div className={styles.note}>
        ⓘ Synthetic backtest — 24 months, equal-weight position sizing ({posSize} per trade,
        max {params.maxPositions ?? 5} concurrent). Returns reflect actual capital deployment,
        not per-trade % stacked on full capital.
      </div>

      <div className={styles.controls}>
        <div className={styles.controlTitle}>Parameters</div>
        <div className={styles.sliders}>
          {SLIDERS.map(s => {
            const val = params[s.key] ?? s.min
            return (
              <div key={s.key} className={styles.sliderGroup}>
                <div className={styles.sliderHeader}>
                  <span className={styles.sliderLabel}>{s.label}</span>
                  <span className={styles.sliderVal}>{s.fmt(val)}</span>
                </div>
                <input
                  type="range" min={s.min} max={s.max} step={s.step} value={val}
                  onChange={e => set(s.key, +e.target.value)}
                />
              </div>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>Running backtest…</div>
      ) : bt ? (
        <>
          <div className={styles.statsRow}>
            {[
              { label: 'Start capital',   val: `$${Number(bt.stats.startCapital).toLocaleString()}` },
              { label: 'Final value',     val: `$${Number(bt.stats.finalValue).toLocaleString()}`,  green: true },
              { label: 'Total return',    val: `${bt.stats.totalReturn >= 0 ? '+' : ''}${bt.stats.totalReturn}%`, green: bt.stats.totalReturn > 0 },
              { label: 'Benchmark',       val: `+${bt.stats.benchReturn}%` },
              { label: 'Alpha',           val: `${bt.stats.alpha >= 0 ? '+' : ''}${bt.stats.alpha}%`, green: bt.stats.alpha > 0 },
              { label: 'Win rate',        val: `${bt.stats.winRate}%` },
              { label: 'Total trades',    val: bt.stats.totalTrades },
              { label: 'Max drawdown',    val: `-${bt.stats.maxDrawdown}%`, red: true },
              { label: 'Sharpe ratio',    val: bt.stats.sharpe },
            ].map(({ label, val, green, red }) => (
              <div key={label} className={styles.stat}>
                <div className={styles.statLabel}>{label}</div>
                <div className={styles.statVal} style={{
                  color: green ? 'var(--green)' : red ? 'var(--red)' : 'inherit',
                  fontSize: label === 'Final value' ? '20px' : undefined,
                }}>
                  {val}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.chartCard}>
            <div className={styles.chartHeader}>
              <span className={styles.chartTitle}>Portfolio equity curve</span>
              <div className={styles.legend}>
                <span><span className={styles.dot} style={{ background: '#16a34a' }} />Strategy</span>
                <span><span className={styles.dot} style={{ background: '#94a3b8' }} />S&P 500</span>
              </div>
            </div>
            <div style={{ position: 'relative', height: 220 }}>
              <canvas ref={canvasRef} role="img"
                aria-label="Portfolio equity curve vs S&P 500 benchmark over 24 months">
                Equity curve chart
              </canvas>
            </div>
          </div>

          <div className={styles.tradeLog}>
            <div className={styles.tradeLogHeader}>
              <span className={styles.chartTitle}>Trade log</span>
              <span className={styles.tradeLogMeta}>
                {bt.trades.length} trade{bt.trades.length !== 1 ? 's' : ''} ·
                ${Number(bt.stats.positionSize).toLocaleString()} per position ·
                max {bt.stats.maxPositions} concurrent
              </span>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {['Ticker','Entry','Exit','Position','Return','P&L','Hold','Score','Cluster'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bt.trades.map((t, i) => {
                    const retPct  = parseFloat(t.ret)
                    const pnl     = (Number(t.positionSize) * retPct / 100)
                    const isPos   = retPct >= 0
                    return (
                      <tr key={i} style={t.open ? { opacity: 0.6 } : {}}>
                        <td><strong>{t.ticker}</strong>{t.open ? ' *' : ''}</td>
                        <td>{t.entryDate}</td>
                        <td>{t.exitDate}</td>
                        <td>${Number(t.positionSize).toLocaleString()}</td>
                        <td style={{ color: isPos ? 'var(--green-text)' : 'var(--red-text)', fontWeight: 500 }}>
                          {isPos ? '+' : ''}{t.ret}%
                        </td>
                        <td style={{ color: isPos ? 'var(--green-text)' : 'var(--red-text)' }}>
                          {isPos ? '+' : ''}${Math.abs(pnl).toFixed(0)}
                        </td>
                        <td>{t.holdDays}d</td>
                        <td>{t.score}</td>
                        <td>{t.isCluster ? '✓' : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {bt.note && <div className={styles.btNote}>{bt.note}</div>}
            <div className={styles.btNote} style={{ marginTop: 4 }}>
              * Open positions valued at cost — not yet closed within the 24-month window.
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
