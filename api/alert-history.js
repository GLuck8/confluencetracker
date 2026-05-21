/**
 * /api/alert-history.js
 *
 * Returns cron run history and seen signal count from Vercel KV.
 * Used by the Settings tab in the UI.
 */

import { kv } from '@vercel/kv'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Return empty state if KV isn't configured (local dev / no env vars)
  if (!process.env.KV_REST_API_URL) {
    return res.status(200).json({
      configured: false,
      history: [],
      seenCount: 0,
      lastRun: null,
    })
  }

  try {
    const [history, lastRun, seen] = await Promise.all([
      kv.get('signals:history'),
      kv.get('signals:lastrun'),
      kv.get('signals:seen'),
    ])

    return res.status(200).json({
      configured: true,
      history: history ?? [],
      seenCount: Array.isArray(seen) ? seen.length : 0,
      lastRun: lastRun ?? null,
    })
  } catch (err) {
    return res.status(200).json({
      configured: false,
      history: [],
      seenCount: 0,
      lastRun: null,
      error: err.message,
    })
  }
}
