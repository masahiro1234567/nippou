import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useFirebaseList } from '../lib/useFirebaseList';
import Layout from '../components/Layout';

const DOWS = ['日','月','火','水','木','金','土'];
function dowOf(s) { if(!s) return ''; const[y,m,d]=s.split('-').map(Number); return DOWS[new Date(y,m-1,d).getDay()]; }

const OTHER_MENU = [
  { to: '/reports', icon: '📂', label: '日報確認' },
  { to: '/stats', icon: '📊', label: '実績確認' },
  { to: '/stores', icon: '🏪', label: '店舗特徴' },
  { to: '/kpi', icon: '🎯', label: 'KPI' },
  { to: '/personal', icon: '📈', label: '個人実績' },
];

export default function Home() {
  const { isAdmin, user } = useAuth();
  const { data: reports } = useFirebaseList('fp_reports');
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);

  // 自分の最後の日報を取得
  const lastReport = Object.entries(reports)
    .filter(([, r]) => r.userEmail === user?.email || r.userName === user?.name)
    .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))[0];

  return (
    <Layout title="FP日報アプリ">
      {/* 日報登録ボタン */}
      <button
        onClick={() => setShowModal(true)}
        style={{
          width: '100%', background: 'var(--grad)', color: '#fff', border: 'none',
          borderRadius: 12, padding: '20px 10px', fontSize: '1rem', fontWeight: 800,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          boxShadow: '0 3px 12px rgba(249,115,22,.35)', cursor: 'pointer', marginBottom: 10,
        }}
      >
        <span style={{ fontSize: '1.6rem' }}>📝</span>日報登録
      </button>

      <div className="home-menu-grid">
        {OTHER_MENU.map((m) => (
          <Link key={m.to} to={m.to} style={{
            background: '#fff', color: 'var(--text)', border: '1.5px solid var(--border)',
            borderRadius: 12, padding: '18px 10px', fontSize: '.88rem', fontWeight: 800,
            textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: '1.6rem' }}>{m.icon}</span>{m.label}
          </Link>
        ))}
      </div>

      {isAdmin && (
        <Link to="/admin" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', background: '#faeeda', color: '#854f0b', border: '1.5px solid #f0997b',
          borderRadius: 12, padding: 13, fontSize: '.86rem', fontWeight: 700, textDecoration: 'none', marginBottom: 10,
        }}>🛡️ 管理者画面</Link>
      )}
      <Link to="/admin-login" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        width: '100%', background: '#fff', color: 'var(--sub)', border: '1.5px solid var(--border)',
        borderRadius: 12, padding: 13, fontSize: '.86rem', fontWeight: 700, textDecoration: 'none',
      }}>🔐 管理者ログイン</Link>

      {/* 日報登録モーダル */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>日報を登録</div>
            <div style={{ fontSize: 12, color: 'var(--sub)', marginBottom: 16 }}>どちらで始めますか？</div>

            {/* 新規日報 */}
            <button
              onClick={() => { setShowModal(false); navigate('/report/new'); }}
              style={{
                width: '100%', background: 'var(--grad)', color: '#fff', border: 'none',
                borderRadius: 11, padding: 16, marginBottom: 10, cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 3 }}>📝 新規日報</div>
              <div style={{ fontSize: 12, opacity: .85 }}>ゼロから新しく入力する</div>
            </button>

            {/* 続きの入力 */}
            <button
              onClick={() => {
                setShowModal(false);
                if (lastReport) {
                  navigate(`/report/new?mode=continue&copyId=${lastReport[0]}`);
                } else {
                  navigate('/report/new');
                }
              }}
              style={{
                width: '100%', background: '#fff', color: 'var(--text)',
                border: '1.5px solid var(--border)', borderRadius: 11, padding: 16,
                marginBottom: 10, cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 3 }}>🔄 続きの入力</div>
              {lastReport ? (
                <div style={{ fontSize: 12, color: 'var(--sub)' }}>
                  前回：{lastReport[1].store} / {lastReport[1].date}（{dowOf(lastReport[1].date)}）を引き継ぐ
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--sub)' }}>前回の日報が見つかりません</div>
              )}
            </button>

            <button
              onClick={() => setShowModal(false)}
              style={{ width: '100%', background: '#f3f4f6', color: 'var(--sub)', border: 'none', borderRadius: 11, padding: 12, cursor: 'pointer', fontSize: 13 }}
            >キャンセル</button>
          </div>
        </div>
      )}
    </Layout>
  );
}
