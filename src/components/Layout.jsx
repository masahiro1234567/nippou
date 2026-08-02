import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const NAV_ITEMS = [
  { to: '/', icon: 'ti ti-home', label: 'ホーム' },
  { to: '/report/new', icon: 'ti ti-edit', label: '日報登録' },
  { to: '/reports', icon: 'ti ti-folder', label: '日報確認' },
  { to: '/stats', icon: 'ti ti-chart-bar', label: '実績確認' },
  { to: '/stores', icon: 'ti ti-building-store', label: '店舗特徴' },
  { to: '/kpi', icon: 'ti ti-target', label: 'KPI' },
  { to: '/weekly', icon: 'ti ti-calendar-week', label: '週次まとめ' },
  { to: '/personal', icon: 'ti ti-user', label: '個人実績' },
];

export default function Layout({ title, showBack, children }) {
  const [open, setOpen] = useState(false);
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const initials = user?.name ? user.name.slice(0, 2) : 'FP';

  return (
    <div className="app-root">
      {/* PC：Style Cサイドバー */}
      <div className="desktop-sidebar">
        <div className="desktop-sidebar-head">
          <div className="logo-mark">FP<br />日報</div>
          <div>
            <div style={{ fontSize: '.88rem', fontWeight: 700, color: 'var(--text)' }}>FP日報</div>
            {isAdmin && (
              <span className="badge b-orange" style={{ marginTop: 3, display: 'inline-block' }}>管理者</span>
            )}
          </div>
        </div>
        <div className="desktop-sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`desktop-nav-item${location.pathname === item.to ? ' active' : ''}`}
            >
              <i className={item.icon} style={{ fontSize: '1rem' }} aria-hidden="true" />
              {item.label}
            </Link>
          ))}
          <div className="desktop-sidebar-divider" />
          <Link to="/admin-login" className={`desktop-nav-item${location.pathname === '/admin-login' ? ' active' : ''}`}>
            <i className="ti ti-lock" style={{ fontSize: '1rem' }} aria-hidden="true" />
            管理者ログイン
          </Link>
          {isAdmin && (
            <Link to="/admin" className={`desktop-nav-item${location.pathname === '/admin' ? ' active' : ''}`}>
              <i className="ti ti-shield-check" style={{ fontSize: '1rem' }} aria-hidden="true" />
              管理者画面
            </Link>
          )}
        </div>
        {/* ユーザー情報フッター（Style Cの特徴） */}
        <div className="desktop-sidebar-footer">
          <div className="sidebar-user-avatar">{initials}</div>
          <div>
            <div className="sidebar-user-name">{user?.name || '---'}</div>
            <div className="sidebar-user-role">FP 日報アプリ</div>
          </div>
        </div>
      </div>

      {/* メインエリア */}
      <div className="app-shell">
        <div className="hdr">
          <div className="logo">
            <div className="logo-mark mobile-only-mark">FP<br />日報</div>
            <h1>{title}</h1>
          </div>
          <div className="hdr-right">
            {isAdmin && <span className="badge b-orange mobile-only">管理者</span>}
            {showBack && (
              <button className="btn-back" onClick={() => navigate(-1)}>← 戻る</button>
            )}
            <button className="btn-menu mobile-only" onClick={() => setOpen(!open)}>
              <span /><span /><span />
            </button>
          </div>
        </div>

        {/* スマホメニュー */}
        {open && (
          <>
            <div className="mobile-overlay" onClick={() => setOpen(false)} />
            <div className="mobile-sidebar">
              <div style={{ background: 'var(--grad)', padding: '20px 16px 16px' }}>
                <div className="sidebar-user-avatar" style={{ background: 'rgba(255,255,255,.2)', color: '#fff', marginBottom: 8 }}>
                  {initials}
                </div>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: '.9rem' }}>{user?.name || '---'}</div>
                <div style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.8)', marginTop: 2 }}>FP 日報アプリ</div>
              </div>
              <div style={{ padding: '10px 0' }}>
                {NAV_ITEMS.map((item) => (
                  <Link key={item.to} to={item.to} onClick={() => setOpen(false)} className="mobile-nav-item">
                    <i className={item.icon} style={{ fontSize: '1.1rem' }} aria-hidden="true" />
                    {item.label}
                  </Link>
                ))}
                <div style={{ height: 1, background: 'var(--border)', margin: '6px 14px' }} />
                <Link to="/admin-login" onClick={() => setOpen(false)} className="mobile-nav-item">
                  <i className="ti ti-lock" style={{ fontSize: '1.1rem' }} aria-hidden="true" />
                  管理者ログイン
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
