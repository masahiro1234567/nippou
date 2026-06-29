import { useMemo, useState } from 'react';
import { useFirebaseList } from '../lib/useFirebaseList';
import Layout from '../components/Layout';

export default function Stats() {
  const { data: reports } = useFirebaseList('fp_reports');
  const [month, setMonth] = useState('');

  const byStore = useMemo(() => {
    const filtered = Object.values(reports).filter((r) => !month || (r.date || '').startsWith(month));
    const map = {};
    filtered.forEach((r) => {
      const s = r.store || '不明';
      if (!map[s]) map[s] = { souhan: 0, b2: 0, cnt: 0, achSum: 0 };
      map[s].souhan += r.auto_souhan || 0;
      map[s].b2 += r.auto_2b || 0;
      map[s].cnt++;
      map[s].achSum += r.ach || 0;
    });
    return Object.entries(map).sort((a, b) => b[1].souhan - a[1].souhan);
  }, [reports, month]);

  return (
    <Layout title="実績確認" showBack>
      <div className="form-group">
        <label>対象月</label>
        <input className="inp" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      {byStore.length === 0 && <div className="empty">データなし</div>}
      {byStore.map(([store, v]) => {
        const avgAch = v.cnt > 0 ? Math.round(v.achSum / v.cnt) : 0;
        const color = avgAch >= 100 ? 'var(--green)' : avgAch >= 70 ? 'var(--orange)' : 'var(--red)';
        return (
          <div key={store} className="card">
            <div className="fw8" style={{ marginBottom: 8 }}>{store} <span className="badge b-gray">{v.cnt}回</span></div>
            <div style={{ fontSize: '.8rem', marginBottom: 4 }}>総販：<span style={{ color: 'var(--pd)', fontWeight: 700 }}>{v.souhan}件</span></div>
            <div style={{ fontSize: '.8rem', marginBottom: 4 }}>2Bリク除き：<span style={{ color: 'var(--pd)', fontWeight: 700 }}>{v.b2}件</span></div>
            <div style={{ fontSize: '.8rem' }}>平均達成率：<span style={{ color, fontWeight: 700 }}>{avgAch}%</span></div>
          </div>
        );
      })}
    </Layout>
  );
}
