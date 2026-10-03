import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { routes } from './routes';
import { useAuth } from '../lib/auth';
import { DevLogin } from '../lib/auth';
import './App.css';

const router = createBrowserRouter(routes);

export function App() {
  const { isAuthenticated } = useAuth();

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <DevLogin />;
  }

  return <RouterProvider router={router} />;
}
