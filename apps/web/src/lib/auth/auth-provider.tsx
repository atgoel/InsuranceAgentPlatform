import { createContext, useContext, useState, ReactNode } from 'react';
import { Session, getSession, setSession, clearSession } from './session';

interface AuthContextType {
  session: Session | undefined;
  setSession(session: Session): void;
  clearSession(): void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSessionState] = useState<Session | undefined>(() => getSession());

  const handleSetSession = (newSession: Session) => {
    setSession(newSession);
    setSessionState(newSession);
  };

  const handleClearSession = () => {
    clearSession();
    setSessionState(undefined);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        setSession: handleSetSession,
        clearSession: handleClearSession,
        isAuthenticated: !!session,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
