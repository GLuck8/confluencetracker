import { useState, useMemo } from 'react'
import SignalCard from './components/SignalCard'
import FilterBar from './components/FilterBar'
import BacktestTab from './components/BacktestTab'
import ExportTab from './components/ExportTab'
import SettingsTab from './components/SettingsTab'
import { useSignals } from './hooks/useData'
import styles from './App.module.css'

const DEFAULT_PARAMS = {
  mode: 'confluence',       // 'confluence' | 'form4'
  minInsiderBuy: 50_000,
  minContractVal: 5_000_000,
  minScore: 20,
  daysBack: 60,
  clusterMin: 1,
  holdDays: 60,
}

const TABS = [
  { id: 'signals',  label: 'Signals' },
  { id: 'backtest', label: 'Backtest' },
  { id: 'export',   label: 'Watchlist' },
  { id: 'settings', label: 'Alerts & Settings' },
]

export default function App() {
  const [tab, setTab] = useState('signals')
  const [params, setParams] = useState(DEFAULT_PARAMS)
  const [watchlist, setWatchlist] = useState([])

  const { signals, loading, error, source, fetchedAt, refetch } = useSignals(params)

  const filteredSignals = useMemo(() =>
    [...signals].sort((a, b) => b.score - a.score),
    [signals]
  )

  const toggleWatch = ticker =>
    setWatchlist(w => w.includes(ticker) ? w.filter(t => t !== ticker) : [...w, ticker])

  const removeWatch = ticker =>
    setWatchlist(w => w.filter(t => t !== ticker))

  const setMode = mode => setParams(p => ({ ...p, mode }))

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.logoWrap}>
          <div className={styles.logoMark}>C∆</div>
          <div>
            <div className={styles.logoName}>Confluence Signal Tracker</div>
            <div className={styles.logoSub}>Insider buys × Government contracts</div>
          </div>
        </div>

        <div className={styles.headerRight}>
          {/* Mode toggle — prominent in the header */}
          <div className={styles.modeToggle}>
            <button
              className={`${styles.modeBtn} ${params.mode === 'confluence' ? styles.modeActive : ''}`}
              onClick={() => setMode('confluence')}
              title="Show only tickers with both an insider buy AND a government contract award"
            >
              Confluence
            </button>
            <button
              className={`${styles.modeBtn} ${params.mode === 'form4' ? styles.modeActive : ''}`}
              onClick={() => setMode('form4')}
              title="Show all open-market insider buys across the full market — no contract filter"
            >
              Form 4 only
            </button>
          </div>

          <div className={styles.headerMeta}>
            {fetchedAt && (
              <span className={styles.fetchedAt}>
                {new Date(fetchedAt).toLocaleTimeString()}
              </span>
            )}
            <span className={`${styles.badge} ${source === 'live' ? styles.live : styles.demo}`}>
              {source === 'live' ? '● Live' : '○ Demo'}
            </span>
            {watchlist.length > 0 && (
              <span className={styles.watchCount}>★ {watchlist.length}</span>
            )}
            <button className={styles.refreshBtn} onClick={refetch} aria-label="Refresh">↻</button>
          </div>
        </div>
      </header>

      <nav className={styles.tabs}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`${styles.tab} ${tab === t.id ? styles.active : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className={styles.main}>
        {tab === 'signals' && (
          <>
            {params.mode === 'confluence' && (
              <div className={styles.modeExplain}>
                <strong>Confluence mode:</strong> showing tickers where a USASpending contract award
                and a Form 4 open-market buy both appear within the lookback window.
                Ticker universe is open-ended — any company that wins a contract gets checked.
              </div>
            )}
            {params.mode === 'form4' && (
              <div className={`${styles.modeExplain} ${styles.form4Mode}`}>
                <strong>Form 4 only:</strong> scanning SEC EDGAR for all open-market insider purchases
                across the full US market. No contract filter applied.
              </div>
            )}

            <FilterBar params={params} onChange={setParams} />

            {error && (
              <div className={styles.errorBanner}>
                API note: {error} — showing demo data.
              </div>
            )}

            {loading ? (
              <div className={styles.loading}>
                <div className={styles.spinner} />
                {params.mode === 'confluence'
                  ? 'Fetching contracts from USASpending → resolving tickers → checking Form 4s…'
                  : 'Scanning SEC EDGAR for open-market Form 4 purchases…'}
              </div>
            ) : filteredSignals.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>◌</div>
                No signals match current filters
              </div>
            ) : (
              <>
                <div className={styles.resultsMeta}>
                  {filteredSignals.length} signal{filteredSignals.length !== 1 ? 's' : ''} ·
                  sorted by score ·
                  {source === 'demo' || source === 'demo-fallback' ? ' demo data' : ' live data'}
                </div>
                <div className={styles.signals}>
                  {filteredSignals.map(s => (
                    <SignalCard
                      key={s.ticker}
                      signal={s}
                      inWatchlist={watchlist.includes(s.ticker)}
                      onToggleWatch={toggleWatch}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {tab === 'backtest' && <BacktestTab params={params} onChange={setParams} />}
        {tab === 'export'   && <ExportTab watchlist={watchlist} signals={signals} onRemoveWatch={removeWatch} />}
        {tab === 'settings' && <SettingsTab />}
      </main>
    </div>
  )
}
