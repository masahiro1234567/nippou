import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFirebaseList } from '../lib/useFirebaseList';
import Layout from '../components/Layout';
import MonthPicker from '../components/MonthPicker';

const CHANNELS = ['エディオン','イオン','ジョーシン','ケーズデンキ','ヤマダ','コジマ','その他'];
const DOWS = ['日','月','火','水','木','金','土'];

function parseDateLocal(str) {
  if (!str) return new Date();
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function dowOf(str) {
  return str ? DOWS[parseDateLocal(str).getDay()] : '';
}
function achColor(p) {
  return p >= 100 ? 'var(--green)' : p >= 70 ? 'var(--orange)' : 'var(--red)';
}
function achBadgeClass(p) {
  return p >= 100 ? 'b-green' : p >= 70 ? 'b-orange' : 'b-red';
}
// 同じ店舗×同じ週（月曜始まり）でグループ化
function weekKey(dateStr, store) {
  const d = parseDateLocal(dateStr);
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  const ms = `${mon.getFullYear()}-${String(mon.getMonth()+1).padStart(2,'0')}-${String(mon.getDate()).padStart(2,'0')}`;
  return `${store||''}__${ms}`;
}

export default function Stats() {
  const { data: reports } = useFirebaseList('fp_reports');
  const navigate = useNavigate();
  const [pickerVal, setPickerVal] = useState(null);
  const [channelFilter, setChannelFilter] = useState('');
  const [openStore, setOpenStore] = useState(null);

  // 日報を店舗+週でグループ化し、達成率を算出
  const storeGroups = useMemo(() => {
    const filtered = Object.entries(reports).filter(([, r]) => {
      const mOk = !pickerVal || (() => {
        const [y, m] = (r.date || '').split('-').map(Number);
        return y === pickerVal.year && m === pickerVal.month;
      })();
      const cOk = !channelFilter || r.channel === channelFilter;
      return mOk && cOk && r.date && r.store;
    });

    // 週単位グループ
    const weekGroups = {};
    filtered.forEach(([id, r]) => {
      const wk = weekKey(r.date, r.store);
      if (!weekGroups[wk]) weekGroups[wk] = { store: r.store, channel: r.channel || '', reports: [] };
      weekGroups[wk].reports.push([id, r]);
    });

    // 週グループごとに達成率計算
    const weekList = Object.values(weekGroups).map(wg => {
      const target = wg.reports[0]?.[1]?.r_ta;
      const totalActual = wg.reports.reduce((s, [, r]) => s + (r.auto_souhan || 0), 0);
      const ach = +target > 0 ? Math.round((totalActual / +target) * 100) : null;
      return { ...wg, target, totalActual, ach, latestDate: wg.reports[0]?.[1]?.date || '' };
    });

    // 店舗単位で集約
    const storeMap = {};
    weekList.forEach(wg => {
      const s = wg.store;
      if (!storeMap[s]) storeMap[s] = { store: s, channel: wg.channel, weeks: [], achList: [] };
      storeMap[s].weeks.push(wg);
      if (wg.ach !== null) storeMap[s].achList.push(wg.ach);
    });

    return Object.values(storeMap)
      .map(sm => {
        const avgAch = sm.achList.length > 0 ? Math.round(sm.achList.reduce((a, b) => a + b, 0) / sm.achList.length) : null;
        const cnt = sm.weeks.length; // 週単位の稼働回数
        return { ...sm, avgAch, cnt };
      })
      .sort((a, b) => (b.avgAch || 0) - (a.avgAch || 0));
  }, [reports, pickerVal, channelFilter]);

  return (
    <Layout title="実績確認" showBack>
      <MonthPicker value={pickerVal} onChange={setPickerVal} />
      <div style={{ marginBottom: 10 }}>
        <select
          className="inp"
          style={{ width: 'auto', padding: '8px 10px', fontSize: '.84rem' }}
          value={channelFilter}
          onChange={e => setChannelFilter(e.target.value)}
        >
          <option value="">すべての販路</option>
          {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {storeGroups.length === 0 && <div className="empty">データなし</div>}

      <div className="pc-grid-2col">
      {storeGroups.map(sm => (
        <div
          key={sm.store}
          style={{
            background: '#fff', borderRadius: 'var(--r)', border: `1.5px solid ${openStore === sm.store ? 'var(--primary)' : 'var(--border)'}`,
            marginBottom: 8, overflow: 'hidden', boxShadow: 'var(--sh-sm)', cursor: 'pointer',
          }}
          onClick={() => setOpenStore(openStore === sm.store ? null : sm.store)}
        >
          <div style={{ padding: '13px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px' }}>{sm.store}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                {sm.channel && <span className="badge b-orange">{sm.channel}</span>}
                <span className="badge b-gray">{sm.cnt}回稼働</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {sm.avgAch !== null
                ? <div style={{ fontSize: 22, fontWeight: 800, color: achColor(sm.avgAch) }}>{sm.avgAch}%</div>
                : <div style={{ fontSize: 14, color: 'var(--sub)' }}>−</div>
              }
              <div style={{ fontSize: 10, color: 'var(--sub)' }}>平均達成率</div>
            </div>
          </div>

          {openStore === sm.store && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              {sm.weeks
                .sort((a, b) => (b.latestDate || '').localeCompare(a.latestDate || ''))
                .map((wg, wi) => {
                  // 週単位の正しい達成率（土日合計 / 目標）
                  const weekAch = wg.ach;
                  const dates = [...new Set(wg.reports.map(([, r]) => r.date))].sort();
                  const dateLabel = dates.map(d => `${d}（${dowOf(d)}）`).join('・');
                  const directors = [...new Set(wg.reports.map(([, r]) => r.director || r.userName).filter(Boolean))].join('・');
                  return (
                    <div key={wi} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                      {/* 週の日程とメンバー */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{dateLabel}</div>
                          <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 2 }}>
                            {directors}
                            {wg.target ? `　目標 ${wg.target}件 → 実績 ${wg.totalActual}件` : `　実績 ${wg.totalActual}件`}
                          </div>
                        </div>
                        <span className={`badge ${achBadgeClass(weekAch || 0)}`} style={{ flexShrink: 0, marginLeft: 8 }}>
                          {weekAch != null ? `${weekAch}%` : '−'}
                        </span>
                      </div>
                      {/* 日報詳細リンク */}
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        {wg.reports
                          .sort((a, b) => (a[1].date || '').localeCompare(b[1].date || ''))
                          .map(([id, r]) => (
                            <button key={id}
                              onClick={e => { e.stopPropagation(); navigate(`/reports/${id}`); }}
                              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1.5px solid var(--border)', background: '#f9fafb', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer' }}>
                              {r.date}（{dowOf(r.date)}）詳細 →
                            </button>
                          ))
                        }
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      ))}
      </div>
    </Layout>
  );
}
