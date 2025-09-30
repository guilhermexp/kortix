"use client"

import {
  createContext,
  type ReactNode,
  useContext,
} from "react"
import { useSession } from "./auth"

interface AuthContextType {
  session: {
    token: string
    expiresAt: string
    organizationId: string
  } | null
  user: {
    id: string
    email: string
    name: string | null
    isAnonymous: boolean
  } | null
  org: {
    id: string
    slug: string
    name: string
  } | null
  setActiveOrg: (orgSlug: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data } = useSession()

  async function setActiveOrg() {
    // Single-organization setup, nothing to switch.
    return Promise.resolve()
  }

  const user = data?.user
    ? {
        ...data.user,
        isAnonymous: false,
      }
    : null

  return (
    <AuthContext.Provider
      value={{
        session: data?.session ?? null,
        user,
        org: data?.organization ?? null,
        setActiveOrg,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
