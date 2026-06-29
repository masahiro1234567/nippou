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
import AdminLogin from './pages/AdminLogin';
import ComingSoon from './pages/ComingSoon';

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
      <Route path="/kpi" element={<RequireAuth><ComingSoon title="KPI管理" /></RequireAuth>} />
      <Route path="/personal" element={<RequireAuth><ComingSoon title="個人実績" /></RequireAuth>} />
      <Route path="/admin-login" element={<RequireAuth><AdminLogin /></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth><ComingSoon title="管理者画面" /></RequireAuth>} />
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
