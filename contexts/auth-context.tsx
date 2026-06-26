'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { DEMO_USER, type DemoUser } from '@/lib/demo-user'

interface AuthContextValue {
  user: DemoUser
  isAuthenticated: true
  isLoading: false
}

const AuthContext = createContext<AuthContextValue>({
  user: DEMO_USER,
  isAuthenticated: true,
  isLoading: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider value={{ user: DEMO_USER, isAuthenticated: true, isLoading: false }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useUser = () => useContext(AuthContext)
