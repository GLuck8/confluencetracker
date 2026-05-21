import { useState, useEffect, useCallback, useRef } from 'react'

export function useSignals(params) {
  const [signals,   setSignals]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [source,    setSource]    = useState(null)
  const [fetchedAt, setFetchedAt] = useState(null)
  const abortRef = useRef(null)

  const fetch_ = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({
        mode:          params.mode,
        minInsiderBuy: params.minInsiderBuy,
        minContractVal:params.minContractVal,
        minScore:      params.minScore,
        daysBack:      params.daysBack,
      })
      const res  = await fetch(`/api/signals?${qs}`, { signal: abortRef.current.signal })
      const data = await res.json()
      setSignals(data.signals ?? [])
      setSource(data.source)
      setFetchedAt(data.fetchedAt)
      if (data.error) setError(data.error)
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [params.mode, params.minInsiderBuy, params.minContractVal, params.minScore, params.daysBack])

  useEffect(() => { fetch_() }, [fetch_])

  return { signals, loading, error, source, fetchedAt, refetch: fetch_ }
}

export function useBacktest(params) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const qs = new URLSearchParams({
          holdDays:      params.holdDays      ?? 60,
          minScore:      params.minScore      ?? 30,
          clusterMin:    params.clusterMin    ?? 2,
          minInsiderBuy: params.minInsiderBuy ?? 50_000,
          minContractVal:params.minContractVal?? 5_000_000,
          maxPositions:  params.maxPositions  ?? 5,
          startCapital:  params.startCapital  ?? 10_000,
        })
        const res  = await fetch(`/api/backtest?${qs}`)
        const json = await res.json()
        setData(json)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }, 400)
    return () => clearTimeout(timerRef.current)
  }, [
    params.holdDays, params.minScore, params.clusterMin,
    params.minInsiderBuy, params.minContractVal,
    params.maxPositions, params.startCapital,
  ])

  return { data, loading, error }
}
