import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const NAV_ITEMS = [
  { to: '/', icon: '🏠', label: 'ホーム' },
  { to: '/report/new', icon: '📝', label: '日報登録' },
  { to: '/reports', icon: '📂', label: '日報確認' },
  { to: '/stats', icon: '📊', label: '実績確認' },
  { to: '/stores', icon: '🏪', label: '店舗特徴' },
  { to: '/kpi', icon: '🎯', label: 'KPI' },
  { to: '/personal', icon: '📈', label: '個人実績' },
];

export default function Layout({ title, showBack, children }) {
  const [open, setOpen] = useState(false);
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <div className="hdr">
        <div className="logo">
          <div className="logo-mark">FP<br />日報</div>
          <h1>{title}</h1>
        </div>
        <div className="hdr-right">
          {isAdmin && <span className="badge b-orange">管理者ログイン中</span>}
          {showBack && (
            <button className="btn-back" onClick={() => navigate(-1)}>← 戻る</button>
          )}
          <button className="btn-menu" onClick={() => setOpen(!open)}>
            <span /><span /><span />
          </button>
        </div>
      </div>

      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(10,15,30,.4)', zIndex: 290 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: 'fixed', top: 0, left: 0, bottom: 0, width: 240, background: '#fff',
              zIndex: 300, boxShadow: '4px 0 24px rgba(37,99,235,.13)', overflowY: 'auto',
            }}
          >
            <div style={{ background: 'var(--grad)', padding: '20px 16px 16px', color: '#fff' }}>
              <div className="fw8">{user?.name || '---'}</div>
              <div style={{ fontSize: '.68rem', opacity: 0.85, marginTop: 2 }}>FP 日報アプリ</div>
            </div>
            <div style={{ padding: '10px 0' }}>
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px',
                    fontSize: '.86rem', fontWeight: 600, color: 'var(--sub)', textDecoration: 'none',
                  }}
                >
                  <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>{item.label}
                </Link>
              ))}
              <div style={{ height: 1, background: 'var(--border)', margin: '6px 14px' }} />
              <Link
                to="/admin-login"
                onClick={() => setOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px',
                  fontSize: '.86rem', fontWeight: 600, color: 'var(--sub)', textDecoration: 'none',
                }}
              >
                <span style={{ fontSize: '1.1rem' }}>🔐</span>管理者ログイン
              </Link>
            </div>
          </div>
        </>
      )}

      <div className="body">{children}</div>
    </div>
  );
}
