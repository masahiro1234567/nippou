import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import Layout from '../components/Layout';

export default function AdminLogin() {
  const { isAdmin, adminLogin, adminLogout } = useAuth();
  const showToast = useToast();
  const navigate = useNavigate();
  const [pw, setPw] = useState('');

  function handleLogin() {
    try {
      adminLogin(pw);
      showToast('✅ 管理者ログインしました');
    } catch (e) {
      showToast(e.message);
    }
  }

  return (
    <Layout title="管理者ログイン" showBack>
      <div style={{ textAlign: 'center', padding: '22px 0' }}>
        <div style={{ fontSize: '2rem', marginBottom: 7 }}>🔐</div>
        <div className="fw8">管理者専用</div>
      </div>
      {!isAdmin ? (
        <div className="card">
          <div className="form-group">
            <label>パスワード</label>
            <input className="inp" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <button className="btn btn-p" onClick={handleLogin}>ログイン</button>
        </div>
      ) : (
        <div className="card">
          <div style={{ color: 'var(--green)', fontWeight: 800, marginBottom: 8 }}>✅ 管理者ログイン中</div>
          <button className="btn btn-p" onClick={() => navigate('/admin')}>管理者画面へ</button>
          <button className="btn btn-gray" onClick={adminLogout}>ログアウト</button>
        </div>
      )}
    </Layout>
  );
}
