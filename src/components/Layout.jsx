import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
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
  const location = useLocation();

  return (
    <div className="app-root">
      {/* PC：常時表示の左サイドバー */}
      <div className="desktop-sidebar">
        <div className="desktop-sidebar-head">
          <div className="logo-mark">FP<br />日報</div>
          <div>
            <div className="fw8" style={{ fontSize: '.84rem' }}>{user?.name || '---'}</div>
            <div style={{ fontSize: '.68rem', color: 'var(--sub)' }}>FP 日報アプリ</div>
          </div>
        </div>
        {isAdmin && <div className="badge b-orange" style={{ margin: '0 16px 10px', display: 'inline-block' }}>管理者ログイン中</div>}
        <div className="desktop-sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <Link key={item.to} to={item.to} className={`desktop-nav-item${location.pathname === item.to ? ' active' : ''}`}>
              <span style={{ fontSize: '1.05rem' }}>{item.icon}</span>{item.label}
            </Link>
          ))}
          <div className="desktop-sidebar-divider" />
          <Link to="/admin-login" className={`desktop-nav-item${location.pathname === '/admin-login' ? ' active' : ''}`}>
            <span style={{ fontSize: '1.05rem' }}>🔐</span>管理者ログイン
          </Link>
          {isAdmin && (
            <Link to="/admin" className={`desktop-nav-item${location.pathname === '/admin' ? ' active' : ''}`}>
              <span style={{ fontSize: '1.05rem' }}>🛡️</span>管理者画面
            </Link>
          )}
        </div>
      </div>

      {/* メインエリア（PC・スマホ共通） */}
      <div className="app-shell">
        <div className="hdr">
          <div className="logo">
            <div className="logo-mark mobile-only-mark">FP<br />日報</div>
            <h1>{title}</h1>
          </div>
          <div className="hdr-right">
            {isAdmin && <span className="badge b-orange mobile-only">管理者ログイン中</span>}
            {showBack && (
              <button className="btn-back" onClick={() => navigate(-1)}>← 戻る</button>
            )}
            <button className="btn-menu mobile-only" onClick={() => setOpen(!open)}>
              <span /><span /><span />
            </button>
          </div>
        </div>

        {/* スマホ：スライド式メニュー */}
        {open && (
          <>
            <div className="mobile-overlay" onClick={() => setOpen(false)} />
            <div className="mobile-sidebar">
              <div style={{ background: 'var(--grad)', padding: '20px 16px 16px', color: '#fff' }}>
                <div className="fw8">{user?.name || '---'}</div>
                <div style={{ fontSize: '.68rem', opacity: 0.85, marginTop: 2 }}>FP 日報アプリ</div>
              </div>
              <div style={{ padding: '10px 0' }}>
                {NAV_ITEMS.map((item) => (
                  <Link key={item.to} to={item.to} onClick={() => setOpen(false)} className="mobile-nav-item">
                    <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>{item.label}
                  </Link>
                ))}
                <div style={{ height: 1, background: 'var(--border)', margin: '6px 14px' }} />
                <Link to="/admin-login" onClick={() => setOpen(false)} className="mobile-nav-item">
                  <span style={{ fontSize: '1.1rem' }}>🔐</span>管理者ログイン
                </Link>
              </div>
            </div>
          </>
        )}

        <div className="body">{children}</div>
      </div>
    </div>
  );
}
