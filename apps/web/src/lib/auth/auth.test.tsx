import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getSession, setSession, clearSession } from './session';
import { AuthProvider, useAuth } from './auth-provider';

describe('AC-M00-32 Auth session', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('gets session from sessionStorage', () => {
    const session = { token: 'test', tenantId: 'ten1', roles: ['agent'] };
    setSession(session);
    expect(getSession()).toEqual(session);
  });

  it('sets session in sessionStorage', () => {
    const session = { token: 'test', tenantId: 'ten1', roles: ['agent'] };
    setSession(session);
    const stored = JSON.parse(sessionStorage.getItem('iap_session') || '{}');
    expect(stored).toEqual(session);
  });

  it('clears session from sessionStorage', () => {
    const session = { token: 'test', tenantId: 'ten1', roles: ['agent'] };
    setSession(session);
    clearSession();
    expect(getSession()).toBeUndefined();
  });

  it('tolerates sessionStorage throwing on get', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage error');
    });
    expect(getSession()).toBeUndefined();
    spy.mockRestore();
  });

  it('tolerates sessionStorage throwing on set', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage error');
    });
    expect(() => setSession({ token: 'x', tenantId: 't', roles: [] })).not.toThrow();
    spy.mockRestore();
  });
});

describe('AC-M00-32 AuthProvider', () => {
  function TestComponent() {
    const { session, isAuthenticated } = useAuth();
    return (
      <div>
        <div data-testid="auth">{isAuthenticated ? 'authenticated' : 'not authenticated'}</div>
        {session && <div data-testid="tenant">{session.tenantId}</div>}
      </div>
    );
  }

  it('provides session context', () => {
    sessionStorage.clear();
    sessionStorage.setItem('iap_session', JSON.stringify({
      token: 'test',
      tenantId: 'ten1',
      roles: ['agent'],
    }));
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );
    expect(screen.getByTestId('auth')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('tenant')).toHaveTextContent('ten1');
  });

  it('initializes with no session', () => {
    sessionStorage.clear();
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );
    expect(screen.getByTestId('auth')).toHaveTextContent('not authenticated');
  });

  it('useAuth hook works', () => {
    function UseAuthTest() {
      const { setSession } = useAuth();
      return (
        <button onClick={() => setSession({ token: 'x', tenantId: 't', roles: ['admin'] })}>
          Set
        </button>
      );
    }
    render(
      <AuthProvider>
        <UseAuthTest />
      </AuthProvider>,
    );
    expect(screen.getByText('Set')).toBeInTheDocument();
  });
});
