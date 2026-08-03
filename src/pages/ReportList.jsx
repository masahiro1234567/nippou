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
// 木曜始まりの週で「◯月◯週目」を算出（月内の1日が含まれる週を1週目とする）
function weekLabelOf(dateStr) {
  if (!dateStr) return '';
  const d = parseDateLocal(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed
  const firstDow = new Date(year, month, 1).getDay(); // 0=日〜6=土
  const offset = (firstDow - 4 + 7) % 7; // 4=木曜
  const week = Math.floor((d.getDate() - 1 + offset) / 7) + 1;
  return `${year}年${month + 1}月${week}週目`;
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
  const [openCards, setOpenCards] = useState({});

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

  const weekSections = useMemo(() => {
    const out = [];
    let curLabel = null;
    groups.forEach((group) => {
      const label = weekLabelOf(group[0][1].date);
      if (label !== curLabel) {
        out.push({ label, groups: [] });
        curLabel = label;
      }
      out[out.length - 1].groups.push(group);
    });
    return out;
  }, [groups]);

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

      {weekSections.map((section) => (
        <div key={section.label}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: 'var(--sub)',
            background: '#f3f4f6', borderRadius: 7,
            padding: '6px 10px', margin: '14px 0 8px',
          }}>
            {section.label}
          </div>
          <div className="pc-grid-2col">
          {section.groups.map((group) => {
            const groupKey = `${group[0][1].store}__${group[0][1].date}`;
            const curId = selectedId[groupKey] || group[0][0];
            const curReport = reports[curId] || group[0][1];
            const p = curReport.ach || 0;
            const multi = group.length > 1;
            const isOpen = !!openCards[groupKey];
            return (
              <div key={groupKey} className="report-card" style={{ cursor: 'pointer' }} onClick={() => setOpenCards({ ...openCards, [groupKey]: !isOpen })}>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <span className="badge b-blue">{curReport.channel || '−'}</span>
                    <span className={`badge ${achBadgeClass(p)}`}>{p}%</span>
                    <span className="badge b-gray">{curReport.director || curReport.userName || '−'}</span>
                  </div>
                  <span style={{ color: 'var(--sub)', fontSize: 13 }}>{isOpen ? '▾' : '›'}</span>
                </div>
                {/* アクションボタン（展開時のみ表示） */}
                {isOpen && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => navigate(`/reports/${curId}`)}
                      style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: '1.5px solid var(--border)', background: '#f9fafb', color: 'var(--sub)', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer' }}
                    >詳細</button>
                    <button
                      onClick={() => navigate(`/report/edit/${curId}`)}
                      style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: '1.5px solid var(--primary)', background: 'var(--pl)', color: 'var(--pd)', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer' }}
                    >編集</button>
                    <button
                      onClick={() => navigate(`/report/new?copyId=${curId}`)}
                      style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: '1.5px solid var(--border)', background: '#fff', color: 'var(--text)', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer' }}
                    >コピー</button>
                    <button
                      onClick={() => navigate(`/report/new?copyId=${curId}&mode=add`)}
                      style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer' }}
                    >追加</button>
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </div>
      ))}
    </Layout>
  );
}
