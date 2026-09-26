import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import api from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('mb_user')
    return raw ? JSON.parse(raw) : null
  })
  const [loading, setLoading] = useState(!!localStorage.getItem('mb_token'))

  useEffect(() => {
    const token = localStorage.getItem('mb_token')
    if (!token) {
      setLoading(false)
      return
    }
    api
      .get('/auth/me')
      .then((res) => {
        setUser(res.data)
        localStorage.setItem('mb_user', JSON.stringify(res.data))
      })
      .catch(() => {
        localStorage.removeItem('mb_token')
        localStorage.removeItem('mb_user')
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      async login(email, password) {
        const { data } = await api.post('/auth/login', { email, password })
        localStorage.setItem('mb_token', data.access_token)
        const me = await api.get('/auth/me')
        setUser(me.data)
        localStorage.setItem('mb_user', JSON.stringify(me.data))
        return me.data
      },
      async loginWithGoogle(idToken) {
        const { data } = await api.post('/auth/google', { id_token: idToken })
        localStorage.setItem('mb_token', data.access_token)
        const me = await api.get('/auth/me')
        setUser(me.data)
        localStorage.setItem('mb_user', JSON.stringify(me.data))
        return me.data
      },
      logout() {
        localStorage.removeItem('mb_token')
        localStorage.removeItem('mb_user')
        setUser(null)
      },
      hasRole(...roles) {
        return user && roles.includes(user.role)
      },
    }),
    [user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
