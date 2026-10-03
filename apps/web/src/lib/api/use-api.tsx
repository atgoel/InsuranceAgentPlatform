import { createContext, useContext, ReactNode } from 'react';
import { ApiClient } from './api-client';

const ApiContext = createContext<ApiClient | undefined>(undefined);

export interface ApiProviderProps {
  client: ApiClient;
  children: ReactNode;
}

export function ApiProvider({ client, children }: ApiProviderProps) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) {
    throw new Error('useApi must be used inside ApiProvider');
  }
  return client;
}
