export function fmtMoney(n) {
  if (n == null) return '—'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n}`
}

export function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' })
}

export function scoreColor(score) {
  if (score >= 70) return 'var(--green)'
  if (score >= 45) return 'var(--amber)'
  return 'var(--red)'
}

export function scoreBg(score) {
  if (score >= 70) return 'var(--green-bg)'
  if (score >= 45) return 'var(--amber-bg)'
  return 'var(--red-bg)'
}

export function scoreLabel(score) {
  if (score >= 70) return 'Strong'
  if (score >= 45) return 'Moderate'
  return 'Weak'
}

// Generate CSV content from an array of objects
export function toCSV(rows) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.join(','), ...rows.map(r =>
    headers.map(h => {
      const v = r[h] ?? ''
      return typeof v === 'string' && v.includes(',') ? `"${v}"` : v
    }).join(',')
  )]
  return lines.join('\n')
}

export function downloadCSV(filename, rows) {
  const csv = toCSV(rows)
  const a = document.createElement('a')
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
  a.download = filename
  a.click()
}

export function today() {
  return new Date().toISOString().slice(0, 10)
}
