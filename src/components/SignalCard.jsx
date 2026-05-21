import { useState } from 'react'
import ScoreRing from './ScoreRing'
import { fmtMoney, fmtDate, scoreColor, scoreBg, scoreLabel } from '../lib/utils'
import styles from './SignalCard.module.css'

export default function SignalCard({ signal: s, inWatchlist, onToggleWatch }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`${styles.card} ${expanded ? styles.open : ''}`}>
      <div className={styles.main} onClick={() => setExpanded(e => !e)}>
        <div className={styles.left}>
          <div className={styles.ticker}>
            {s.ticker}
            {s._demo && <span className={styles.demoBadge}>demo</span>}
          </div>
          <div className={styles.company}>{s.company}</div>
        </div>

        <div className={styles.pills}>
          <span className={`${styles.pill} ${styles.insider}`}>
            {s.isCluster ? `${s.insiderFilings}× cluster buy` : 'Insider buy'} {fmtMoney(s.insiderBuyTotal)}
          </span>
          <span className={`${styles.pill} ${styles.contract}`}>
            {s.contractAgency?.replace('Dept of ', '')} {fmtMoney(s.contractValue)}
          </span>
        </div>

        <div className={styles.meta}>
          <div>
            <div className={styles.metaLabel}>Contract agency</div>
            <div className={styles.metaVal}>{s.contractAgency}</div>
          </div>
          <div>
            <div className={styles.metaLabel}>Days apart</div>
            <div className={styles.metaVal}>{s.daysApart}d</div>
          </div>
          <div>
            <div className={styles.metaLabel}>NAICS</div>
            <div className={styles.metaVal}>{s.naicsCode || '—'}</div>
          </div>
        </div>

        <div className={styles.right}>
          <ScoreRing score={s.score} />
          <div className={styles.scoreLabel} style={{ color: scoreColor(s.score) }}>
            {scoreLabel(s.score)}
          </div>
        </div>
      </div>

      {expanded && (
        <div className={styles.detail}>
          <div className={styles.detailGrid}>
            <div className={styles.detailSection}>
              <div className={styles.detailTitle}>Contract details</div>
              <dl className={styles.dl}>
                <dt>Agency</dt><dd>{s.contractAgency}</dd>
                {s.contractSubAgency && <><dt>Sub-agency</dt><dd>{s.contractSubAgency}</dd></>}
                <dt>Value</dt><dd>{fmtMoney(s.contractValue)}</dd>
                <dt>Award date</dt><dd>{fmtDate(s.contractDate)}</dd>
                <dt>NAICS</dt><dd>{s.naicsCode} — {s.naicsDescription || '—'}</dd>
              </dl>
            </div>

            <div className={styles.detailSection}>
              <div className={styles.detailTitle}>Insider activity</div>
              <dl className={styles.dl}>
                <dt>Filings (Form 4)</dt><dd>{s.insiderFilings}</dd>
                <dt>Total estimated buy</dt><dd>{fmtMoney(s.insiderBuyTotal)}</dd>
                <dt>Latest filing</dt><dd>{fmtDate(s.insiderLatestDate)}</dd>
                <dt>Cluster buy</dt><dd>{s.isCluster ? 'Yes ✓' : 'No'}</dd>
                <dt>Days apart</dt><dd>{s.daysApart} days between signals</dd>
              </dl>
            </div>
          </div>

          <div className={styles.detailFooter}>
            <button
              className={`${styles.btn} ${inWatchlist ? styles.watching : ''}`}
              onClick={e => { e.stopPropagation(); onToggleWatch(s.ticker) }}
            >
              {inWatchlist ? '★ In watchlist' : '☆ Add to watchlist'}
            </button>
            <a
              className={styles.btnLink}
              href={`https://www.secform4.com/insider-trading/${s.ticker}.htm`}
              target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
            >
              View Form 4s →
            </a>
            <a
              className={styles.btnLink}
              href={`https://www.usaspending.gov/recipient/${s.ticker}`}
              target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
            >
              USASpending →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
