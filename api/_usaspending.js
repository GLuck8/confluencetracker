/**
 * _usaspending.js  —  USASpending.gov API helpers
 *
 * Free, no auth. Returns contract awards with recipient info
 * that we resolve to tickers via the EDGAR ticker index.
 */

const BASE = 'https://api.usaspending.gov'

/**
 * Fetch recent large contract awards.
 * Returns raw USASpending results.
 */
export async function fetchAwards({ startDate, endDate, minVal = 5_000_000, limit = 100 }) {
  const body = {
    filters: {
      time_period: [{ start_date: startDate, end_date: endDate }],
      award_type_codes: ['A', 'B', 'C', 'D'], // definitive contracts only
      award_amounts: [{ lower_bound: minVal }],
    },
    fields: [
      'Award ID',
      'Recipient Name',
      'recipient_uei',
      'Award Amount',
      'Awarding Agency',
      'Awarding Sub Agency',
      'Start Date',
      'naics_code',
      'naics_description',
      'Place of Performance State Code',
    ],
    sort: 'Award Amount',
    order: 'desc',
    limit,
    page: 1,
  }

  const res = await fetch(`${BASE}/api/v2/search/spending_by_award/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`USASpending error ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  return data.results ?? []
}

/**
 * Lookup a recipient's ticker using USASpending's recipient profile,
 * which sometimes includes a DUNS/UEI that can be cross-referenced.
 * (Supplementary — primary resolution goes through EDGAR ticker index)
 */
export async function fetchRecipientProfile(uei) {
  if (!uei) return null
  try {
    const res = await fetch(`${BASE}/api/v2/recipient/${uei}/`, {
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
