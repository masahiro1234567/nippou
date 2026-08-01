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
      {filtered.length===0 && <div className="empty">データなし</div>}
      {filtered.map(([id,r])=>(
        <div key={id} className="report-card" style={{ cursor:'default' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
            <div className="fw8">{r.store||'−'}</div>
            <span className="ts">{r.date}（{dowStr(r.date)}）</span>
          </div>
          <div style={{ display:'flex', gap:5, marginBottom:8, flexWrap:'wrap' }}>
            <span className="badge b-blue">{r.channel||'−'}</span>
            <span className="badge b-gray">{r.director||r.userName||'−'}</span>
            <span className="badge b-green">{r.ach||0}%</span>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-outline" style={{ fontSize:'.8rem', padding:'7px 12px' }} onClick={()=>navigate(`/report/edit/${id}`)}>編集</button>
            <button className="btn" style={{ background:'#fee2e2', color:'#dc2626', fontSize:'.8rem', padding:'7px 12px' }} onClick={()=>handleDelete(id)}>削除</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ===== ② KPIタブ（管理者設定） ===== */
function AdminKpiTab() {
  const { data: kpiData } = useFirebaseList('fp_kpi');
  const { data: fpUsers } = useFirebaseList('fp_users');
  const showToast = useToast();
  const [pickerVal, setPickerVal] = useState(null);
  const [channelFilter, setChannelFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [openIds, setOpenIds] = useState({});
  const [editing, setEditing] = useState(null);

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
    setShowForm(true);
  }

  function openEdit(id) {
    const k = kpiData[id];
    setEditing({
      id, store: k.store || '', channel: k.channel || '', overallTarget: k.overallTarget || '',
      dates: k.dates || [k.date].filter(Boolean),
      dateMembers: k.dateMembers || {},
    });
    setShowForm(true);
  }

  function updateSatDate(newSat) {
    const newSun = addOneDay(newSat);
    setEditing(prev => {
      const oldDates = prev.dates;
      const newDates = oldDates.map((d, i) => i === 0 ? newSat : i === 1 ? newSun : d);
      const dm = { ...prev.dateMembers };
      if (oldDates[0] && oldDates[0] !== newSat) { dm[newSat] = dm[oldDates[0]] || []; delete dm[oldDates[0]]; }
      if (oldDates[1] && oldDates[1] !== newSun) { dm[newSun] = dm[oldDates[1]] || []; delete dm[oldDates[1]]; }
      return { ...prev, dates: newDates, dateMembers: dm };
    });
  }
  function updateSunDate(newSun) {
    const newSat = subOneDay(newSun);
    setEditing(prev => {
      const oldDates = prev.dates;
      const newDates = oldDates.map((d, i) => i === 0 ? newSat : i === 1 ? newSun : d);
      const dm = { ...prev.dateMembers };
      if (oldDates[0] && oldDates[0] !== newSat) { dm[newSat] = dm[oldDates[0]] || []; delete dm[oldDates[0]]; }
      if (oldDates[1] && oldDates[1] !== newSun) { dm[newSun] = dm[oldDates[1]] || []; delete dm[oldDates[1]]; }
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

      {/* ===== A: 左右2カラム フォーム ===== */}
      {showForm && editing && (
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
                <button className="btn btn-gray" style={{ width: '100%', fontSize: '.8rem', padding: '7px 12px', marginTop: 2 }} onClick={addDate}>
                  ＋ 日程を追加
                </button>
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
                      display: 'grid', gridTemplateColumns: '2fr 1.2fr 90px 80px 32px',
                      gap: 6, paddingBottom: 6, borderBottom: '1.5px solid var(--border)',
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
                          display: 'grid', gridTemplateColumns: '2fr 1.2fr 90px 80px 32px',
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
      {filtered.map(([id, k]) => {
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
                  <button className="btn" style={{ background: '#fee2e2', color: '#dc2626', fontSize: '.8rem', padding: '7px 12px' }} onClick={() => handleDelete(id)}>削除</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function UsersTab() {
  const { data: users } = useFirebaseList('fp_users');
  const showToast = useToast();
  const [posFilter, setPosFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [openIds, setOpenIds] = useState({});
  const [showNewForm, setShowNewForm] = useState(false);
  const [newUser, setNewUser] = useState({ name:'', email:'', position:'NV', grade:'R' });

  const permLabel = { edit:'編集・登録可', readonly:'閲覧のみ', disabled:'ログイン不可', pending:'申請中' };
  const AVATAR_BG  = ['#fff7ed','#ede9fe','#fce7f3','#d1fae5','#dbeafe','#fef3c7'];
  const AVATAR_COL = ['#c2410c','#6d28d9','#be185d','#065f46','#1e40af','#92400e'];

  const entries = useMemo(()=>{
    return Object.entries(users).filter(([,u])=>{
      const pOk = !posFilter || u.position===posFilter;
      const gOk = !gradeFilter || u.grade===gradeFilter;
      return pOk && gOk;
    }).sort((a,b)=>{
      if (a[1].permission==='pending' && b[1].permission!=='pending') return -1;
      if (b[1].permission==='pending' && a[1].permission!=='pending') return 1;
      return (a[1].name||'').localeCompare(b[1].name||'');
    });
  }, [users, posFilter, gradeFilter]);

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
      <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap' }}>
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
      {entries.map(([id,u],idx)=>{
        const isPending = u.permission==='pending';
        const bg = AVATAR_BG[idx%AVATAR_BG.length];
        const tc = AVATAR_COL[idx%AVATAR_COL.length];
        const initials = (u.name||'?').slice(0,1);
        const [pendingPos, setPendingPos] = useState(u.position||'NV');
        const [pendingGrade, setPendingGrade] = useState(u.grade||'R');
        return (
          <div key={id} style={{ background:'#fff', borderRadius:'var(--r)', border:`1.5px solid ${openIds[id]?'var(--primary)':isPending?'#fde68a':'var(--border)'}`, marginBottom:8, overflow:'hidden', boxShadow:'var(--sh-sm)' }}>
            <div style={{ padding:'12px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer' }}
              onClick={()=>setOpenIds(prev=>({...prev,[id]:!prev[id]}))}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:38, height:38, borderRadius:'50%', background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:tc, flexShrink:0 }}>
                  {initials}
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:700 }}>{u.name||'名前未設定'}</div>
                  <div style={{ display:'flex', gap:5, marginTop:3, flexWrap:'wrap' }}>
                    {u.position && <span className="badge b-purple">{u.position}</span>}
                    {/* ⑤ 「等級A」表示 */}
                    {u.grade && <span className="badge b-orange">等級{u.grade}</span>}
                    {isPending
                      ? <span className="badge b-yellow">申請中</span>
                      : <span className="badge b-green">{permLabel[u.permission||'edit']}</span>
                    }
                  </div>
                </div>
              </div>
              <span style={{ color:'var(--sub)', fontSize:13 }}>{openIds[id]?'▾':'›'}</span>
            </div>

            {openIds[id] && (
              <div style={{ borderTop:'1px solid var(--border)', padding:14 }}>
                {u.email && <div className="ts" style={{ marginBottom:10 }}>{u.email}</div>}
                <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                  <div style={{ flex:1 }}>
                    <div className="ts" style={{ marginBottom:4 }}>役職</div>
                    <select className="inp" defaultValue={u.position||'NV'} onChange={e=>setPendingPos(e.target.value)} style={{ padding:'9px 10px' }}>
                      {POSITIONS.map(p=><option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div style={{ flex:1 }}>
                    <div className="ts" style={{ marginBottom:4 }}>等級</div>
                    <select className="inp" defaultValue={u.grade||'R'} onChange={e=>setPendingGrade(e.target.value)} style={{ padding:'9px 10px' }}>
                      {GRADES.map(g=><option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>
                {isPending ? (
                  <>
                    <button className="btn" style={{ background:'var(--green)', color:'#fff', width:'100%', marginBottom:8 }}
                      onClick={()=>approve(id, pendingPos, pendingGrade)}>
                      ✅ 承認して登録
                    </button>
                    <button className="btn" style={{ background:'#fee2e2', color:'#dc2626' }}
                      onClick={()=>saveUser(id,{ permission:'disabled' })}>
                      拒否
                    </button>
                  </>
                ) : (
                  <>
                    <div className="ts" style={{ marginBottom:6 }}>権限</div>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
                      <button className="btn btn-outline" style={{ fontSize:'.8rem', padding:'7px 10px' }} onClick={()=>saveUser(id,{permission:'edit'})}>編集可に</button>
                      <button className="btn btn-gray" style={{ fontSize:'.8rem', padding:'7px 10px' }} onClick={()=>saveUser(id,{permission:'readonly'})}>閲覧のみに</button>
                      <button className="btn" style={{ background:'#fee2e2', color:'#dc2626', fontSize:'.8rem', padding:'7px 10px' }} onClick={()=>saveUser(id,{permission:'disabled'})}>ログイン不可</button>
                    </div>
                    <button className="btn btn-p" style={{ fontSize:'.84rem' }}
                      onClick={()=>saveUser(id,{ position:pendingPos, grade:pendingGrade })}>
                      変更を保存
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
