import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFirebaseList } from '../lib/useFirebaseList';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import MonthPicker from '../components/MonthPicker';

const DOWS = ['日', '月', '火', '水', '木', '金', '土'];
function parseDateLocal(str) {
  if (!str) return new Date();
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function dowOf(dateStr) {
  return dateStr ? DOWS[parseDateLocal(dateStr).getDay()] : '';
}
function achBadgeClass(p) {
  return p >= 100 ? 'b-green' : p >= 70 ? 'b-orange' : 'b-red';
}
function weekKey(dateStr, store) {
  const d = parseDateLocal(dateStr);
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  const monStr = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
  return `${store || ''}__${monStr}`;
}

export default function ReportList() {
  const { data: reports, loading } = useFirebaseList('fp_reports');
  const { canEditReport } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [pickerVal, setPickerVal] = useState(null);
  const [channelFilter, setChannelFilter] = useState('');
  const [selectedId, setSelectedId] = useState({});

  const groups = useMemo(() => {
    const filtered = Object.entries(reports).filter(([, r]) => {
      const mOk = !pickerVal || (() => {
        const [y, m] = (r.date || '').split('-').map(Number);
        return y === pickerVal.year && m === pickerVal.month;
      })();
      const qOk = !search || (r.store || '').includes(search) || (r.director || '').toLowerCase().includes(search.toLowerCase());
      const cOk = !channelFilter || r.channel === channelFilter;
      return mOk && qOk && cOk;
    });
    const map = {};
    filtered.forEach(([id, r]) => {
      if (!r.date) return;
      const key = weekKey(r.date, r.store);
      if (!map[key]) map[key] = [];
      map[key].push([id, r]);
    });
    return Object.values(map)
      .map((group) => group.sort((a, b) => (b[1].date || '').localeCompare(a[1].date || '')))
      .sort((a, b) => (b[0][1].date || '').localeCompare(a[0][1].date || ''));
  }, [reports, search, pickerVal]);

  return (
    <Layout title="日報確認" showBack>
      <MonthPicker value={pickerVal} onChange={setPickerVal} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <select
          className="inp"
          style={{ flex: '0 0 auto', width: 'auto', padding: '8px 10px', fontSize: '.84rem' }}
          value={channelFilter}
          onChange={e => setChannelFilter(e.target.value)}
        >
          <option value="">すべての販路</option>
          {['エディオン','イオン','ジョーシン','ケーズデンキ','ヤマダ','コジマ','その他'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          className="inp"
          placeholder="🔍 店舗名・ディレクター名"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <div className="ts">読み込み中…</div>}
      {!loading && groups.length === 0 && (
        <div className="empty">
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>📭</div>
          <p>日報がありません</p>
        </div>
      )}

      <div className="pc-grid-2col">
      {groups.map((group) => {
        const groupKey = `${group[0][1].store}__${group[0][1].date}`;
        const curId = selectedId[groupKey] || group[0][0];
        const curReport = reports[curId] || group[0][1];
        const p = curReport.ach || 0;
        const multi = group.length > 1;
        return (
          <div key={groupKey} className="report-card" onClick={() => navigate(`/reports/${curId}`)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div className="fw8">{curReport.store || '−'}</div>
              {multi ? (
                <select
                  className="inp-s"
                  style={{ width: 'auto', fontSize: '.7rem', padding: '3px 6px' }}
                  value={curId}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setSelectedId({ ...selectedId, [groupKey]: e.target.value })}
                >
                  {group.map(([id, r]) => (
                    <option key={id} value={id}>
                      {r.date}（{dowOf(r.date)}） {r.ach || 0}%
                    </option>
                  ))}
                </select>
              ) : (
                <span className="ts">{curReport.date}（{dowOf(curReport.date)}）</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 5 }}>
              <span className="badge b-blue">{curReport.channel || '−'}</span>
              <span className={`badge ${achBadgeClass(p)}`}>{p}%</span>
              <span className="badge b-gray">{curReport.director || curReport.userName || '−'}</span>
            </div>
            <div style={{ fontSize: '.7rem', color: 'var(--primary)', fontWeight: 700 }}>詳細</div>
          </div>
        );
      })}
      </div>
    </Layout>
  );
}
