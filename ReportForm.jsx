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
function todayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

// メンバーの実績を、同日・同店舗・同名の日報から推定する
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
  const { isAdmin } = useAuth();
  const showToast = useToast();
  const [editing, setEditing] = useState(null); // null=閉, {} = 新規, {id,...}=編集

  const cards = useMemo(() => {
    return Object.entries(kpiData)
      .map(([id, k]) => {
        const members = (k.members || []).filter((m) => m.member);
        const totalTarget = members.filter((m) => m.role !== 'キャッチャー').reduce((s, m) => s + (+m.target || 0), 0);
        let totalActual = 0;
        const memberRows = members.map((m) => {
          const actual = findActual(reports, k.date, k.store, m.member);
          if (m.role !== 'キャッチャー' && actual !== null) totalActual += actual;
          return { ...m, actual };
        });
        const ach = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;
        return { id, k, memberRows, totalTarget, totalActual, ach };
      })
      .sort((a, b) => (b.k.date || '').localeCompare(a.k.date || ''));
  }, [kpiData, reports]);

  async function handleSave() {
    if (!editing.date || !editing.store) {
      showToast('日付・店舗名は必須です');
      return;
    }
    const members = (editing.members || []).filter((m) => m.member);
    if (!members.length) {
      showToast('メンバーを1人以上入力してください');
      return;
    }
    const data = { date: editing.date, store: editing.store, members, updatedAt: Date.now() };
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

  function updateMember(idx, patch) {
    const members = [...(editing.members || [])];
    members[idx] = { ...members[idx], ...patch };
    setEditing({ ...editing, members });
  }
  function addMember() {
    setEditing({ ...editing, members: [...(editing.members || []), { member: '', role: 'クローザー', target: '' }] });
  }
  function removeMember(idx) {
    setEditing({ ...editing, members: (editing.members || []).filter((_, i) => i !== idx) });
  }

  return (
    <Layout title="KPI管理" showBack>
      {isAdmin && (
        <button className="btn btn-p" style={{ marginBottom: 12 }} onClick={() => setEditing({ date: todayStr(), store: '', members: [{ member: '', role: 'クローザー', target: '' }] })}>
          ＋ KPIを登録
        </button>
      )}

      {cards.length === 0 && <div className="empty">KPIデータなし</div>}

      {cards.map(({ id, k, memberRows, totalTarget, totalActual, ach }) => {
        const dow = k.date ? DOWS[parseDateLocal(k.date).getDay()] : '';
        const color = ach >= 100 ? 'var(--green)' : ach >= 70 ? 'var(--orange)' : 'var(--red)';
        return (
          <div key={id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>
                <div className="fw8">{k.store}</div>
                <div className="ts">{k.date}（{dow}）</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 900, fontSize: '1rem', color }}>{ach}%</div>
                <div className="ts">FP {totalActual}件 / 目標{totalTarget}件</div>
              </div>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 7, height: 10, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ height: '100%', width: `${Math.min(ach, 100)}%`, background: color }} />
            </div>
            {memberRows.map((m, i) => {
              const achieved = m.actual !== null && m.actual >= (+m.target || 0);
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--bg)' }}>
                  <div>
                    <div style={{ fontSize: '.82rem', fontWeight: 700 }}>{m.member}</div>
                    <div className="ts">{m.role} ／ 目標{m.target || 0}件</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ fontSize: '.8rem', fontWeight: 700 }}>実績 {m.actual !== null ? `${m.actual}件` : '未記入'}</div>
                    <span className={`badge ${m.role === 'キャッチャー' ? 'b-gray' : achieved ? 'b-green' : 'b-red'}`}>
                      {m.role === 'キャッチャー' ? '参考' : achieved ? '達成' : '未達'}
                    </span>
                  </div>
                </div>
              );
            })}
            {isAdmin && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn-outline" onClick={() => setEditing({ id, ...k })}>編集</button>
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
            <div className="form-group">
              <label>日付 <span className="req">*</span></label>
              <input className="inp" type="date" value={editing.date || ''} onChange={(e) => setEditing({ ...editing, date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>店舗名 <span className="req">*</span></label>
              <input className="inp" value={editing.store || ''} onChange={(e) => setEditing({ ...editing, store: e.target.value })} placeholder="例：○○イオン" />
            </div>
            <div className="form-group">
              <label>メンバー</label>
              {(editing.members || []).map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 6 }}>
                  <input className="inp" placeholder="名前" value={m.member} onChange={(e) => updateMember(i, { member: e.target.value })} style={{ flex: 2 }} />
                  <select className="inp" value={m.role} onChange={(e) => updateMember(i, { role: e.target.value })} style={{ flex: 1 }}>
                    <option value="クローザー">クローザー</option>
                    <option value="ディレクター">ディレクター</option>
                    <option value="キャッチャー">キャッチャー</option>
                  </select>
                  <input className="inp" type="number" placeholder="KPI" value={m.target} onChange={(e) => updateMember(i, { target: e.target.value })} style={{ flex: '0 0 64px' }} />
                  {i > 0 && (
                    <button onClick={() => removeMember(i)} style={{ background: '#fee2e2', border: 'none', borderRadius: 6, padding: '6px 8px', color: '#dc2626' }}>×</button>
                  )}
                </div>
              ))}
              <button className="btn btn-gray" onClick={addMember}>＋ メンバーを追加</button>
            </div>
            <button className="btn btn-p" onClick={handleSave}>保存</button>
            <button className="btn btn-gray" onClick={() => setEditing(null)}>キャンセル</button>
          </div>
        </div>
      )}
    </Layout>
  );
}
