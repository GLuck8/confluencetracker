import { useState, useEffect } from 'react'
import styles from './SettingsTab.module.css'

export default function SettingsTab() {
  const [history, setHistory] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/alert-history')
      .then(r => r.json())
      .then(d => { setHistory(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className={styles.wrap}>

      {/* Alert status */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>Daily alerts</div>
        {loading ? (
          <div className={styles.loading}>Checking alert status…</div>
        ) : history?.configured ? (
          <div className={styles.statusRow}>
            <span className={styles.statusDot} style={{ background: 'var(--green)' }} />
            <span>Alerts active · last run {history.lastRun ? new Date(history.lastRun).toLocaleString() : '—'}</span>
            <span className={styles.seenCount}>{history.seenCount} signals tracked</span>
          </div>
        ) : (
          <div className={styles.notConfigured}>
            Alerts not yet configured — follow the setup steps below.
          </div>
        )}

        {history?.history?.length > 0 && (
          <table className={styles.histTable}>
            <thead>
              <tr><th>Date</th><th>Total signals</th><th>New signals</th></tr>
            </thead>
            <tbody>
              {history.history.map((h, i) => (
                <tr key={i}>
                  <td>{h.date}</td>
                  <td>{h.signalCount}</td>
                  <td style={{ color: h.newCount > 0 ? 'var(--green-text)' : 'inherit', fontWeight: h.newCount > 0 ? 600 : 400 }}>
                    {h.newCount > 0 ? `+${h.newCount}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Setup guide */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>Alert setup</div>
        <p className={styles.intro}>
          The app checks for new signals daily at 7am UTC and emails you when new ones appear.
          No database needed — state is stored in Vercel KV (free tier).
          Emails sent via Resend (free tier: 3,000/month).
        </p>

        <div className={styles.steps}>
          <div className={styles.step}>
            <div className={styles.stepNum}>1</div>
            <div>
              <div className={styles.stepTitle}>Create a Vercel KV store</div>
              <div className={styles.stepDesc}>
                In your Vercel dashboard → Storage → Create Database → KV.
                Name it anything (e.g. <code>confluence-kv</code>).
                Connect it to your project. Vercel automatically adds the
                <code>KV_REST_API_URL</code> and <code>KV_REST_API_TOKEN</code> env vars.
              </div>
            </div>
          </div>

          <div className={styles.step}>
            <div className={styles.stepNum}>2</div>
            <div>
              <div className={styles.stepTitle}>Get a Resend API key</div>
              <div className={styles.stepDesc}>
                Sign up at <a href="https://resend.com" target="_blank" rel="noopener">resend.com</a> (free).
                Create an API key. Add your sending domain (or use their sandbox domain for testing).
                Add <code>RESEND_API_KEY</code> to your Vercel environment variables.
              </div>
            </div>
          </div>

          <div className={styles.step}>
            <div className={styles.stepNum}>3</div>
            <div>
              <div className={styles.stepTitle}>Set your alert email and cron secret</div>
              <div className={styles.stepDesc}>
                In Vercel → Project Settings → Environment Variables, add:
                <ul className={styles.envList}>
                  <li><code>ALERT_EMAIL</code> — your email address</li>
                  <li><code>CRON_SECRET</code> — any random string (e.g. generate one at random.org)</li>
                </ul>
                Then update <code>vercel.json</code> to replace <code>REPLACE_WITH_YOUR_CRON_SECRET</code>
                with the same value.
              </div>
            </div>
          </div>

          <div className={styles.step}>
            <div className={styles.stepNum}>4</div>
            <div>
              <div className={styles.stepTitle}>Update the from address in cron.js</div>
              <div className={styles.stepDesc}>
                In <code>api/cron.js</code>, update the <code>from</code> field in the Resend call
                to use your verified domain: <code>alerts@yourdomain.com</code>.
                Resend's docs cover domain verification (it's just two DNS records).
              </div>
            </div>
          </div>

          <div className={styles.step}>
            <div className={styles.stepNum}>5</div>
            <div>
              <div className={styles.stepTitle}>Deploy and test</div>
              <div className={styles.stepDesc}>
                Push to GitHub → Vercel auto-deploys. To test manually, call:
                <code className={styles.codeBlock}>
                  GET /api/cron?secret=YOUR_CRON_SECRET
                </code>
                The cron runs automatically at 7am UTC daily (configurable in <code>vercel.json</code>).
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Data sources */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>Data sources</div>
        <div className={styles.sourceGrid}>
          <div className={styles.source}>
            <div className={styles.sourceName}>SEC EDGAR (Form 4)</div>
            <div className={styles.sourceDesc}>
              Free · No auth required · Real-time<br />
              <a href="https://www.sec.gov/cgi-bin/browse-edgar" target="_blank" rel="noopener">sec.gov</a> ·
              <a href="https://data.sec.gov/submissions/" target="_blank" rel="noopener">data.sec.gov</a>
            </div>
          </div>
          <div className={styles.source}>
            <div className={styles.sourceName}>USASpending.gov</div>
            <div className={styles.sourceDesc}>
              Free · No auth required · Updated daily<br />
              <a href="https://api.usaspending.gov" target="_blank" rel="noopener">api.usaspending.gov</a>
            </div>
          </div>
          <div className={styles.source}>
            <div className={styles.sourceName}>EDGAR Ticker Index</div>
            <div className={styles.sourceDesc}>
              Maps tickers → CIKs for all listed US companies<br />
              <a href="https://data.sec.gov/files/company_tickers.json" target="_blank" rel="noopener">company_tickers.json</a>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.disclaimer}>
        ⚠ Research tool only. Nothing here constitutes financial advice.
        All trading decisions are your own responsibility.
      </div>
    </div>
  )
}
