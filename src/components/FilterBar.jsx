import styles from './FilterBar.module.css'

export default function FilterBar({ params, onChange }) {
  const set = (key, val) => onChange({ ...params, [key]: val })
  const isForm4 = params.mode === 'form4'

  return (
    <div className={styles.bar}>
      <div className={styles.group}>
        <label className={styles.label}>Min insider buy</label>
        <select value={params.minInsiderBuy} onChange={e => set('minInsiderBuy', +e.target.value)}>
          {[25_000, 50_000, 100_000, 250_000, 500_000].map(v => (
            <option key={v} value={v}>${v.toLocaleString()}</option>
          ))}
        </select>
      </div>

      {!isForm4 && (
        <div className={styles.group}>
          <label className={styles.label}>Min contract value</label>
          <select value={params.minContractVal} onChange={e => set('minContractVal', +e.target.value)}>
            {[1e6, 5e6, 25e6, 1e8, 5e8].map(v => (
              <option key={v} value={v}>${(v/1e6).toFixed(0)}M+</option>
            ))}
          </select>
        </div>
      )}

      <div className={styles.group}>
        <label className={styles.label}>Min score</label>
        <select value={params.minScore} onChange={e => set('minScore', +e.target.value)}>
          {[0, 20, 35, 50, 65, 75].map(v => (
            <option key={v} value={v}>{v === 0 ? 'Any' : `${v}+`}</option>
          ))}
        </select>
      </div>

      <div className={styles.group}>
        <label className={styles.label}>Cluster threshold</label>
        <select value={params.clusterMin} onChange={e => set('clusterMin', +e.target.value)}>
          {[1, 2, 3, 4].map(v => (
            <option key={v} value={v}>{v === 1 ? 'Any' : `${v}+ insiders`}</option>
          ))}
        </select>
      </div>

      <div className={styles.group}>
        <label className={styles.label}>Lookback</label>
        <select value={params.daysBack} onChange={e => set('daysBack', +e.target.value)}>
          {[7, 14, 30, 60, 90].map(v => (
            <option key={v} value={v}>{v}d</option>
          ))}
        </select>
      </div>
    </div>
  )
}
