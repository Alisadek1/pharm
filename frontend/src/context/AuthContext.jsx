import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]           = useState(null)
  const [permissions, setPerms]   = useState([])
  const [loading, setLoading]     = useState(true)

  const fetchMe = useCallback(async () => {
    try {
      const res = await api.get('/api/users/me')
      setUser(res.data.data)
      setPerms(res.data.data.permissions || [])
    } catch {
      setUser(null)
      setPerms([])
    }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (token) {
      fetchMe().finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [fetchMe])

  const login = async (username, password) => {
    const res = await api.post('/api/auth/login', { username, password })
    const { access_token, refresh_token, user: userData } = res.data.data
    localStorage.setItem('access_token', access_token)
    localStorage.setItem('refresh_token', refresh_token)
    api.defaults.headers.common.Authorization = `Bearer ${access_token}`
    await fetchMe()
    return userData
  }

  const logout = async () => {
    try { await api.post('/api/auth/logout') } catch {}
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    delete api.defaults.headers.common.Authorization
    setUser(null)
    setPerms([])
  }

  const can = (permission) => permissions.includes(permission)

  return (
    <AuthContext.Provider value={{ user, permissions, loading, login, logout, can, fetchMe }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
