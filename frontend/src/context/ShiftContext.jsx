import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import api from '../services/api'
import { useAuth } from './AuthContext'

const ShiftContext = createContext(null)

export function ShiftProvider({ children }) {
  const { user } = useAuth()
  const [activeShift, setActiveShift]   = useState(null)
  const [shiftLoading, setShiftLoading] = useState(true)

  const refreshShift = useCallback(async () => {
    try {
      const res = await api.get('/api/shifts/current')
      setActiveShift(res.data?.data || null)
    } catch {
      setActiveShift(null)
    } finally {
      setShiftLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) {
      setShiftLoading(true)
      refreshShift()
    } else {
      setActiveShift(null)
      setShiftLoading(false)
    }
  }, [user, refreshShift])

  return (
    <ShiftContext.Provider value={{ activeShift, shiftLoading, refreshShift, setActiveShift }}>
      {children}
    </ShiftContext.Provider>
  )
}

export const useShift = () => useContext(ShiftContext)
