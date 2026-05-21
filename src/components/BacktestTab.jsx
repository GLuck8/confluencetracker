import { useEffect, useRef } from 'react'
import { Chart, registerables } from 'chart.js'
import { useBacktest } from '../hooks/useData'
import styles from './BacktestTab.module.css'

Chart.register(...registerables)

const SLIDERS = [
  { key: 'holdDays',      label: 'Hold period',         min: 14,  max: 180, step: 7,   fmt: v => `${v}d` },
  { key: 'minScore',      label: 'Min score',           min: 0,   max: 75,  step: 5,   fmt: v => v === 0 ? 'Any' : `${v}+` },
  { key: 'clusterMin',    label: 'Cluster threshold',   min: 1,   max: 4,   step: 1,   fmt: v => v === 1 ? 'Any' : `${v}+ insiders` },
  { key: 'minInsiderBuy', label: 'Min insider buy ($K)', min: 25,  max: 500, step: 25,  fmt: v => `$${v}K`, transform: v => v * 1000, deTransform: v => v / 1000 },
]

export default function BacktestTab({ params, onChange }) {
  const { data: bt, loading } = useBacktest(params)
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

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
            borderWidth: 2,
            pointRadius: 2,
            tension: .3,
            fill: true,
          },
          {
            label: 'S&P 500 (SPY)',
            data: bt.benchmarkCurve,
            borderColor: '#94a3b8',
            borderDash: [4, 3],
            borderWidth: 1.5,
            pointRadius: 0,
            tension: .3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { font: { size: 11 }, maxTicksLimit: 8 }, grid: { display: false } },
          y: { ticks: { callback: v => '$' + Math.round(v).toLocaleString(), font: { size: 11 } } },
        },
      },
    })
  }, [bt])

  const set = (key, val) => onChange({ ...params, [key]: val })

  return (
    <div className={styles.wrap}>
      <div className={styles.note}>
        ⓘ Backtest simulates 24 months of historical signals using the strategy parameters below.
        In production, this queries the EDGAR Form 4 archive and USASpending.gov for real historical data.
      </div>

      <div className={styles.controls}>
        <div className={styles.controlTitle}>Strategy parameters</div>
        <div className={styles.sliders}>
          {SLIDERS.map(s => {
            const rawVal = s.deTransform ? s.deTransform(params[s.key]) : params[s.key]
            return (
              <div key={s.key} className={styles.sliderGroup}>
                <div className={styles.sliderHeader}>
                  <span className={styles.sliderLabel}>{s.label}</span>
                  <span className={styles.sliderVal}>{s.fmt(rawVal)}</span>
                </div>
                <input
                  type="range" min={s.min} max={s.max} step={s.step} value={rawVal}
                  onChange={e => set(s.key, s.transform ? s.transform(+e.target.value) : +e.target.value)}
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
              { label: 'Strategy return', val: `+${bt.stats.totalReturn}%`, green: true },
              { label: 'Benchmark return', val: `+${bt.stats.benchReturn}%` },
              { label: 'Alpha', val: `+${bt.stats.alpha}%`, green: true },
              { label: 'Win rate', val: `${bt.stats.winRate}%` },
              { label: 'Total trades', val: bt.stats.totalTrades },
              { label: 'Max drawdown', val: `-${bt.stats.maxDrawdown}%`, red: true },
              { label: 'Sharpe ratio', val: bt.stats.sharpe },
            ].map(({ label, val, green, red }) => (
              <div key={label} className={styles.stat}>
                <div className={styles.statLabel}>{label}</div>
                <div className={styles.statVal} style={{ color: green ? 'var(--green)' : red ? 'var(--red)' : 'inherit' }}>
                  {val}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.chartCard}>
            <div className={styles.chartHeader}>
              <span className={styles.chartTitle}>Equity curve</span>
              <div className={styles.legend}>
                <span><span className={styles.dot} style={{ background: '#16a34a' }} />Strategy</span>
                <span><span className={styles.dot} style={{ background: '#94a3b8' }} />S&P 500</span>
              </div>
            </div>
            <div style={{ position: 'relative', height: 220 }}>
              <canvas ref={canvasRef} role="img" aria-label="Equity curve comparing strategy vs S&P 500 over 24 months">
                Equity curve chart
              </canvas>
            </div>
          </div>

          <div className={styles.tradeLog}>
            <div className={styles.chartTitle} style={{ marginBottom: '.75rem' }}>Trade log (sample)</div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>{['Ticker','Entry date','Exit date','Entry','Exit','Return','Hold','Score','Cluster'].map(h => (
                    <th key={h}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {bt.trades.slice(0, 10).map((t, i) => (
                    <tr key={i}>
                      <td><strong>{t.ticker}</strong></td>
                      <td>{t.entryDate}</td>
                      <td>{t.exitDate}</td>
                      <td>${t.entry}</td>
                      <td>${t.exit}</td>
                      <td style={{ color: parseFloat(t.ret) >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>
                        {parseFloat(t.ret) >= 0 ? '+' : ''}{t.ret}%
                      </td>
                      <td>{t.holdDays}d</td>
                      <td>{t.score}</td>
                      <td>{t.isCluster ? '✓' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {bt.note && <div className={styles.btNote}>{bt.note}</div>}
          </div>
        </>
      ) : null}
    </div>
  )
}
