import { Navigate, Outlet, RouterProvider, createBrowserRouter, useLocation } from 'react-router-dom';
import { routes } from './routes';
import { useAuth } from '../lib/auth';
import './App.css';

const PUBLIC_PATHS = ['/login', '/auth/callback', '/signup'];

function AuthGate() {
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  if (!isAuthenticated && !PUBLIC_PATHS.includes(pathname)) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

const router = createBrowserRouter([{ element: <AuthGate />, children: routes }]);

export function App() {
  return <RouterProvider router={router} />;
}
