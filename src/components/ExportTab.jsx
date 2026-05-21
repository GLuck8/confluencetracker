import { downloadCSV, fmtMoney, fmtDate, today } from '../lib/utils'
import styles from './ExportTab.module.css'

export default function ExportTab({ watchlist, signals, onRemoveWatch }) {
  const watched = signals.filter(s => watchlist.includes(s.ticker))

  function exportIBKR() {
    const rows = watched.map(s => ({
      Action: 'BUY',
      Symbol: s.ticker,
      SecType: 'STK',
      Exchange: 'SMART',
      Currency: 'USD',
    }))
    downloadCSV(`ibkr_watchlist_${today()}.csv`, rows)
  }

  function exportReport() {
    const rows = watched.map(s => ({
      Ticker: s.ticker,
      Company: s.company,
      Score: s.score,
      'Insider buy (est.)': s.insiderBuyTotal,
      'Insider filings': s.insiderFilings,
      'Cluster buy': s.isCluster ? 'Yes' : 'No',
      'Contract value': s.contractValue,
      'Contract agency': s.contractAgency,
      'Contract date': s.contractDate,
      'NAICS code': s.naicsCode,
      'NAICS description': s.naicsDescription,
      'Days apart': s.daysApart,
      'Latest insider date': s.insiderLatestDate,
    }))
    downloadCSV(`signal_report_${today()}.csv`, rows)
  }

  function copyTickers() {
    const text = watched.map(s => s.ticker).join(',')
    navigator.clipboard?.writeText(text)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.disclaimer}>
        ⚠ This tool is for research only. Nothing here is financial advice. You are responsible for all trading decisions. Always verify signals before acting.
      </div>

      <div className={styles.watchSection}>
        <div className={styles.sectionTitle}>
          Watchlist ({watched.length} ticker{watched.length !== 1 ? 's' : ''})
        </div>
        {watched.length === 0 ? (
          <div className={styles.empty}>
            No tickers added yet — expand any signal card on the Signals tab and click "Add to watchlist".
          </div>
        ) : (
          <div className={styles.chips}>
            {watched.map(s => (
              <div key={s.ticker} className={styles.chip}>
                <span className={styles.chipTicker}>{s.ticker}</span>
                <span className={styles.chipScore} style={{ color: s.score >= 70 ? 'var(--green-text)' : 'var(--text2)' }}>
                  {s.score}
                </span>
                <button className={styles.chipRemove} onClick={() => onRemoveWatch(s.ticker)} aria-label={`Remove ${s.ticker}`}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.exportCard}>
        <div className={styles.sectionTitle}>Export</div>

        <div className={styles.exportRow}>
          <div>
            <div className={styles.exportName}>IBKR watchlist</div>
            <div className={styles.exportDesc}>Import into Interactive Brokers: File → Import → Watchlist CSV</div>
          </div>
          <button className={`${styles.btn} ${styles.primary}`} onClick={exportIBKR} disabled={!watched.length}>
            Download .csv
          </button>
        </div>

        <div className={styles.exportRow}>
          <div>
            <div className={styles.exportName}>Full signal report</div>
            <div className={styles.exportDesc}>All signal data — contract details, insider data, scores</div>
          </div>
          <button className={styles.btn} onClick={exportReport} disabled={!watched.length}>
            Download .csv
          </button>
        </div>

        <div className={styles.exportRow}>
          <div>
            <div className={styles.exportName}>Copy tickers</div>
            <div className={styles.exportDesc}>Comma-separated list for any screener or broker search</div>
          </div>
          <button className={styles.btn} onClick={copyTickers} disabled={!watched.length}>
            Copy to clipboard
          </button>
        </div>
      </div>

      <div className={styles.ibkrGuide}>
        <div className={styles.sectionTitle}>How to import into IBKR</div>
        <ol className={styles.steps}>
          <li>Open Trader Workstation (TWS) or IBKR desktop</li>
          <li>Go to <strong>File → Import → Watchlist</strong></li>
          <li>Select the downloaded <code>.csv</code> file</li>
          <li>Tickers will appear in a new watchlist group</li>
          <li>Set price alerts and review each position before trading</li>
        </ol>
      </div>
    </div>
  )
}
