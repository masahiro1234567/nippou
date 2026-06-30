import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFirebaseList } from '../lib/useFirebaseList';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';

function achBadgeClass(p) {
  return p >= 100 ? 'b-green' : p >= 70 ? 'b-orange' : 'b-red';
}

export default function ReportList() {
  const { data: reports, loading } = useFirebaseList('fp_reports');
  const { canEditReport } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('');

  const filtered = useMemo(() => {
    return Object.entries(reports)
      .filter(([, r]) => {
        const mOk = !month || (r.date || '').startsWith(month);
        const qOk = !search || (r.store || '').includes(search) || (r.director || '').toLowerCase().includes(search.toLowerCase());
        return mOk && qOk;
      })
      .sort((a, b) => (b[1].date || '').localeCompare(a[1].date || ''));
  }, [reports, search, month]);

  return (
    <Layout title="日報確認" showBack>
      <input className="inp" type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ marginBottom: 10 }} />
      <input
        className="inp"
        placeholder="🔍 店舗名・ディレクター名で検索"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 10 }}
      />

      {loading && <div className="ts">読み込み中…</div>}
      {!loading && filtered.length === 0 && (
        <div className="empty">
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>📭</div>
          <p>日報がありません</p>
        </div>
      )}

      {filtered.map(([id, r]) => {
        const p = r.ach || 0;
        return (
          <div key={id} className="report-card" onClick={() => navigate(`/reports/${id}`)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div className="fw8">{r.store || '−'}</div>
              <span className="ts">{r.date}</span>
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 5 }}>
              <span className="badge b-blue">{r.channel || '−'}</span>
              <span className={`badge ${achBadgeClass(p)}`}>{p}%</span>
              <span className="badge b-gray">{r.director || r.userName || '−'}</span>
              {canEditReport(r) && <span className="badge b-green">編集可</span>}
            </div>
          </div>
        );
      })}
    </Layout>
  );
}
