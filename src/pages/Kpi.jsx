import { useMemo, useState } from 'react';
import { ref, push, set, remove } from 'firebase/database';
import { db } from '../lib/firebase';
import { useFirebaseList } from '../lib/useFirebaseList';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import Layout from '../components/Layout';

const DOWS = ['日', '月', '火', '水', '木', '金', '土'];
function parseDateLocal(str) {
  if (!str) return new Date();
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function dowLabel(dateStr) {
  return dateStr ? DOWS[parseDateLocal(dateStr).getDay()] + '曜日' : '';
}
function todayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
function nextDay(dateStr) {
  const d = parseDateLocal(dateStr);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function findActual(reports, date, store, memberName) {
  const r = Object.values(reports).find(
    (rep) =>
      (rep.workDays || [rep.date]).includes(date) &&
      rep.store === store &&
      (rep.userName === memberName || rep.director === memberName)
  );
  if (!r) return null;
  const idx = (r.workDays || [r.date]).indexOf(date);
  if (r.fp_by_day && r.fp_by_day[idx]) return +r.fp_by_day[idx].a || 0;
  return +r.r_fa || 0;
}

export default function Kpi() {
  const { data: kpiData } = useFirebaseList('fp_kpi');
  const { data: reports } = useFirebaseList('fp_reports');
  const { data: fpUsers } = useFirebaseList('fp_users');
  const { isAdmin } = useAuth();
  const showToast = useToast();
  const [editing, setEditing] = useState(null);

  const registeredNames = useMemo(() => new Set(Object.values(fpUsers).map((u) => u.name).filter(Boolean)), [fpUsers]);

  const cards = useMemo(() => {
    return Object.entries(kpiData)
      .map(([id, k]) => {
        const dates = k.dates || [k.date].filter(Boolean);
        const mode = k.mode || 'souhan';
        const dateMembers = k.dateMembers || {};
        const totalTarget = dates.reduce((s, dt) => {
          const ms = dateMembers[dt] || [];
          return s + ms.filter((m) => m.role !== 'キャッチャー').reduce((s2, m) => s2 + (+m.target || 0), 0);
        }, 0);
        let totalActual = 0;
        const perDate = dates.map((dt) => {
          const ms = dateMembers[dt] || [];
          const rows = ms.map((m) => {
            const actual = findActual(reports, dt, k.store, m.member);
            if (m.role !== 'キャッチャー' && actual !== null) totalActual += actual;
            const isOwn = registeredNames.has(m.member);
            return { ...m, actual, isOwn };
          });
          return { date: dt, rows };
        });
        const ach = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;
        return { id, k, mode, dates, perDate, totalTarget, totalActual, ach };
      })
      .sort((a, b) => (b.dates[0] || '').localeCompare(a.dates[0] || ''));
  }, [kpiData, reports, registeredNames]);

  function openNew() {
    const d0 = todayStr();
    setEditing({
      store: '',
      mode: 'souhan',
      overallTarget: '',
      dates: [d0],
      dateMembers: { [d0]: [{ member: '', role: 'クローザー', target: '', catcherCount: '' }] },
    });
  }
  function openEdit(id) {
    const k = kpiData[id];
    setEditing({ id, store: k.store || '', mode: k.mode || 'souhan', overallTarget: k.overallTarget || '', dates: k.dates || [k.date].filter(Boolean), dateMembers: k.dateMembers || {} });
  }

  function updateMember(date, idx, patch) {
    setEditing((prev) => {
      const dm = { ...prev.dateMembers };
      dm[date] = dm[date].map((m, i) => (i === idx ? { ...m, ...patch } : m));
      return { ...prev, dateMembers: dm };
    });
  }
  function addMember(date) {
    setEditing((prev) => {
      const dm = { ...prev.dateMembers };
      dm[date] = [...(dm[date] || []), { member: '', role: 'クローザー', target: '', catcherCount: '' }];
      return { ...prev, dateMembers: dm };
    });
  }
  function removeMember(date, idx) {
    setEditing((prev) => {
      const dm = { ...prev.dateMembers };
      dm[date] = dm[date].filter((_, i) => i !== idx);
      return { ...prev, dateMembers: dm };
    });
  }
  function addDate() {
    setEditing((prev) => {
      const last = prev.dates[prev.dates.length - 1];
      const nd = nextDay(last);
      return { ...prev, dates: [...prev.dates, nd], dateMembers: { ...prev.dateMembers, [nd]: [{ member: '', role: 'クローザー', target: '', catcherCount: '' }] } };
    });
  }

  const memberSum = useMemo(() => {
    if (!editing) return 0;
    return editing.dates.reduce((s, dt) => {
      const ms = editing.dateMembers[dt] || [];
      return s + ms.filter((m) => m.role !== 'キャッチャー').reduce((s2, m) => s2 + (+m.target || 0), 0);
    }, 0);
  }, [editing]);

  async function handleSave() {
    if (!editing.store || !editing.dates.length) {
      showToast('店舗名・日程は必須です');
      return;
    }
    const data = {
      store: editing.store,
      mode: editing.mode,
      overallTarget: editing.overallTarget,
      dates: editing.dates,
      date: editing.dates[0],
      dateMembers: Object.fromEntries(
        Object.entries(editing.dateMembers).map(([dt, ms]) => [
          dt,
          ms.map(({ _custom, ...rest }) => rest),
        ])
      ),
      updatedAt: Date.now(),
    };
    if (editing.id) {
      await set(ref(db, `fp_kpi/${editing.id}`), data);
    } else {
      await set(push(ref(db, 'fp_kpi')), data);
    }
    showToast('✅ 保存しました');
    setEditing(null);
  }
  async function handleDelete(id) {
    if (!confirm('このKPIを削除しますか？')) return;
    await remove(ref(db, `fp_kpi/${id}`));
    showToast('🗑 削除しました');
    setEditing(null);
  }

  return (
    <Layout title="KPI管理" showBack>
      {isAdmin && (
        <button className="btn btn-p" style={{ marginBottom: 12 }} onClick={openNew}>
          ＋ KPIを登録
        </button>
      )}

      {cards.length === 0 && <div className="empty">KPIデータなし</div>}

      {cards.map(({ id, k, mode, dates, perDate, totalTarget, totalActual, ach }) => {
        const color = ach >= 100 ? 'var(--green)' : ach >= 70 ? 'var(--orange)' : 'var(--red)';
        return (
          <div key={id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div className="fw8">{k.store}</div>
                <div className="ts">{mode === 'souhan' ? '総販' : 'リク抜き'}でカウント</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 900, fontSize: '1rem', color }}>{ach}%</div>
                <div className="ts">{totalActual}件 / 目標{totalTarget || k.overallTarget || 0}件</div>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '.72rem', width: '100%' }}>
                <thead>
                  <tr>
                    <td></td>
                    {dates.map((dt) => (
                      <td key={dt} colSpan={2} style={{ textAlign: 'center', color: 'var(--sub)', borderBottom: '1px solid var(--border)', padding: 5 }}>
                        {dt}（{dowLabel(dt)}）
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(perDate[0]?.rows || []).map((_, ri) => (
                    <tr key={ri}>
                      <td style={{ padding: '4px 6px' }}>{perDate[0].rows[ri].role}</td>
                      {perDate.map((pd) => {
                        const m = pd.rows[ri];
                        if (!m) return <td key={pd.date} colSpan={2}></td>;
                        const bg = m.isOwn ? '#faeeda' : 'transparent';
                        const isCatcher = m.role === 'キャッチャー';
                        return (
                          <td key={pd.date} colSpan={2} style={{ background: bg, padding: '4px 6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontWeight: m.isOwn ? 700 : 400, color: m.isOwn ? 'var(--text)' : 'var(--sub)' }}>{m.member || '他社'}</span>
                              <span style={{ fontWeight: 700 }}>
                                {isCatcher ? `着座${m.catcherCount || 0}組` : `${m.target || 0}件`}
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {isAdmin && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn-outline" onClick={() => openEdit(id)}>編集</button>
                <button className="btn" style={{ background: '#fee2e2', color: '#dc2626' }} onClick={() => handleDelete(id)}>削除</button>
              </div>
            )}
          </div>
        );
      })}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 10 }}>{editing.id ? 'KPIを編集' : 'KPIを登録'}</h3>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <input className="inp" style={{ flex: 1, marginRight: 8 }} placeholder="店舗名" value={editing.store} onChange={(e) => setEditing({ ...editing, store: e.target.value })} />
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '.7rem', color: 'var(--sub)', marginBottom: 4 }}>カウント方式</div>
                <div
                  onClick={() => setEditing({ ...editing, mode: editing.mode === 'souhan' ? 'riku' : 'souhan' })}
                  style={{ display: 'flex', border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden', width: 128, cursor: 'pointer' }}
                >
                  <div style={{ width: 64, textAlign: 'center', padding: '6px 0', fontSize: '.72rem', fontWeight: 700, background: editing.mode === 'souhan' ? 'var(--primary)' : '#fff', color: editing.mode === 'souhan' ? '#fff' : 'var(--sub)' }}>総販</div>
                  <div style={{ width: 64, textAlign: 'center', padding: '6px 0', fontSize: '.72rem', fontWeight: 700, background: editing.mode === 'riku' ? 'var(--primary)' : '#fff', color: editing.mode === 'riku' ? '#fff' : 'var(--sub)' }}>リク抜き</div>
                </div>
              </div>
              <div style={{ flex: '0 0 100px' }}>
                <div style={{ fontSize: '.7rem', color: 'var(--sub)', marginBottom: 4 }}>現場全体の目標</div>
                <input
                  className="inp"
                  style={{ width: '100%', boxSizing: 'border-box', textAlign: 'right' }}
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={editing.overallTarget}
                  onChange={(e) => setEditing({ ...editing, overallTarget: e.target.value })}
                />
              </div>
            </div>

            {editing.dates.map((dt) => (
              <div key={dt} style={{ background: 'var(--pl)', borderRadius: 10, padding: 11, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <input
                    className="inp-s"
                    type="date"
                    style={{ width: 'auto' }}
                    value={dt}
                    onChange={(e) => {
                      const idx = editing.dates.indexOf(dt);
                      const newDates = [...editing.dates];
                      newDates[idx] = e.target.value;
                      const dm = { ...editing.dateMembers };
                      dm[e.target.value] = dm[dt];
                      delete dm[dt];
                      setEditing({ ...editing, dates: newDates, dateMembers: dm });
                    }}
                  />
                  <span className="ts">{dowLabel(dt)}</span>
                </div>
                {(editing.dateMembers[dt] || []).map((m, mi) => (
                  <div key={mi} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
                      {/* メンバー名：プルダウン or 手入力 */}
                      {m.member === '他社' ? (
                        <div style={{ flex: 2, background: '#f1f5f9', border: '1.5px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: '.84rem', color: 'var(--sub)', fontWeight: 600 }}>他社</div>
                      ) : m._custom ? (
                        <input
                          className="inp"
                          style={{ flex: 2 }}
                          placeholder="名前を入力"
                          value={m.member}
                          onChange={(e) => updateMember(dt, mi, { member: e.target.value })}
                        />
                      ) : (
                        <select
                          className="inp"
                          style={{ flex: 2 }}
                          value={m.member}
                          onChange={(e) => {
                            if (e.target.value === '__new__') {
                              updateMember(dt, mi, { member: '', _custom: true });
                            } else {
                              updateMember(dt, mi, { member: e.target.value, _custom: false });
                            }
                          }}
                        >
                          <option value="">メンバーを選択</option>
                          {[...registeredNames].sort().map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                          <option value="__new__">＋ 新規入力...</option>
                        </select>
                      )}
                      <select className="inp" style={{ flex: 1 }} value={m.role} onChange={(e) => updateMember(dt, mi, { role: e.target.value })}>
                        <option value="クローザー">クローザー</option>
                        <option value="ディレクター">ディレクター</option>
                        <option value="キャッチャー">キャッチャー</option>
                      </select>
                      {m.role === 'キャッチャー' ? (
                        <input className="inp" style={{ flex: '0 0 56px' }} type="text" inputMode="numeric" placeholder="0" value={m.catcherCount} onChange={(e) => updateMember(dt, mi, { catcherCount: e.target.value })} />
                      ) : (
                        <input className="inp" style={{ flex: '0 0 56px' }} type="text" inputMode="numeric" placeholder="0" value={m.target} onChange={(e) => updateMember(dt, mi, { target: e.target.value })} />
                      )}
                      {mi > 0 && (
                        <button onClick={() => removeMember(dt, mi)} style={{ background: '#fee2e2', border: 'none', borderRadius: 6, padding: '6px 8px', color: '#dc2626', cursor: 'pointer' }}>×</button>
                      )}
                    </div>
                    {/* 新規入力モード中にプルダウンに戻れるリンク */}
                    {m._custom && m.member !== '他社' && (
                      <button
                        onClick={() => updateMember(dt, mi, { member: '', _custom: false })}
                        style={{ background: 'none', border: 'none', color: 'var(--sub)', fontSize: '.7rem', cursor: 'pointer', padding: 0 }}
                      >
                        ← リストから選ぶ
                      </button>
                    )}
                  </div>
                ))}
             <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
  <button className="btn btn-gray" style={{ flex: 1, padding: '8px 10px', fontSize: '.82rem' }} onClick={() => addMember(dt)}>＋ メンバーを追加</button>
  <button
    style={{ flexShrink: 0, background: '#f1f5f9', color: 'var(--sub)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontSize: '.82rem', fontWeight: 700, cursor: 'pointer' }}
    onClick={() => {
      setEditing((prev) => {
        const dm = { ...prev.dateMembers };
        dm[dt] = [...(dm[dt] || []), { member: '他社', role: 'クローザー', target: '', catcherCount: '', _custom: false }];
        return { ...prev, dateMembers: dm };
      });
    }}
  >
    他社
  </button>
</div>
            ))}
            <button className="btn btn-gray" onClick={addDate}>＋ 日程を追加</button>

            <div
              style={{
                marginTop: 10,
                padding: '9px 12px',
                borderRadius: 8,
                fontSize: '.78rem',
                fontWeight: 700,
                background: memberSum === (+editing.overallTarget || 0) ? '#eaf3de' : '#fcebeb',
                color: memberSum === (+editing.overallTarget || 0) ? 'var(--green)' : 'var(--red)',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>メンバー目標の合計：{memberSum}件</span>
              <span>現場全体の目標：{editing.overallTarget || 0}件{memberSum === (+editing.overallTarget || 0) ? '（一致）' : '（不一致）'}</span>
            </div>

            <button className="btn btn-p" style={{ marginTop: 10 }} onClick={handleSave}>保存</button>
            <button className="btn btn-gray" onClick={() => setEditing(null)}>キャンセル</button>
          </div>
        </div>
      )}
    </Layout>
  );
}
