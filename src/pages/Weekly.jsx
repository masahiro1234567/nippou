import { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFirebaseList } from '../lib/useFirebaseList';
import Layout from '../components/Layout';

const DOWS = ['日','月','火','水','木','金','土'];

function parseDateLocal(str) {
  if (!str) return new Date();
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function getMonday(dateStr) {
  if (!dateStr) return '';
  const d = parseDateLocal(dateStr);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return fmt(d);
}
function getSunday(mondayStr) {
  const d = parseDateLocal(mondayStr);
  d.setDate(d.getDate() + 6);
  return fmt(d);
}
function weekLabel(mondayStr) {
  if (!mondayStr) return '';
  const d = parseDateLocal(mondayStr);
  const m = d.getMonth() + 1;
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const n = Math.ceil((d.getDate() + first.getDay()) / 7);
  return `${m}月 第${n}週`;
}
function shortDateRange(mondayStr) {
  if (!mondayStr) return '';
  const sun = parseDateLocal(getSunday(mondayStr));
  const mon = parseDateLocal(mondayStr);
  return `${mon.getMonth()+1}/${mon.getDate()}〜${sun.getMonth()+1}/${sun.getDate()}`;
}
function achColor(p) {
  return p >= 100 ? 'var(--green)' : p >= 70 ? 'var(--orange)' : 'var(--red)';
}
function achBadgeClass(p) {
  return p >= 100 ? 'b-green' : p >= 70 ? 'b-orange' : 'b-red';
}

// SVGリング（達成率を円グラフで表現）
function RingChart({ pct, size = 40, stroke = 5, color }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = Math.min(pct / 100, 1) * circ;
  const col = color || achColor(pct);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
      {pct > 0 && (
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={stroke}
          strokeDasharray={`${filled} ${circ}`} strokeLinecap="round" />
      )}
    </svg>
  );
}

export default function Weekly() {
  const { data: reports } = useFirebaseList('fp_reports');
  const { data: kpiData } = useFirebaseList('fp_kpi');
  const { data: kpiResults } = useFirebaseList('fp_kpi_results');
  const navigate = useNavigate();
  const timelineRef = useRef(null);

  // 現在表示中の月（デフォルト：今月）
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [selectedWeek, setSelectedWeek] = useState(null);

  // 週単位でレポートを集計
  const weekGroups = useMemo(() => {
    const map = {};

    // fp_reportsをweekKeyでグループ化
    Object.entries(reports).forEach(([rid, r]) => {
      if (!r.date) return;
      const [y, m] = r.date.split('-').map(Number);
      if (y !== viewYear || m !== viewMonth) return;
      const mon = getMonday(r.date);
      if (!map[mon]) map[mon] = { reports: [], kpis: [], kpiResults: [] };
      map[mon].reports.push([rid, r]);
    });

    // fp_kpiをweekKeyでグループ化
    Object.entries(kpiData).forEach(([kid, k]) => {
      const dates = k.dates || [k.date].filter(Boolean);
      dates.forEach(dt => {
        if (!dt) return;
        const [y, m] = dt.split('-').map(Number);
        if (y !== viewYear || m !== viewMonth) return;
        const mon = getMonday(dt);
        if (!map[mon]) map[mon] = { reports: [], kpis: [], kpiResults: [] };
        if (!map[mon].kpis.find(([id]) => id === kid)) {
          map[mon].kpis.push([kid, k]);
        }
      });
    });

    // fp_kpi_resultsもweekKeyで集計
    Object.values(kpiResults).forEach(r => {
      if (!r.date) return;
      const [y, m] = r.date.split('-').map(Number);
      if (y !== viewYear || m !== viewMonth) return;
      const mon = getMonday(r.date);
      if (!map[mon]) map[mon] = { reports: [], kpis: [], kpiResults: [] };
      map[mon].kpiResults.push(r);
    });

    // 各週の集計値を計算
    return Object.entries(map).map(([mon, data]) => {
      // 日報からの達成率
      const totalSouhan = data.reports.reduce((s, [, r]) => s + (r.auto_souhan || 0), 0);
      const totalTarget = data.reports.reduce((s, [, r]) => s + (+r.r_ta || 0), 0) / Math.max(data.reports.length, 1);
      // KPI結果からの達成率（あれば優先）
      const kpiActuals = data.kpiResults.filter(r => r.role !== 'キャッチャー');
      const kpiTotal = kpiActuals.reduce((s, r) => s + (r.actual || 0), 0);
      const kpiTargetTotal = kpiActuals.reduce((s, r) => s + (r.target || 0), 0);
      const kpiAch = kpiTargetTotal > 0 ? Math.round((kpiTotal / kpiTargetTotal) * 100) : null;
      // 日報の達成率
      const reportAch = data.reports.length > 0
        ? Math.round(data.reports.reduce((s, [, r]) => s + (r.ach || 0), 0) / data.reports.length)
        : null;
      const ach = kpiAch ?? reportAch;
      // 店舗一覧
      const stores = [...new Set([
        ...data.reports.map(([, r]) => r.store),
        ...data.kpis.map(([, k]) => k.store),
      ].filter(Boolean))];
      // メンバー一覧
      const members = [...new Set([
        ...data.reports.map(([, r]) => r.director || r.userName),
        ...data.kpiResults.map(r => r.memberName),
      ].filter(Boolean))];
      return { mon, ach, stores, members, reports: data.reports, kpis: data.kpis, kpiResults: data.kpiResults };
    }).sort((a, b) => a.mon.localeCompare(b.mon));
  }, [reports, kpiData, kpiResults, viewYear, viewMonth]);

  // 初期選択：最初の稼働週
  useEffect(() => {
    if (weekGroups.length > 0 && !selectedWeek) {
      setSelectedWeek(weekGroups[weekGroups.length - 1].mon);
    }
  }, [weekGroups]);

  const selGroup = weekGroups.find(w => w.mon === selectedWeek);

  function changeMonth(delta) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setViewYear(y); setViewMonth(m);
    setSelectedWeek(null);
  }

  return (
    <Layout title="週次まとめ" showBack>

      {/* 月ナビ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={() => changeMonth(-1)}
          style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontWeight: 700 }}>‹</button>
        <span style={{ fontSize: 16, fontWeight: 800 }}>{viewYear}年 {viewMonth}月</span>
        <button onClick={() => changeMonth(1)}
          style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontWeight: 700 }}>›</button>
      </div>

      {/* 週タイムライン（横スクロール） */}
      <div ref={timelineRef} style={{
        display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 14,
        scrollbarWidth: 'none',
      }}>
        {weekGroups.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--sub)', padding: '10px 0' }}>この月のデータなし</div>
        )}
        {weekGroups.map(w => {
          const isActive = w.mon === selectedWeek;
          return (
            <div key={w.mon}
              onClick={() => setSelectedWeek(w.mon)}
              style={{
                flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                padding: '10px 12px', borderRadius: 12, cursor: 'pointer', minWidth: 72,
                border: `1.5px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                background: isActive ? 'var(--pl)' : '#fff',
                transition: 'all .15s',
              }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: isActive ? 'var(--pd)' : 'var(--sub)' }}>
                {weekLabel(w.mon).replace('月 ', '\n月\n')}
              </div>
              {/* リング */}
              <div style={{ position: 'relative', width: 44, height: 44 }}>
                <RingChart pct={w.ach || 0} size={44} stroke={5} />
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 800, color: w.ach ? achColor(w.ach) : 'var(--sub)',
                }}>
                  {w.ach ? `${w.ach}%` : '−'}
                </div>
              </div>
              <div style={{ fontSize: 9, color: 'var(--sub)' }}>{shortDateRange(w.mon)}</div>
            </div>
          );
        })}
      </div>

      {/* 選択週のdetail */}
      {!selGroup && (
        <div className="empty">週を選択してください</div>
      )}
      {selGroup && (
        <>
          {/* ヒーローカード */}
          <div style={{
            background: 'linear-gradient(135deg,#fb923c,#f97316)',
            borderRadius: 16, padding: 20, marginBottom: 12, color: '#fff', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: -20, right: -20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,.1)' }} />
            <div style={{ fontSize: 11, opacity: .8, marginBottom: 3 }}>
              {weekLabel(selGroup.mon)}　{shortDateRange(selGroup.mon)}
            </div>
            <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1 }}>
              {selGroup.ach != null ? selGroup.ach : '−'}
              <span style={{ fontSize: 24 }}>{selGroup.ach != null ? '%' : ''}</span>
            </div>
            <div style={{ fontSize: 12, opacity: .8, marginTop: 3 }}>平均達成率</div>
            <div style={{ display: 'flex', gap: 20, marginTop: 14, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{selGroup.stores.length}<span style={{ fontSize: 12 }}>現場</span></div>
                <div style={{ fontSize: 10, opacity: .75 }}>稼働店舗</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{selGroup.reports.length}<span style={{ fontSize: 12 }}>件</span></div>
                <div style={{ fontSize: 10, opacity: .75 }}>日報数</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{selGroup.members.length}<span style={{ fontSize: 12 }}>名</span></div>
                <div style={{ fontSize: 10, opacity: .75 }}>稼働人数</div>
              </div>
              {selGroup.kpis.length > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{selGroup.kpis.length}<span style={{ fontSize: 12 }}>件</span></div>
                  <div style={{ fontSize: 10, opacity: .75 }}>KPI設定</div>
                </div>
              )}
            </div>
          </div>

          {/* 店舗別 KPI vs 実績 */}
          {selGroup.stores.length > 0 && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>🏪 店舗別 実績</div>
              {selGroup.stores.map(store => {
                const storeReports = selGroup.reports.filter(([, r]) => r.store === store);
                const storeKpi = selGroup.kpis.find(([, k]) => k.store === store);
                const target = storeKpi ? +storeKpi[1].overallTarget || 0 : 0;
                const actual = storeReports.reduce((s, [, r]) => s + (r.auto_souhan || 0), 0);
                const ach = target > 0 ? Math.round((actual / target) * 100) : null;
                const dates = [...new Set(storeReports.map(([, r]) => r.date))].sort();
                const directors = [...new Set(storeReports.map(([, r]) => r.director || r.userName).filter(Boolean))];
                return (
                  <div key={store} style={{ marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{store}</div>
                    <div style={{ fontSize: 11, color: 'var(--sub)', marginBottom: 8 }}>
                      {dates.map(dt => `${dt}（${DOWS[parseDateLocal(dt).getDay()]}）`).join('・')}
                      {directors.length > 0 && `　${directors.join('・')}`}
                    </div>
                    {/* KPI vs 実績バー */}
                    {target > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 10, color: 'var(--sub)', flex: '0 0 32px', textAlign: 'right' }}>目標</span>
                          <div style={{ flex: 1, height: 10, background: '#f3f4f6', borderRadius: 5, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: '100%', background: '#e5e7eb', borderRadius: 5 }} />
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--sub)', flex: '0 0 36px' }}>{target}件</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, color: 'var(--sub)', flex: '0 0 32px', textAlign: 'right' }}>実績</span>
                          <div style={{ flex: 1, height: 10, background: '#f3f4f6', borderRadius: 5, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min((actual/target)*100, 100)}%`, background: achColor(ach || 0), borderRadius: 5, transition: 'width .5s' }} />
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, color: achColor(ach || 0), flex: '0 0 36px' }}>{actual}件</span>
                        </div>
                      </div>
                    )}
                    {ach != null && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <span className={`badge ${achBadgeClass(ach)}`}>{ach}%</span>
                      </div>
                    )}
                    {/* 日報一覧（タップで詳細） */}
                    {storeReports.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        {storeReports.map(([rid, r]) => (
                          <div key={rid}
                            onClick={() => navigate(`/reports/${rid}`)}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: '#f9fafb', borderRadius: 7, marginBottom: 4, cursor: 'pointer' }}>
                            <span style={{ fontSize: 12 }}>{r.date}（{DOWS[parseDateLocal(r.date).getDay()]}）</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span className={`badge ${achBadgeClass(r.ach || 0)}`}>{r.ach || 0}%</span>
                              <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 700 }}>詳細 →</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* KPI別メンバー実績（fp_kpi_resultsがある場合） */}
          {selGroup.kpiResults.length > 0 && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>👤 メンバー別KPI実績</div>
              {[...new Set(selGroup.kpiResults.map(r => r.memberName).filter(Boolean))].map(name => {
                const memberResults = selGroup.kpiResults.filter(r => r.memberName === name && r.role !== 'キャッチャー');
                const totalActual = memberResults.reduce((s, r) => s + (r.actual || 0), 0);
                const totalTarget = memberResults.reduce((s, r) => s + (r.target || 0), 0);
                const ach = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : null;
                return (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', background: 'var(--pl)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 800, color: 'var(--pd)', flexShrink: 0,
                    }}>
                      {name.slice(0, 1)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{name}</div>
                      <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 1 }}>
                        目標{totalTarget}件 → 実績{totalActual}件
                      </div>
                      <div style={{ height: 5, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden', marginTop: 5 }}>
                        <div style={{ height: '100%', width: `${Math.min(ach || 0, 100)}%`, background: achColor(ach || 0), borderRadius: 3 }} />
                      </div>
                    </div>
                    {ach != null && (
                      <span className={`badge ${achBadgeClass(ach)}`} style={{ flexShrink: 0 }}>{ach}%</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* データなし */}
          {selGroup.reports.length === 0 && selGroup.kpis.length === 0 && (
            <div className="empty">この週のデータがありません</div>
          )}
        </>
      )}
    </Layout>
  );
}
