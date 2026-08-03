import { useMemo, useState } from 'react';
import { useFirebaseList } from '../lib/useFirebaseList';
import Layout from '../components/Layout';
import MonthPicker from '../components/MonthPicker';

function achColor(p) {
  return p >= 100 ? 'var(--green)' : p >= 70 ? 'var(--orange)' : 'var(--red)';
}
function achBadgeClass(p) {
  return p >= 100 ? 'b-green' : p >= 70 ? 'b-orange' : 'b-red';
}
function initials(name) {
  return name ? name.slice(0, 1) : '?';
}
const AVATAR_COLORS = ['#fff7ed', '#fce7f3', '#ede9fe', '#d1fae5', '#dbeafe'];
const AVATAR_TEXT = ['#c2410c', '#be185d', '#6d28d9', '#065f46', '#1e40af'];

export default function Personal() {
  const { data: kpiResults } = useFirebaseList('fp_kpi_results');
  const [pickerVal, setPickerVal] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [storeFilter, setStoreFilter] = useState('');
  const [openMembers, setOpenMembers] = useState({});

  // 全店舗一覧
  const allStores = useMemo(() => {
    return [...new Set(Object.values(kpiResults).map(r => r.store).filter(Boolean))].sort();
  }, [kpiResults]);

  // フィルター済みデータをメンバーごとに集約
  const memberGroups = useMemo(() => {
    const filtered = Object.values(kpiResults).filter(r => {
      const mOk = !pickerVal || (() => {
        const [y, m] = (r.date || '').split('-').map(Number);
        return y === pickerVal.year && m === pickerVal.month;
      })();
      const sOk = !storeFilter || r.store === storeFilter;
      return mOk && sOk && r.memberName;
    });

    const map = {};
    filtered.forEach(r => {
      if (!map[r.memberName]) map[r.memberName] = { name: r.memberName, entries: [] };
      map[r.memberName].entries.push(r);
    });

    return Object.values(map)
      .map((mg, idx) => {
        // 平均達成率は「実績合計 ÷ 目標合計」で算出（案件ごとに目標件数が異なるため単純平均は使わない）
        const validEntries = mg.entries.filter(e => +e.target > 0);
        const sumActual = validEntries.reduce((s, e) => s + (+e.actual || 0), 0);
        const sumTarget = validEntries.reduce((s, e) => s + (+e.target || 0), 0);
        const avgAch = sumTarget > 0 ? Math.round((sumActual / sumTarget) * 100) : null;
        // 店舗ごとにまとめる
        const storeMap = {};
        mg.entries.forEach(e => {
          const s = e.store || '不明';
          if (!storeMap[s]) storeMap[s] = { store: s, entries: [] };
          storeMap[s].entries.push(e);
        });
        const storeList = Object.values(storeMap).map(sm => {
          const validSm = sm.entries.filter(e => +e.target > 0);
          const sA = validSm.reduce((s, e) => s + (+e.actual || 0), 0);
          const sT = validSm.reduce((s, e) => s + (+e.target || 0), 0);
          return { ...sm, avgAch: sT > 0 ? Math.round((sA / sT) * 100) : null };
        });
        return { ...mg, avgAch, storeList, avatarBg: AVATAR_COLORS[idx % AVATAR_COLORS.length], avatarText: AVATAR_TEXT[idx % AVATAR_TEXT.length] };
      })
      .sort((a, b) => (b.avgAch || 0) - (a.avgAch || 0));
  }, [kpiResults, pickerVal, storeFilter]);

  function toggleMember(name) {
    setOpenMembers(prev => ({ ...prev, [name]: !prev[name] }));
  }

  return (
    <Layout title="個人実績" showBack>
      <MonthPicker value={pickerVal} onChange={v => setPickerVal(v || { year: new Date().getFullYear(), month: new Date().getMonth() + 1 })} />
      <div style={{ marginBottom: 10 }}>
        <select
          className="inp"
          style={{ width: 'auto', padding: '8px 10px', fontSize: '.84rem' }}
          value={storeFilter}
          onChange={e => setStoreFilter(e.target.value)}
        >
          <option value="">すべての店舗</option>
          {allStores.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {memberGroups.length === 0 && <div className="empty">データなし</div>}

      {memberGroups.map(mg => (
        <div key={mg.name} style={{ background: '#fff', borderRadius: 'var(--r)', border: `1.5px solid ${openMembers[mg.name] ? 'var(--primary)' : 'var(--border)'}`, marginBottom: 8, overflow: 'hidden', boxShadow: 'var(--sh-sm)' }}>
          {/* ヘッダー（タップで展開） */}
          <div
            style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => toggleMember(mg.name)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: mg.avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: mg.avatarText, flexShrink: 0 }}>
                {initials(mg.name)}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{mg.name}</div>
                <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 2 }}>{mg.entries.length}稼働 / 平均達成率</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {mg.avgAch !== null
                ? <div style={{ fontSize: 22, fontWeight: 800, color: achColor(mg.avgAch) }}>{mg.avgAch}%</div>
                : <div style={{ fontSize: 14, color: 'var(--sub)' }}>−</div>
              }
              <div style={{ fontSize: 12, color: 'var(--sub)' }}>{openMembers[mg.name] ? '▾' : '›'}</div>
            </div>
          </div>

          {/* 展開：店舗ごとの達成率 */}
          {openMembers[mg.name] && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              {mg.storeList.map(sl => (
                <div key={sl.store}>
                  {sl.entries.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((e, ei) => (
                    <div key={ei} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{e.store}</div>
                        <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 2 }}>
                          {e.date}　目標{e.target}件 → 実績{e.actual}件
                        </div>
                      </div>
                      <span className={`badge ${e.ach !== undefined ? achBadgeClass(e.ach) : 'b-gray'}`}>
                        {e.ach !== undefined ? `${e.ach}%` : '−'}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </Layout>
  );
}
