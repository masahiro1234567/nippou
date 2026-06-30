import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import Login from './pages/Login';
import Home from './pages/Home';
import ReportForm from './pages/ReportForm';
import ReportList from './pages/ReportList';
import ReportDetail from './pages/ReportDetail';
import Stats from './pages/Stats';
import Stores from './pages/Stores';
import Kpi from './pages/Kpi';
import Personal from './pages/Personal';
import AdminLogin from './pages/AdminLogin';
import Admin from './pages/Admin';

function RequireAuth({ children }) {
  const { user, authReady } = useAuth();
  if (!authReady) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
      <Route path="/report/new" element={<RequireAuth><ReportForm /></RequireAuth>} />
      <Route path="/report/edit/:id" element={<RequireAuth><ReportForm /></RequireAuth>} />
      <Route path="/reports" element={<RequireAuth><ReportList /></RequireAuth>} />
      <Route path="/reports/:id" element={<RequireAuth><ReportDetail /></RequireAuth>} />
      <Route path="/stats" element={<RequireAuth><Stats /></RequireAuth>} />
      <Route path="/stores" element={<RequireAuth><Stores /></RequireAuth>} />
      <Route path="/kpi" element={<RequireAuth><Kpi /></RequireAuth>} />
      <Route path="/personal" element={<RequireAuth><Personal /></RequireAuth>} />
      <Route path="/admin-login" element={<RequireAuth><AdminLogin /></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
