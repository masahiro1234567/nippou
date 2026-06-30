import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';

const MENU = [
  { to: '/report/new', icon: '📝', label: '日報登録', primary: true },
  { to: '/reports', icon: '📂', label: '日報確認' },
  { to: '/stats', icon: '📊', label: '実績確認' },
  { to: '/stores', icon: '🏪', label: '店舗特徴' },
  { to: '/kpi', icon: '🎯', label: 'KPI' },
  { to: '/personal', icon: '📈', label: '個人実績' },
];

export default function Home() {
  const { isAdmin } = useAuth();
  return (
    <Layout title="FP日報アプリ">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
        {MENU.map((m) => (
          <Link
            key={m.to}
            to={m.to}
            style={{
              background: m.primary ? 'var(--grad)' : '#fff',
              color: m.primary ? '#fff' : 'var(--text)',
              border: m.primary ? 'none' : '1.5px solid var(--border)',
              borderRadius: 12, padding: '18px 10px', fontSize: '.88rem', fontWeight: 800,
              textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              boxShadow: m.primary ? '0 3px 10px rgba(37,99,235,.3)' : 'none',
            }}
          >
            <span style={{ fontSize: '1.6rem' }}>{m.icon}</span>{m.label}
          </Link>
        ))}
      </div>
      {isAdmin && (
        <Link
          to="/admin"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', background: '#faeeda', color: '#854f0b', border: '1.5px solid #f0997b',
            borderRadius: 12, padding: 13, fontSize: '.86rem', fontWeight: 700, textDecoration: 'none',
            marginBottom: 10,
          }}
        >
          🛡️ 管理者画面
        </Link>
      )}
      <Link
        to="/admin-login"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', background: '#fff', color: 'var(--sub)', border: '1.5px solid var(--border)',
          borderRadius: 12, padding: 13, fontSize: '.86rem', fontWeight: 700, textDecoration: 'none',
        }}
      >
        🔐 管理者ログイン
      </Link>
    </Layout>
  );
}
