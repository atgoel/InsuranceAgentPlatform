/// <reference types="vite/client" />
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import { AuthProvider } from './lib/auth';
import { I18nProvider } from './lib/i18n';
import { ApiProvider, FetchApiClient } from './lib/api';
import { ToastProvider } from './design-system';
import './design-system/theme.css';

// Initialize API client
const apiClient = new FetchApiClient({
  // Request paths already start with /api/v1, and URL() needs an absolute base.
  baseUrl: (import.meta.env.VITE_API_URL as string | undefined) || window.location.origin,
  getToken: () => {
    try {
      const session = JSON.parse(sessionStorage.getItem('iap_session') || '{}');
      return session.token;
    } catch {
      return undefined;
    }
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AuthProvider>
      <I18nProvider>
        <ApiProvider client={apiClient}>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ApiProvider>
      </I18nProvider>
    </AuthProvider>
  </React.StrictMode>,
);
