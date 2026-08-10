import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, push, set, remove } from 'firebase/database';
import { db } from '../lib/firebase';
import { useFirebaseList } from '../lib/useFirebaseList';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import Layout from '../components/Layout';
import MonthPicker from '../components/MonthPicker';

const CHANNELS = ['エディオン','イオン','ジョーシン','ケーズデンキ','ヤマダ','コジマ','その他'];
const POSITIONS = ['責任者','MQ','SAM','IN','NV'];
const GRADES = ['S','A','B','C','R'];
const DOWS = ['日','月','火','水','木','金','土'];

function parseDateLocal(str) {
  if (!str) return new Date();
  const [y,m,d] = str.split('-').map(Number);
  return new Date(y,m-1,d);
}
function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function dowStr(dateStr) {
  return dateStr ? DOWS[parseDateLocal(dateStr).getDay()] : '';
}
function dateLabel(dateStr) {
  if (!dateStr) return '';
  const d = parseDateLocal(dateStr);
  return `${d.getMonth()+1}/${d.getDate()}（${DOWS[d.getDay()]}）`;
}
function getNextWeekend() {
  const today = new Date();
  const day = today.getDay();
  const dts = day === 6 ? 0 : (6 - day);
  const sat = new Date(today);
  sat.setDate(today.getDate() + dts);
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);
  return { sat: fmt(sat), sun: fmt(sun) };
}
function addOneDay(dateStr) {
  const d = parseDateLocal(dateStr);
  d.setDate(d.getDate() + 1);
  return fmt(d);
}
function subOneDay(dateStr) {
  const d = parseDateLocal(dateStr);
  d.setDate(d.getDate() - 1);
  return fmt(d);
}
// 「その月の1回目の土日を含む週」を1週目とする（木曜始まり）
function weekLabelOf(dateStr) {
  if (!dateStr) return '';
  const d = parseDateLocal(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed
  const firstDow = new Date(year, month, 1).getDay(); // 0=日〜6=土
  const daysToFirstSat = (6 - firstDow + 7) % 7;
  const firstSatDate = 1 + daysToFirstSat; // その月最初の土曜（日付）
  const week1ThuDate = firstSatDate - 2; // 1週目の木曜（日付、月をまたいでもOK）
  let week = Math.floor((d.getDate() - week1ThuDate) / 7) + 1;
  if (week < 1) week = 1; // 1週目の木曜より前の日は1週目にまとめる
  return `${year}年${month + 1}月${week}週目`;
}
// 一覧（[id,item]の配列、日付でソート済み想定）を週見出しでグルーピングする
function groupByWeek(sortedEntries, getDate) {
  const out = [];
  let curLabel = null;
  sortedEntries.forEach((entry) => {
    const label = weekLabelOf(getDate(entry));
    if (label !== curLabel) {
      out.push({ label, items: [] });
      curLabel = label;
    }
    out[out.length - 1].items.push(entry);
  });
  return out;
}
// 木曜始まりの週の開始日（Thu）を返す（同一現場・同一週のレコードをまとめるためのキー用）
function thuWeekStart(dateStr) {
  const d = parseDateLocal(dateStr);
  const day = d.getDay(); // 0=日〜6=土
  const offset = (day - 4 + 7) % 7;
  const thu = new Date(d);
  thu.setDate(d.getDate() - offset);
  return `${thu.getFullYear()}-${String(thu.getMonth()+1).padStart(2,'0')}-${String(thu.getDate()).padStart(2,'0')}`;
}
function getRoleOrder(grade) {
  if (grade === 'S' || grade === 'A') return ['ディレクター','クローザー','キャッチャー'];
  if (grade === 'B') return ['クローザー','ディレクター','キャッチャー'];
  return ['キャッチャー','クローザー','ディレクター'];
}

export default function Admin() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('list');

  if (!isAdmin) {
    return (
      <Layout title="管理者画面" showBack>
        <div className="empty">管理者ログインが必要です</div>
        <button className="btn btn-p" onClick={() => navigate('/admin-login')}>管理者ログインへ</button>
      </Layout>
    );
  }

  return (
    <Layout title="管理者画面" showBack>
      <div className="filter-bar" style={{ marginBottom: 14 }}>
        <button className={`fchip${tab==='list'?' active':''}`} onClick={()=>setTab('list')}>日報管理</button>
        <button className={`fchip${tab==='kpi'?' active':''}`} onClick={()=>setTab('kpi')}>KPI</button>
        <button className={`fchip${tab==='users'?' active':''}`} onClick={()=>setTab('users')}>ユーザー管理</button>
      </div>
      {tab==='list' && <ReportManageTab />}
      {tab==='kpi' && <AdminKpiTab />}
      {tab==='users' && <UsersTab />}
    </Layout>
  );
}

/* ===== ① 日報管理タブ ===== */
function ReportManageTab() {
  const { data: reports } = useFirebaseList('fp_reports');
  const showToast = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [pickerVal, setPickerVal] = useState(null);
  const [channelFilter, setChannelFilter] = useState('');
  const [openIds, setOpenIds] = useState({});
  const [openWeeks, setOpenWeeks] = useState({});
  const [recalculating, setRecalculating] = useState(false);

  // 保存済みの au/uq（新旧両形式に対応）から実績・達成率を再計算して書き戻す
  async function handleRecalcAll() {
    if (!confirm('全日報の実績・達成率を、現在のau/uq入力値から再計算して上書きします。よろしいですか？')) return;
    setRecalculating(true);
    let fixedCount = 0;
    try {
      const entries = Object.entries(reports);
      for (const [id, r] of entries) {
        const au = (r.au || (r.au_by_day && r.au_by_day[0]) || Array(8).fill(0)).map(v => +v || 0);
        const uq = (r.uq || (r.uq_by_day && r.uq_by_day[0]) || Array(8).fill(0)).map(v => +v || 0);
        const n = (v) => +v || 0;
        const auTotal = au.reduce((a, b) => a + n(b), 0);
        const uqTotal = uq.reduce((a, b) => a + n(b), 0) - n(uq[1]);
        const souhan = auTotal + uqTotal;
        const riku = souhan - (n(au[1]) + n(au[7]) + n(uq[7]));
        const target = +r.r_ta || 0;
        const ach = target > 0 ? Math.round((souhan / target) * 100) : 0;
        if (r.auto_souhan !== souhan || r.auto_2b !== riku || r.ach !== ach) {
          await set(ref(db, `fp_reports/${id}/au`), au);
          await set(ref(db, `fp_reports/${id}/uq`), uq);
          await set(ref(db, `fp_reports/${id}/auto_souhan`), souhan);
          await set(ref(db, `fp_reports/${id}/auto_2b`), riku);
          await set(ref(db, `fp_reports/${id}/ach`), ach);
          fixedCount++;
        }
      }
      showToast(fixedCount > 0 ? `✅ ${fixedCount}件のズレを修正しました` : '✅ ズレはありませんでした');
    } catch (e) {
      showToast('再計算エラー: ' + e.message);
    } finally {
      setRecalculating(false);
    }
  }

  const filtered = useMemo(() => {
    return Object.entries(reports).filter(([,r]) => {
      const mOk = !pickerVal || (()=>{
        const [y,m] = (r.date||'').split('-').map(Number);
        return y===pickerVal.year && m===pickerVal.month;
      })();
      const qOk = !search || (r.store||'').includes(search) || (r.director||'').includes(search);
      const cOk = !channelFilter || r.channel===channelFilter;
      return mOk && qOk && cOk;
    }).sort((a,b)=>(b[1].date||'').localeCompare(a[1].date||''));
  }, [reports, pickerVal, search, channelFilter]);

  // 同一現場（店舗×木曜始まりの週）の日報を1カードにまとめる
  const siteGroups = useMemo(() => {
    const map = {};
    filtered.forEach(([id, r]) => {
      if (!r.date || !r.store) return;
      const key = `${r.store}__${thuWeekStart(r.date)}`;
      if (!map[key]) map[key] = { key, items: [] };
      map[key].items.push([id, r]);
    });
    return Object.values(map).map(g => {
      const items = g.items.sort((a,b) => (a[1].date||'').localeCompare(b[1].date||''));
      const first = items[0][1];
      const target = +first.r_ta || 0;
      const totalActual = items.reduce((s,[,r]) => s + (r.auto_souhan||0), 0);
      const ach = target > 0 ? Math.round((totalActual/target)*100) : null;
      const directors = [...new Set(items.map(([,r]) => r.director || r.userName).filter(Boolean))];
      return { ...g, items, store: first.store, channel: first.channel, directors, target, totalActual, ach, repDate: first.date };
    }).sort((a,b) => (b.repDate||'').localeCompare(a.repDate||''));
  }, [filtered]);

  const weekGroups = useMemo(
    () => groupByWeek(siteGroups, (g) => g.repDate),
    [siteGroups]
  );

  async function handleDelete(id) {
    if (!confirm('この日報を削除しますか？')) return;
    await remove(ref(db, `fp_reports/${id}`));
    showToast('🗑 削除しました');
  }

  return (
    <div>
      <MonthPicker value={pickerVal} onChange={setPickerVal} />
      <div style={{ display:'flex', gap:8, marginBottom:10 }}>
        <select className="inp" style={{ flex:'0 0 auto', width:'auto', padding:'8px 10px', fontSize:'.84rem' }}
          value={channelFilter} onChange={e=>setChannelFilter(e.target.value)}>
          <option value="">すべての販路</option>
          {CHANNELS.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <input className="inp" placeholder="🔍 店舗名・ディレクター名"
          value={search} onChange={e=>setSearch(e.target.value)} />
      </div>
      <button className="btn btn-outline" disabled={recalculating} style={{ marginBottom:12, fontSize:'.78rem', padding:'8px 12px' }} onClick={handleRecalcAll}>
        {recalculating ? '再計算中...' : '🔄 全日報の実績・達成率を再計算'}
      </button>
      {filtered.length===0 && <div className="empty">データなし</div>}
      {weekGroups.map((grp) => (
        <div key={grp.label}>
          <WeekSectionHeader
            label={grp.label}
            count={grp.items.length}
            isOpen={!!openWeeks[grp.label]}
            onClick={() => setOpenWeeks(prev => ({ ...prev, [grp.label]: !prev[grp.label] }))}
          />
          {openWeeks[grp.label] && grp.items.map((sg) => {
            const isOpen = !!openIds[sg.key];
            const idsCsv = sg.items.map(([id]) => id).join(',');
            const editHref = sg.items.length > 1 ? `/report/edit-group?groupIds=${idsCsv}` : `/report/edit/${sg.items[0][0]}`;
            const dateLabel = sg.items.map(([, r]) => `${r.date}（${dowStr(r.date)}）`).join('・');
            return (
              <div key={sg.key} style={{ background:'#fff', borderRadius:'var(--r)', border:`1.5px solid ${isOpen ? 'var(--primary)' : 'var(--border)'}`, marginBottom:8, overflow:'hidden', boxShadow:'var(--sh-sm)' }}>
                <div style={{ padding:'12px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer' }}
                  onClick={()=>setOpenIds(prev=>({ ...prev, [sg.key]: !prev[sg.key] }))}>
                  <div>
                    <div className="fw8" style={{ fontSize:14 }}>{sg.store||'−'}</div>
                    <div style={{ display:'flex', gap:5, marginTop:5, flexWrap:'wrap', alignItems:'center' }}>
                      <span className="badge b-blue">{sg.channel||'−'}</span>
                      <span className="badge b-gray">{sg.directors.join('・')||'−'}</span>
                      <span className="ts">{dateLabel}</span>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:18, fontWeight:800, color:'var(--green)' }}>{sg.ach!=null ? `${sg.ach}%` : '−'}</div>
                      <div style={{ fontSize:9, color:'var(--sub)' }}>{sg.items.length>1 ? '合算達成率' : '達成率'}</div>
                    </div>
                    <span style={{ color:'var(--sub)', fontSize:13 }}>{isOpen ? '▾' : '›'}</span>
                  </div>
                </div>
                {isOpen && (
                  <div style={{ borderTop:'1px solid var(--border)', padding:'10px 14px 14px' }}>
                    {sg.items.map(([id, r]) => (
                      <div key={id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f9fafb', borderRadius:8, padding:'8px 10px', marginBottom:6 }}>
                        <div style={{ fontSize:12 }}>
                          <div style={{ color:'var(--sub)' }}>{r.date}（{dowStr(r.date)}）</div>
                          <div className="fw8" style={{ marginTop:2 }}>目標{r.r_ta||0} → 実績{r.auto_souhan||0}</div>
                        </div>
                        <button onClick={(e)=>{e.stopPropagation(); handleDelete(id);}} style={{ fontSize:11, color:'#dc2626', background:'none', border:'none', cursor:'pointer', fontWeight:700 }}>削除</button>
                      </div>
                    ))}
                    <button className="btn btn-p" style={{ marginTop:4, fontSize:'.8rem', padding:'8px 12px' }} onClick={()=>navigate(editHref)}>
                      編集{sg.items.length>1 ? '（まとめて開く）' : ''}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function WeekSectionHeader({ label, count, isOpen, onClick }) {
  return (
    <div onClick={onClick} style={{
      fontSize: 14, fontWeight: 800, color: 'var(--pd)',
      background: 'var(--pl)', border: '1px solid #fed7aa', borderRadius: 10,
      padding: '12px 14px', margin: '16px 0 10px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
    }}>
      <span>{label}{count != null && <span style={{ fontWeight: 600, marginLeft: 6, fontSize: 12, opacity: .85 }}>（{count}件）</span>}</span>
      <span style={{ fontSize: 15 }}>{isOpen ? '▾' : '›'}</span>
    </div>
  );
}

/* ===== ② KPIタブ（管理者設定） ===== */
function useIsMobile() {
  const [m, setM] = useState(() => window.innerWidth < 900);
  useEffect(() => {
    const h = () => setM(window.innerWidth < 900);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return m;
}

function AdminKpiTab() {
  const { data: kpiData } = useFirebaseList('fp_kpi');
  const { data: fpUsers } = useFirebaseList('fp_users');
  const showToast = useToast();
  const isMobile = useIsMobile();
  const [pickerVal, setPickerVal] = useState(null);
  const [channelFilter, setChannelFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [openIds, setOpenIds] = useState({});
  const [openWeeks, setOpenWeeks] = useState({});
  const [editing, setEditing] = useState(null);
  const [wizardStep, setWizardStep] = useState(0); // モバイルウィザード用

  const userList = useMemo(() =>
    Object.values(fpUsers).filter(u => u.name).map(u => ({ name: u.name, grade: u.grade || 'B' }))
  , [fpUsers]);

  function initNewForm() {
    const { sat, sun } = getNextWeekend();
    setEditing({
      store: '', channel: '', overallTarget: '',
      dates: [sat, sun],
      dateMembers: {
        [sat]: [{ member: '', role: 'クローザー', target: '', catcherCount: '' }],
        [sun]: [{ member: '', role: 'クローザー', target: '', catcherCount: '' }],
      },
    });
    setWizardStep(0);
    setShowForm(true);
  }

  function openEdit(id) {
    const k = kpiData[id];
    setEditing({
      id, store: k.store || '', channel: k.channel || '', overallTarget: k.overallTarget || '',
      dates: k.dates || [k.date].filter(Boolean),
      dateMembers: k.dateMembers || {},
    });
    setWizardStep(0);
    setShowForm(true);
  }

  function updateSatDate(newSat) {
    // 土曜を変えたら以降の全日程を連動して更新
    setEditing(prev => {
      const oldDates = prev.dates;
      const newDates = oldDates.map((d, i) => {
        if (i === 0) return newSat;
        // 元の土曜からの差分を保持して連動
        const oldSat = parseDateLocal(oldDates[0]);
        const oldD = parseDateLocal(d);
        const diffDays = Math.round((oldD - oldSat) / 86400000);
        const nd = parseDateLocal(newSat);
        nd.setDate(nd.getDate() + diffDays);
        return fmt(nd);
      });
      const dm = {};
      oldDates.forEach((d, i) => { dm[newDates[i]] = prev.dateMembers[d] || []; });
      return { ...prev, dates: newDates, dateMembers: dm };
    });
  }
  function updateSunDate(newSun) {
    const newSat = subOneDay(newSun);
    setEditing(prev => {
      const oldDates = prev.dates;
      const newDates = oldDates.map((d, i) => {
        if (i === 1) return newSun;
        if (i === 0) return newSat;
        const oldSun = parseDateLocal(oldDates[1]);
        const oldD = parseDateLocal(d);
        const diffDays = Math.round((oldD - oldSun) / 86400000);
        const nd = parseDateLocal(newSun);
        nd.setDate(nd.getDate() + diffDays);
        return fmt(nd);
      });
      const dm = {};
      oldDates.forEach((d, i) => { dm[newDates[i]] = prev.dateMembers[d] || []; });
      return { ...prev, dates: newDates, dateMembers: dm };
    });
  }
  function addDate() {
    setEditing(prev => {
      const last = prev.dates[prev.dates.length - 1];
      const nd = addOneDay(last);
      return {
        ...prev, dates: [...prev.dates, nd],
        dateMembers: { ...prev.dateMembers, [nd]: [{ member: '', role: 'クローザー', target: '', catcherCount: '' }] },
      };
    });
  }
  // 単日⇔2日（デフォルト）を切り替える
  function toggleSingleDay() {
    setEditing(prev => {
      if (prev.dates.length <= 1) {
        // 単日 → 2日に戻す：翌日を追加
        const first = prev.dates[0];
        const nd = addOneDay(first);
        return {
          ...prev,
          dates: [first, nd],
          dateMembers: { ...prev.dateMembers, [nd]: prev.dateMembers[nd] || [{ member: '', role: 'クローザー', target: '', catcherCount: '' }] },
        };
      }
      // 2日以上 → 単日にする：最初の日だけ残す
      const first = prev.dates[0];
      return { ...prev, dates: [first], dateMembers: { [first]: prev.dateMembers[first] || [] } };
    });
  }
  function addMember(date) {
    setEditing(prev => {
      const dm = { ...prev.dateMembers };
      dm[date] = [...(dm[date] || []), { member: '', role: 'クローザー', target: '', catcherCount: '' }];
      return { ...prev, dateMembers: dm };
    });
  }
  function removeMember(date, idx) {
    setEditing(prev => {
      const dm = { ...prev.dateMembers };
      dm[date] = dm[date].filter((_, i) => i !== idx);
      return { ...prev, dateMembers: dm };
    });
  }
  function updateMember(date, idx, patch) {
    setEditing(prev => {
      const dm = { ...prev.dateMembers };
      dm[date] = dm[date].map((m, i) => i === idx ? { ...m, ...patch } : m);
      return { ...prev, dateMembers: dm };
    });
  }
  function getRoleOpts(memberName) {
    const u = userList.find(u => u.name === memberName);
    return u ? getRoleOrder(u.grade) : ['ディレクター', 'クローザー', 'キャッチャー'];
  }

  // キャッチャー除外の合計計算（全日程合算）
  function calcTotalAssigned() {
    if (!editing) return 0;
    return editing.dates.reduce((total, dt) => {
      return total + (editing.dateMembers[dt] || [])
        .filter(m => m.role !== 'キャッチャー')
        .reduce((s, m) => s + (+m.target || 0), 0);
    }, 0);
  }

  // 全日程の合計（残数計算用）
  const totalAssigned = useMemo(() => {
    if (!editing) return 0;
    return (editing.dates || []).reduce((s, dt) => s + calcDayTotal(dt), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const overallNum = +editing?.overallTarget || 0;
  const remaining = overallNum - totalAssigned;
  const remainColor = remaining === 0 ? 'var(--green)' : remaining < 0 ? 'var(--red)' : 'var(--orange)';

  // キャッチャー除外の合計計算（1日分）
  function calcDayTotal(date) {
    if (!editing) return 0;
    return (editing.dateMembers[date] || [])
      .filter(m => m.role !== 'キャッチャー')
      .reduce((s, m) => s + (+m.target || 0), 0);
  }
  async function handleSave() {
    if (!editing.store || !editing.dates.length) { showToast('店舗名・日程は必須です'); return; }
    const data = {
      store: editing.store, channel: editing.channel || '',
      overallTarget: editing.overallTarget,
      dates: editing.dates, date: editing.dates[0],
      dateMembers: editing.dateMembers,
      updatedAt: Date.now(),
    };
    if (editing.id) { await set(ref(db, `fp_kpi/${editing.id}`), data); }
    else { await set(push(ref(db, 'fp_kpi')), data); }
    showToast('✅ 保存しました');
    setShowForm(false); setEditing(null);
  }
  async function handleDelete(id) {
    if (!confirm('削除しますか？')) return;
    await remove(ref(db, `fp_kpi/${id}`));
    showToast('🗑 削除しました');
    setShowForm(false); setEditing(null);
  }

  const filtered = useMemo(() => {
    return Object.entries(kpiData).filter(([, k]) => {
      const cOk = !channelFilter || k.channel === channelFilter;
      const mOk = !pickerVal || (k.dates || [k.date]).some(dt => {
        if (!dt) return false;
        const [y, m] = dt.split('-').map(Number);
        return y === pickerVal.year && m === pickerVal.month;
      });
      return cOk && mOk;
    }).sort((a, b) => (b[1].dates?.[0] || b[1].date || '').localeCompare(a[1].dates?.[0] || a[1].date || ''));
  }, [kpiData, pickerVal, channelFilter]);

  const weekGroups = useMemo(
    () => groupByWeek(filtered, ([, k]) => k.dates?.[0] || k.date),
    [filtered]
  );

  return (
    <div>
      <MonthPicker value={pickerVal} onChange={setPickerVal} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <select className="inp" style={{ flex: '0 0 auto', width: 'auto', padding: '8px 10px', fontSize: '.84rem' }}
          value={channelFilter} onChange={e => setChannelFilter(e.target.value)}>
          <option value="">すべての販路</option>
          {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn btn-p" style={{ flex: 1 }} onClick={initNewForm}>＋ KPIを登録</button>
      </div>

      {/* ===== フォーム（PC: 左右2カラム / モバイル: ステップウィザード） ===== */}
      {showForm && editing && isMobile && (
        <MobileKpiWizard
          editing={editing} setEditing={setEditing}
          wizardStep={wizardStep} setWizardStep={setWizardStep}
          userList={userList} calcTotalAssigned={calcTotalAssigned}
          calcDayTotal={calcDayTotal} getRoleOpts={getRoleOpts}
          updateSatDate={updateSatDate} updateSunDate={updateSunDate}
          addDate={addDate} toggleSingleDay={toggleSingleDay}
          addMember={addMember} removeMember={removeMember} updateMember={updateMember}
          handleSave={handleSave} onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
      {/* ===== A: 左右2カラム フォーム ===== */}
      {showForm && editing && !isMobile && (
        <div style={{
          background: '#fff', borderRadius: 'var(--r)',
          border: '1.5px solid var(--primary)', marginBottom: 14,
          boxShadow: 'var(--sh)', overflow: 'hidden',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'clamp(240px, 30%, 300px) 1fr',
            gap: 0,
            alignItems: 'start',
          }}>
            {/* 左パネル：基本情報（sticky） */}
            <div style={{
              borderRight: '1px solid var(--border)',
              padding: 16,
              position: 'sticky',
              top: 0,
              background: '#fafafa',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', marginBottom: 14 }}>
                {editing.id ? 'KPIを編集' : '＋ 新規KPI登録'}
              </div>

              {/* 店舗名 */}
              <div style={{ marginBottom: 10 }}>
                <label className="ts" style={{ display: 'block', marginBottom: 4 }}>店舗名</label>
                <input className="inp" value={editing.store}
                  onChange={e => setEditing({ ...editing, store: e.target.value })}
                  placeholder="" autoFocus />
              </div>

              {/* 販路 */}
              <div style={{ marginBottom: 10 }}>
                <label className="ts" style={{ display: 'block', marginBottom: 4 }}>販路</label>
                <select className="inp" value={editing.channel || ''}
                  onChange={e => setEditing({ ...editing, channel: e.target.value })}
                  style={{ padding: '9px 10px' }}>
                  <option value="">選択</option>
                  {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* 稼働日（連動） */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <label className="ts" style={{ margin: 0 }}>稼働日</label>
                  <span style={{ fontSize: 10, background: '#dbeafe', color: '#1e40af', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>変更すると連動</span>
                </div>
                {editing.dates.length === 1 ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--sub)', flex: '0 0 24px' }}>日付</span>
                    <input className="inp" type="date" value={editing.dates[0] || ''}
                      onChange={e => updateSatDate(e.target.value)}
                      style={{ flex: 1, padding: '7px 9px', fontSize: '.84rem' }} />
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--sub)', flex: '0 0 12px' }}>土</span>
                      <input className="inp" type="date" value={editing.dates[0] || ''}
                        onChange={e => updateSatDate(e.target.value)}
                        style={{ flex: 1, padding: '7px 9px', fontSize: '.84rem' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--sub)', flex: '0 0 12px' }}>日</span>
                      <input className="inp" type="date" value={editing.dates[1] || ''}
                        onChange={e => updateSunDate(e.target.value)}
                        style={{ flex: 1, padding: '7px 9px', fontSize: '.84rem' }} />
                    </div>
                  </>
                )}
                {editing.dates.slice(2).map((dt, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--sub)', flex: '0 0 12px' }}>{i + 3}</span>
                    <input className="inp" type="date" value={dt}
                      onChange={e => {
                        const newDates = [...editing.dates];
                        newDates[i + 2] = e.target.value;
                        const dm = { ...editing.dateMembers };
                        dm[e.target.value] = dm[dt] || [];
                        delete dm[dt];
                        setEditing({ ...editing, dates: newDates, dateMembers: dm });
                      }}
                      style={{ flex: 1, padding: '7px 9px', fontSize: '.84rem' }} />
                    <button onClick={() => setEditing(prev => {
                      const d = [...prev.dates]; d.splice(i + 2, 1);
                      return { ...prev, dates: d };
                    })} style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 8px', color: '#dc2626', cursor: 'pointer', fontSize: 11 }}>×</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                  <button className="btn btn-gray" style={{ flex: 1, fontSize: '.8rem', padding: '7px 12px' }} onClick={addDate}>
                    ＋ 日程を追加
                  </button>
                  <button
                    className={editing.dates.length === 1 ? 'btn btn-p' : 'btn btn-outline'}
                    style={{ flex: 1, fontSize: '.8rem', padding: '7px 12px' }}
                    onClick={toggleSingleDay}
                  >
                    {editing.dates.length === 1 ? '2日に戻す' : '単日'}
                  </button>
                </div>
              </div>

              {/* 現場全体目標 */}
              <div style={{ marginBottom: 14 }}>
                <label className="ts" style={{ display: 'block', marginBottom: 4 }}>現場全体目標</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input className="inp" type="text" inputMode="numeric"
                    value={editing.overallTarget || ''}
                    onChange={e => setEditing({ ...editing, overallTarget: e.target.value })}
                    placeholder="0"
                    style={{ textAlign: 'right' }} />
                  <span className="ts">件</span>
                </div>
                {/* リアルタイム残数表示 */}
                {overallNum > 0 && (
                  <div style={{
                    marginTop: 8, background: remaining === 0 ? '#d1fae5' : remaining < 0 ? '#fee2e2' : '#fff7ed',
                    borderRadius: 7, padding: '8px 10px',
                    border: `1px solid ${remaining === 0 ? '#a7f3d0' : remaining < 0 ? '#fca5a5' : '#fed7aa'}`,
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--sub)', marginBottom: 2 }}>KPIに対する残数</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: remainColor }}>
                      {remaining > 0 ? '+' : ''}{remaining}件
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--sub)', marginTop: 2 }}>
                      全体{overallNum}件 − 割当{totalAssigned}件
                    </div>
                  </div>
                )}
              </div>

              {/* 保存・削除・キャンセル */}
              <button className="btn btn-p" onClick={handleSave} style={{ marginBottom: 6 }}>保存</button>
              {editing.id && (
                <button className="btn" style={{ background: '#fee2e2', color: '#dc2626', width: '100%', marginBottom: 6 }}
                  onClick={() => handleDelete(editing.id)}>削除</button>
              )}
              <button className="btn btn-gray" onClick={() => { setShowForm(false); setEditing(null); }}>キャンセル</button>
            </div>

            {/* 右パネル：日程ごとのメンバーKPI入力（テーブル形式） */}
            <div style={{ padding: 16 }}>
              {editing.dates.map(dt => {
                const dayTotal = calcDayTotal(dt);
                const overall = +editing.overallTarget || 0;
                const matched = overall > 0 && dayTotal === overall;
                return (
                  <div key={dt} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: 'var(--or-d)',
                        background: 'var(--or-l)', padding: '5px 12px', borderRadius: 6,
                      }}>
                        {dateLabel(dt)}のKPI
                      </span>
                      <button className="btn btn-gray" style={{ fontSize: '.78rem', padding: '6px 10px' }} onClick={() => addMember(dt)}>
                        ＋ メンバーを追加
                      </button>
                    </div>

                    {/* テーブルヘッダー */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'minmax(120px,2fr) minmax(100px,1.2fr) 80px 100px 36px',
                      gap: 8, paddingBottom: 6, borderBottom: '1.5px solid var(--border)',
                      marginBottom: 6,
                    }}>
                      {['メンバー名', '役職', '目標', '', ''].map((h, i) => (
                        <span key={i} style={{ fontSize: 10, fontWeight: 700, color: 'var(--sub)' }}>{h}</span>
                      ))}
                    </div>

                    {/* メンバー行 */}
                    {(editing.dateMembers[dt] || []).map((m, mi) => {
                      const isCatcher = m.role === 'キャッチャー';
                      const roleOpts = m.member && m.member !== '他社' ? getRoleOpts(m.member) : ['ディレクター', 'クローザー', 'キャッチャー'];
                      return (
                        <div key={mi} style={{
                          display: 'grid', gridTemplateColumns: 'minmax(120px,2fr) minmax(100px,1.2fr) 80px 100px 36px',
                          gap: 6, marginBottom: 6, alignItems: 'start',
                        }}>
                          {/* 名前 */}
                          {m.member === '他社' ? (
                            <div style={{ background: '#f1f5f9', border: '1.5px solid var(--border)', borderRadius: 8, padding: '9px 11px', fontSize: '.84rem', color: 'var(--sub)', fontWeight: 600 }}>他社</div>
                          ) : (
                            <select className="inp" value={m.member || ''}
                              onChange={e => {
                                const name = e.target.value;
                                const u = userList.find(u => u.name === name);
                                const newRole = u ? getRoleOrder(u.grade)[0] : 'クローザー';
                                updateMember(dt, mi, { member: name, role: newRole });
                              }}>
                              <option value="">メンバーを選択</option>
                              {userList.map(u => <option key={u.name} value={u.name}>{u.name}</option>)}
                              <option value="他社">他社</option>
                            </select>
                          )}

                          {/* 役職 */}
                          <select className="inp" value={m.role || 'クローザー'}
                            onChange={e => updateMember(dt, mi, { role: e.target.value })}>
                            {roleOpts.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>

                          {/* 目標 / 着座（キャッチャー） */}
                          <div>
                            <input className="inp" type="text" inputMode="numeric"
                              value={isCatcher ? (m.catcherCount || '') : (m.target || '')}
                              onChange={e => updateMember(dt, mi, isCatcher ? { catcherCount: e.target.value } : { target: e.target.value })}
                              placeholder={isCatcher ? '着座数' : '目標'}
                              style={{ textAlign: 'right', background: isCatcher ? '#f9fafb' : '#fff' }}
                            />
                          </div>

                          {/* キャッチャー注記 */}
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            {isCatcher && (
                              <span style={{ fontSize: 10, color: 'var(--sub)', lineHeight: 1.3 }}>合計に含まない</span>
                            )}
                          </div>

                          {/* 削除 */}
                          {(editing.dateMembers[dt] || []).length > 1 && (
                            <button onClick={() => removeMember(dt, mi)}
                              style={{ background: '#fee2e2', border: 'none', borderRadius: 6, padding: '6px 8px', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}>
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {/* 合計表示（キャッチャー除く） */}
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 0', marginTop: 4, borderTop: '1.5px solid var(--border)',
                    }}>
                      <span style={{ fontSize: 12, color: 'var(--sub)' }}>合計目標（キャッチャー除く）</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: matched ? 'var(--green)' : 'var(--text)' }}>
                        {dayTotal}件
                        {overall > 0 && (
                          <span style={{ fontSize: 11, fontWeight: 400, color: matched ? 'var(--green)' : 'var(--red)', marginLeft: 6 }}>
                            / 全体目標 {overall}件 {matched ? '✓' : ''}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* KPI一覧 */}
      {filtered.length === 0 && <div className="empty">KPIデータなし</div>}
      {weekGroups.map((grp) => (
        <div key={grp.label}>
          <WeekSectionHeader
            label={grp.label}
            count={grp.items.length}
            isOpen={!!openWeeks[grp.label]}
            onClick={() => setOpenWeeks(prev => ({ ...prev, [grp.label]: !prev[grp.label] }))}
          />
          {openWeeks[grp.label] && grp.items.map(([id, k]) => {
        const dates = k.dates || [k.date].filter(Boolean);
        const dm = k.dateMembers || {};
        return (
          <div key={id} style={{ background: '#fff', borderRadius: 'var(--r)', border: `1.5px solid ${openIds[id] ? 'var(--primary)' : 'var(--border)'}`, marginBottom: 8, overflow: 'hidden', boxShadow: 'var(--sh-sm)' }}>
            <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
              onClick={() => setOpenIds(prev => ({ ...prev, [id]: !prev[id] }))}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{k.store}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                  {k.channel && <span className="badge b-orange">{k.channel}</span>}
                  <span className="ts">目標 <strong style={{ color: 'var(--text)' }}>{k.overallTarget || '−'}件</strong></span>
                  <span className="ts">{dates.map(dt => dateLabel(dt)).join('・')}</span>
                </div>
              </div>
              <span style={{ color: 'var(--sub)', fontSize: 13 }}>{openIds[id] ? '▾' : '›'}</span>
            </div>
            {openIds[id] && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '0 14px 14px' }}>
                {dates.map(dt => (
                  <div key={dt} style={{ border: '1px solid var(--border)', borderRadius: 8, marginTop: 10, overflow: 'hidden' }}>
                    <div style={{ background: '#f9fafb', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--sub)' }}>
                      {dateLabel(dt)}
                    </div>
                    <div style={{ padding: '8px 12px' }}>
                      {(dm[dt] || []).map((m, mi) => (
                        <div key={mi} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: m.member === '他社' ? 'var(--sub)' : 'var(--text)' }}>{m.member || '−'}</span>
                          <span className="ts">
                            {m.role}
                            {m.role === 'キャッチャー'
                              ? ` / 着座${m.catcherCount || '−'}組（合計に含まない）`
                              : ` / ${m.target || '−'}件`
                            }
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn btn-outline" style={{ flex: 1, fontSize: '.8rem', padding: '7px 12px' }} onClick={() => openEdit(id)}>編集</button>
                  <button className="btn" style={{ flex: 1, background: '#fee2e2', color: '#dc2626', fontSize: '.8rem', padding: '7px 12px' }} onClick={() => handleDelete(id)}>削除</button>
                </div>
              </div>
            )}
          </div>
        );
          })}
        </div>
      ))}
    </div>
  );
}

/* ===== モバイル向けKPIウィザード ===== */
function MobileKpiWizard({ editing, setEditing, wizardStep, setWizardStep, userList, calcTotalAssigned, calcDayTotal, getRoleOpts, updateSatDate, updateSunDate, addDate, toggleSingleDay, addMember, removeMember, updateMember, handleSave, onClose }) {
  const totalSteps = 1 + editing.dates.length + 1;
  const lastStep = totalSteps - 1;
  const isDayStep = wizardStep >= 1 && wizardStep <= editing.dates.length;
  const curDate = isDayStep ? editing.dates[wizardStep - 1] : null;
  const totalAssigned = calcTotalAssigned();
  const overall = +editing.overallTarget || 0;
  const remaining = overall - totalAssigned;
  const remainColor = remaining === 0 ? 'var(--green)' : remaining < 0 ? 'var(--red)' : 'var(--primary)';
  const stepLabels = ['基本情報', ...editing.dates.map(dt => dateLabel(dt)), '確認'];

  return (
    <div style={{ background: '#fff', borderRadius: 'var(--r)', border: '1.5px solid var(--primary)', marginBottom: 14, boxShadow: 'var(--sh)', overflow: 'hidden' }}>
      {/* ステップバー */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', overflowX: 'auto' }}>
        {stepLabels.map((lbl, i) => (
          <button key={i} onClick={() => setWizardStep(i)} style={{
            flex: '0 0 auto', padding: '10px 12px', border: 'none', cursor: 'pointer',
            background: 'transparent', fontSize: 11, fontWeight: 700,
            color: i === wizardStep ? 'var(--primary)' : i < wizardStep ? 'var(--green)' : 'var(--sub)',
            borderBottom: `3px solid ${i === wizardStep ? 'var(--primary)' : i < wizardStep ? 'var(--green)' : 'transparent'}`,
            whiteSpace: 'nowrap',
          }}>
            {i < wizardStep ? '✓ ' : ''}{lbl}
          </button>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {wizardStep > 0 && overall > 0 && (
          <div style={{ background: remaining === 0 ? '#d1fae5' : remaining < 0 ? '#fee2e2' : 'var(--pl)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: remainColor }}>KPIに対する残数</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: remainColor }}>{remaining}件</span>
          </div>
        )}

        {/* Step 0: 基本情報 */}
        {wizardStep === 0 && (
          <div>
            <div className="form-group">
              <label className="ts" style={{ display: 'block', marginBottom: 4 }}>店舗名</label>
              <input className="inp" value={editing.store} onChange={e => setEditing({ ...editing, store: e.target.value })} autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="ts" style={{ display: 'block', marginBottom: 4 }}>販路</label>
                <select className="inp" value={editing.channel || ''} onChange={e => setEditing({ ...editing, channel: e.target.value })} style={{ padding: '9px 10px' }}>
                  <option value="">選択</option>
                  {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ flex: '0 0 110px' }}>
                <label className="ts" style={{ display: 'block', marginBottom: 4 }}>全体目標</label>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input className="inp" type="text" inputMode="numeric" value={editing.overallTarget || ''} onChange={e => setEditing({ ...editing, overallTarget: e.target.value })} placeholder="0" style={{ textAlign: 'right' }} />
                  <span className="ts">件</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <label className="ts" style={{ margin: 0 }}>稼働日</label>
              <span style={{ fontSize: 10, background: '#dbeafe', color: '#1e40af', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>変更すると連動</span>
            </div>
            {editing.dates.length === 1 ? (
              <div style={{ marginBottom: 8 }}>
                <div className="ts" style={{ marginBottom: 3 }}>日付</div>
                <input className="inp" type="date" value={editing.dates[0] || ''} onChange={e => updateSatDate(e.target.value)} style={{ padding: '9px 10px', fontSize: '.9rem' }} />
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div className="ts" style={{ marginBottom: 3 }}>土</div>
                  <input className="inp" type="date" value={editing.dates[0] || ''} onChange={e => updateSatDate(e.target.value)} style={{ padding: '9px 10px', fontSize: '.9rem' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="ts" style={{ marginBottom: 3 }}>日</div>
                  <input className="inp" type="date" value={editing.dates[1] || ''} onChange={e => updateSunDate(e.target.value)} style={{ padding: '9px 10px', fontSize: '.9rem' }} />
                </div>
              </div>
            )}
            {editing.dates.slice(2).map((dt, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <div className="ts" style={{ marginBottom: 3 }}>{dateLabel(dt)}</div>
                  <input className="inp" type="date" value={dt} onChange={e => {
                    const newDates = [...editing.dates]; newDates[i + 2] = e.target.value;
                    const dm = { ...editing.dateMembers }; dm[e.target.value] = dm[dt] || []; delete dm[dt];
                    setEditing({ ...editing, dates: newDates, dateMembers: dm });
                  }} style={{ padding: '9px 10px', fontSize: '.9rem' }} />
                </div>
                <button onClick={() => setEditing(prev => { const d = [...prev.dates]; d.splice(i + 2, 1); return { ...prev, dates: d }; })}
                  style={{ background: '#fee2e2', border: 'none', borderRadius: 6, padding: '9px 11px', color: '#dc2626', cursor: 'pointer' }}>×</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-gray" style={{ flex: 1, fontSize: '.82rem', padding: '8px 12px' }} onClick={addDate}>＋ 日程を追加</button>
              <button
                className={editing.dates.length === 1 ? 'btn btn-p' : 'btn btn-outline'}
                style={{ flex: 1, fontSize: '.82rem', padding: '8px 12px' }}
                onClick={toggleSingleDay}
              >
                {editing.dates.length === 1 ? '2日に戻す' : '単日'}
              </button>
            </div>
          </div>
        )}

        {/* Step 1..N: 各日程のKPI */}
        {isDayStep && curDate && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--or-d)', background: 'var(--pl)', padding: '6px 12px', borderRadius: 6, marginBottom: 14, display: 'inline-block' }}>
              {dateLabel(curDate)}のKPI
            </div>
            {(editing.dateMembers[curDate] || []).map((m, mi) => {
              const isCatcher = m.role === 'キャッチャー';
              const roleOpts = m.member && m.member !== '他社' ? getRoleOpts(m.member) : ['ディレクター', 'クローザー', 'キャッチャー'];
              return (
                <div key={mi} style={{ background: '#f9fafb', borderRadius: 10, padding: 12, marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    {m.member === '他社' ? (
                      <div style={{ fontWeight: 700, color: 'var(--sub)', fontSize: 14 }}>他社</div>
                    ) : (
                      <select className="inp" style={{ flex: 1, marginRight: 8 }} value={m.member || ''}
                        onChange={e => {
                          const name = e.target.value;
                          const u = userList.find(u => u.name === name);
                          updateMember(curDate, mi, { member: name, role: u ? getRoleOpts(name)[0] : 'クローザー' });
                        }}>
                        <option value="">メンバーを選択</option>
                        {userList.map(u => <option key={u.name} value={u.name}>{u.name}</option>)}
                        <option value="他社">他社</option>
                      </select>
                    )}
                    {(editing.dateMembers[curDate] || []).length > 1 && (
                      <button onClick={() => removeMember(curDate, mi)} style={{ background: '#fee2e2', border: 'none', borderRadius: 6, padding: '8px 11px', color: '#dc2626', cursor: 'pointer', flexShrink: 0 }}>×</button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label className="ts" style={{ marginBottom: 3, display: 'block' }}>役職</label>
                      <select className="inp" value={m.role || 'クローザー'} onChange={e => updateMember(curDate, mi, { role: e.target.value })} style={{ padding: '9px 10px' }}>
                        {roleOpts.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: '0 0 110px' }}>
                      <label className="ts" style={{ marginBottom: 3, display: 'block' }}>{isCatcher ? '着座数' : '目標'}</label>
                      <input className="inp" type="text" inputMode="numeric"
                        value={isCatcher ? (m.catcherCount || '') : (m.target || '')}
                        onChange={e => updateMember(curDate, mi, isCatcher ? { catcherCount: e.target.value } : { target: e.target.value })}
                        placeholder="0" style={{ textAlign: 'right', background: isCatcher ? '#f3f4f6' : '#fff' }} />
                      {isCatcher && <div style={{ fontSize: 10, color: 'var(--sub)', marginTop: 2 }}>合計に含まない</div>}
                    </div>
                  </div>
                </div>
              );
            })}
            <button className="btn btn-gray" style={{ marginBottom: 10 }} onClick={() => addMember(curDate)}>＋ メンバーを追加</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1.5px solid var(--border)' }}>
              <span className="ts">合計（キャッチャー除く）</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{calcDayTotal(curDate)}件</span>
            </div>
          </div>
        )}

        {/* 最終Step: 確認 */}
        {wizardStep === lastStep && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{editing.store || '（店舗名未入力）'}</div>
            <div className="ts" style={{ marginBottom: 12 }}>全体目標 {editing.overallTarget || '−'}件 / {editing.dates.map(dt => dateLabel(dt)).join('・')}</div>
            {editing.dates.map(dt => (
              <div key={dt} style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
                <div style={{ background: '#f9fafb', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--sub)' }}>{dateLabel(dt)}</div>
                <div style={{ padding: '8px 12px' }}>
                  {(editing.dateMembers[dt] || []).map((m, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                      <span style={{ fontWeight: 600 }}>{m.member || '（未選択）'}</span>
                      <span className="ts">{m.role} / {m.role === 'キャッチャー' ? `着座${m.catcherCount || '−'}組` : `${m.target || '−'}件`}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--border)', marginTop: 4, fontSize: 12 }}>
                    <span style={{ color: 'var(--sub)' }}>合計</span>
                    <span style={{ fontWeight: 700 }}>{calcDayTotal(dt)}件</span>
                  </div>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1.5px solid var(--border)', marginBottom: 4 }}>
              <span className="ts">全体合計 / 残数</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: remainColor }}>{totalAssigned}件 / 残{remaining}件</span>
            </div>
          </div>
        )}

        {/* ナビゲーション */}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn btn-gray" style={{ flex: 1 }} onClick={() => { if (wizardStep === 0) onClose(); else setWizardStep(s => s - 1); }}>
            {wizardStep === 0 ? 'キャンセル' : '← 戻る'}
          </button>
          {wizardStep < lastStep ? (
            <button className="btn btn-p" style={{ flex: 2 }} onClick={() => setWizardStep(s => s + 1)}>次へ →</button>
          ) : (
            <button className="btn btn-p" style={{ flex: 2 }} onClick={handleSave}>💾 保存</button>
          )}
        </div>
      </div>
    </div>
  );
}

function UserCard({ id, u, idx, isOpen, onToggle, approve, saveUser, deleteUser, permLabel, avatarBg, avatarCol }) {
  const [pendingPos, setPendingPos] = useState(u.position || 'NV');
  const [pendingGrade, setPendingGrade] = useState(u.grade || 'R');
  const isPending = u.permission === 'pending';
  const initials = (u.name || '?').slice(0, 1);

  return (
    <div style={{ background: '#fff', borderRadius: 'var(--r)', border: `1.5px solid ${isOpen ? 'var(--primary)' : isPending ? '#fde68a' : 'var(--border)'}`, marginBottom: 8, overflow: 'hidden', boxShadow: 'var(--sh-sm)' }}>
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={onToggle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: avatarCol, flexShrink: 0 }}>
            {initials}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{u.name || '名前未設定'}</div>
            <div style={{ display: 'flex', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
              {u.position && <span className="badge b-purple">{u.position}</span>}
              {u.grade && <span className="badge b-orange">等級{u.grade}</span>}
              {isPending
                ? <span className="badge b-yellow">申請中</span>
                : <span className="badge b-green">{permLabel[u.permission || 'edit']}</span>
              }
            </div>
          </div>
        </div>
        <span style={{ color: 'var(--sub)', fontSize: 13 }}>{isOpen ? '▾' : '›'}</span>
      </div>
      {isOpen && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 14 }}>
          {u.email && <div className="ts" style={{ marginBottom: 10 }}>{u.email}</div>}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div className="ts" style={{ marginBottom: 4 }}>役職</div>
              <select className="inp" value={pendingPos} onChange={e => setPendingPos(e.target.value)} style={{ padding: '9px 10px' }}>
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div className="ts" style={{ marginBottom: 4 }}>等級</div>
              <select className="inp" value={pendingGrade} onChange={e => setPendingGrade(e.target.value)} style={{ padding: '9px 10px' }}>
                {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>
          {isPending ? (
            <>
              <button className="btn" style={{ background: 'var(--green)', color: '#fff', width: '100%', marginBottom: 8 }}
                onClick={() => approve(id, pendingPos, pendingGrade)}>
                ✅ 承認して登録
              </button>
              <button className="btn" style={{ background: '#fee2e2', color: '#dc2626' }}
                onClick={() => saveUser(id, { permission: 'disabled' })}>
                拒否
              </button>
            </>
          ) : (
            <>
              <div className="ts" style={{ marginBottom: 6 }}>権限</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                <button className="btn btn-outline" style={{ fontSize: '.8rem', padding: '7px 10px' }} onClick={() => saveUser(id, { permission: 'edit' })}>編集可に</button>
                <button className="btn btn-gray" style={{ fontSize: '.8rem', padding: '7px 10px' }} onClick={() => saveUser(id, { permission: 'readonly' })}>閲覧のみに</button>
                <button className="btn" style={{ background: '#fee2e2', color: '#dc2626', fontSize: '.8rem', padding: '7px 10px' }} onClick={() => saveUser(id, { permission: 'disabled' })}>ログイン不可</button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-p" style={{ flex: 1, fontSize: '.84rem' }}
                  onClick={() => saveUser(id, { position: pendingPos, grade: pendingGrade })}>
                  変更を保存
                </button>
                <button className="btn" style={{ flex: 1, background: '#fee2e2', color: '#dc2626', fontSize: '.84rem' }}
                  onClick={() => deleteUser(id, u.name)}>
                  🗑 削除
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function UsersTab() {
  const { data: users } = useFirebaseList('fp_users');
  const showToast = useToast();
  const [posFilter, setPosFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [sortKey, setSortKey] = useState('pending'); // 'pending'|'name'|'position'|'grade'|'permission'
  const [openIds, setOpenIds] = useState({});
  const [allOpen, setAllOpen] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newUser, setNewUser] = useState({ name:'', email:'', position:'NV', grade:'R' });

  const permLabel = { edit:'編集・登録可', readonly:'閲覧のみ', disabled:'ログイン不可', pending:'申請中' };
  const AVATAR_BG  = ['#fff7ed','#ede9fe','#fce7f3','#d1fae5','#dbeafe','#fef3c7'];
  const AVATAR_COL = ['#c2410c','#6d28d9','#be185d','#065f46','#1e40af','#92400e'];
  const POS_ORDER = { '責任者':0,'MQ':1,'SAM':2,'IN':3,'NV':4 };
  const GRADE_ORDER = { 'S':0,'A':1,'B':2,'C':3,'R':4 };

  const entries = useMemo(()=>{
    return Object.entries(users).filter(([,u])=>{
      const pOk = !posFilter || u.position===posFilter;
      const gOk = !gradeFilter || u.grade===gradeFilter;
      return pOk && gOk;
    }).sort((a,b)=>{
      const ua=a[1], ub=b[1];
      // 申請中は常に最上位
      if (ua.permission==='pending' && ub.permission!=='pending') return -1;
      if (ub.permission==='pending' && ua.permission!=='pending') return 1;
      if (sortKey==='name') return (ua.name||'').localeCompare(ub.name||'');
      if (sortKey==='position') return (POS_ORDER[ua.position]??99)-(POS_ORDER[ub.position]??99);
      if (sortKey==='grade') return (GRADE_ORDER[ua.grade]??99)-(GRADE_ORDER[ub.grade]??99);
      if (sortKey==='permission') return (ua.permission||'').localeCompare(ub.permission||'');
      return (ua.name||'').localeCompare(ub.name||'');
    });
  }, [users, posFilter, gradeFilter, sortKey]);

  // 全展開/全収束の状態を同期
  useEffect(() => {
    if (allOpen) {
      const newIds = {};
      entries.forEach(([id]) => { newIds[id] = true; });
      setOpenIds(newIds);
    } else {
      setOpenIds({});
    }
  }, [allOpen]);

  async function approve(id, position, grade) {
    await set(ref(db,`fp_users/${id}/permission`), 'edit');
    await set(ref(db,`fp_users/${id}/position`), position||'NV');
    await set(ref(db,`fp_users/${id}/grade`), grade||'R');
    showToast('✅ 承認しました');
  }
  async function saveUser(id, patch) {
    await Promise.all(Object.entries(patch).map(([k,v])=>set(ref(db,`fp_users/${id}/${k}`),v)));
    showToast('✅ 更新しました');
  }
  async function deleteUser(id, name) {
    if (!confirm(`「${name}」を削除しますか？この操作は元に戻せません。`)) return;
    await remove(ref(db, `fp_users/${id}`));
    showToast('🗑 削除しました');
  }
  async function registerNewUser() {
    if (!newUser.name.trim()) { showToast('名前は必須です'); return; }
    await set(push(ref(db,'fp_users')), {
      name: newUser.name, email: newUser.email,
      position: newUser.position, grade: newUser.grade,
      permission: 'edit', createdAt: Date.now(),
    });
    showToast('✅ ユーザーを登録しました');
    setNewUser({ name:'', email:'', position:'NV', grade:'R' });
    setShowNewForm(false);
  }

  return (
    <div>
      {/* フィルター・並び替え・全展開 */}
      <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap', alignItems:'center' }}>
        <select className="inp" style={{ width:'auto', padding:'8px 10px', fontSize:'.84rem' }}
          value={posFilter} onChange={e=>setPosFilter(e.target.value)}>
          <option value="">すべての役職</option>
          {POSITIONS.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
        <select className="inp" style={{ width:'auto', padding:'8px 10px', fontSize:'.84rem' }}
          value={gradeFilter} onChange={e=>setGradeFilter(e.target.value)}>
          <option value="">すべての等級</option>
          {GRADES.map(g=><option key={g} value={g}>{g}</option>)}
        </select>
        <select className="inp" style={{ width:'auto', padding:'8px 10px', fontSize:'.84rem' }}
          value={sortKey} onChange={e=>setSortKey(e.target.value)}>
          <option value="name">名前順</option>
          <option value="position">役職順</option>
          <option value="grade">等級順</option>
          <option value="permission">権限順</option>
        </select>
        <button
          onClick={() => setAllOpen(v => !v)}
          className="btn btn-gray"
          style={{ fontSize:'.82rem', padding:'8px 12px', whiteSpace:'nowrap' }}
        >
          {allOpen ? '全収束 ▲' : '全展開 ▼'}
        </button>
      </div>

      {/* 新規ユーザー登録フォーム */}
      <div style={{ background:'#fff', borderRadius:'var(--r)', border:'1.5px solid var(--primary)', marginBottom:12, overflow:'hidden', boxShadow:'var(--sh-sm)' }}>
        <div style={{ padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }}
          onClick={()=>setShowNewForm(!showNewForm)}>
          <span style={{ fontSize:13, fontWeight:700, color:'var(--primary)' }}>＋ ユーザーを新規登録</span>
          <span style={{ color:'var(--sub)', fontSize:13 }}>{showNewForm?'▾':'›'}</span>
        </div>
        {showNewForm && (
          <div style={{ borderTop:'1px solid var(--border)', padding:14 }}>
            <div style={{ display:'flex', gap:8, marginBottom:8 }}>
              <div style={{ flex:1 }}>
                <div className="ts" style={{ marginBottom:4 }}>名前</div>
                <input className="inp" value={newUser.name} onChange={e=>setNewUser({...newUser,name:e.target.value})} placeholder="" />
              </div>
              <div style={{ flex:1 }}>
                <div className="ts" style={{ marginBottom:4 }}>メールアドレス</div>
                <input className="inp" type="email" value={newUser.email} onChange={e=>setNewUser({...newUser,email:e.target.value})} placeholder="" />
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              <div style={{ flex:1 }}>
                <div className="ts" style={{ marginBottom:4 }}>役職</div>
                <select className="inp" value={newUser.position} onChange={e=>setNewUser({...newUser,position:e.target.value})} style={{ padding:'9px 10px' }}>
                  {POSITIONS.map(p=><option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ flex:1 }}>
                <div className="ts" style={{ marginBottom:4 }}>等級</div>
                <select className="inp" value={newUser.grade} onChange={e=>setNewUser({...newUser,grade:e.target.value})} style={{ padding:'9px 10px' }}>
                  {GRADES.map(g=><option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>
            <button className="btn btn-p" onClick={registerNewUser}>登録する</button>
          </div>
        )}
      </div>

      {entries.length===0 && <div className="empty">登録ユーザーなし</div>}

      {/* PC: 2カラムグリッド */}
      <div className="pc-grid-2col">
        {entries.map(([id,u],idx)=>(
          <UserCard
            key={id} id={id} u={u} idx={idx}
            isOpen={!!openIds[id]}
            onToggle={()=>{
              setAllOpen(false);
              setOpenIds(prev=>({...prev,[id]:!prev[id]}));
            }}
            approve={approve} saveUser={saveUser} deleteUser={deleteUser}
            permLabel={permLabel}
            avatarBg={AVATAR_BG[idx%AVATAR_BG.length]}
            avatarCol={AVATAR_COL[idx%AVATAR_COL.length]}
          />
        ))}
      </div>
    </div>
  );
}
