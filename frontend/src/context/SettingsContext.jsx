import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import api from '../services/api'
import { useAuth } from './AuthContext'
import { setCurrencySymbol } from '../utils/format'

const SettingsContext = createContext(null)

function normalise(rows) {
  if (!Array.isArray(rows)) return {}
  return rows.reduce((acc, { key, value }) => {
    acc[key] = value
    return acc
  }, {})
}

export function SettingsProvider({ children }) {
  const { user, loading: authLoading } = useAuth()
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const fetchedRef = useRef(false)

  const fetchSettings = useCallback(async () => {
    try {
      const res = await api.get('/api/settings')
      const data = normalise(res.data?.data ?? res.data)
      if (data.currency_symbol) setCurrencySymbol(data.currency_symbol)
      setSettings(data)
    } catch {
      // non-fatal — keep stale values
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      // Logged out — reset so next login triggers a fresh fetch
      fetchedRef.current = false
      setSettings({})
      setLoading(false)
      return
    }
    if (!fetchedRef.current) {
      fetchedRef.current = true
      fetchSettings()
    }
  }, [user, authLoading, fetchSettings])

  /** Call this after any settings save to propagate the change everywhere. */
  const refreshSettings = useCallback(() => {
    return fetchSettings()
  }, [fetchSettings])

  /**
   * Optimistically update a single setting key in local state immediately,
   * without waiting for a server round-trip. Useful after a successful save.
   */
  const updateSetting = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }, [])

  return (
    <SettingsContext.Provider value={{ settings, loading, refreshSettings, updateSetting }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>')
  return ctx
}
