import { useState } from 'react';
import { ref, push, set, remove } from 'firebase/database';
import { db } from '../lib/firebase';
import { useFirebaseList } from '../lib/useFirebaseList';
import { useToast } from '../contexts/ToastContext';
import Layout from '../components/Layout';

function todayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export default function Personal() {
  const { data: personalData } = useFirebaseList('fp_personal');
  const showToast = useToast();
  const [editing, setEditing] = useState(null);

  // 閲覧・編集どちらも全ユーザーに開放。日報保存直後の導線とは別に、ここからいつでも誰でも操作できる。
  const entries = Object.entries(personalData).sort((a, b) => (b[1].date || '').localeCompare(a[1].date || ''));

  async function handleSave() {
    if (!editing.name?.trim() || !editing.date) {
      showToast('名前と日付は必須です');
      return;
    }
    const data = {
      name: editing.name,
      date: editing.date,
      role: editing.role || 'クローザー',
      store: editing.store || '',
      target: +editing.target || 0,
      actual: +editing.actual || 0,
      souhan: +editing.souhan || 0,
      memo: editing.memo || '',
      updatedAt: Date.now(),
    };
    if (editing.id) {
      await set(ref(db, `fp_personal/${editing.id}`), data);
    } else {
      await set(push(ref(db, 'fp_personal')), data);
    }
    showToast('✅ 保存しました');
    setEditing(null);
  }

  async function handleDelete(id) {
    if (!confirm('削除しますか？')) return;
    await remove(ref(db, `fp_personal/${id}`));
    showToast('🗑 削除しました');
    setEditing(null);
  }

  return (
    <Layout title="個人実績" showBack>
      {entries.length === 0 && <div className="empty">データなし</div>}
      {entries.map(([id, p]) => {
        const target = +p.target || 0;
        const actual = +p.actual || 0;
        const pct = target > 0 ? Math.round((actual / target) * 100) : null;
        const color = pct === null ? 'var(--sub)' : pct >= 100 ? 'var(--green)' : pct >= 70 ? 'var(--orange)' : 'var(--red)';
        return (
          <div key={id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>
                <div className="fw8">{p.name}</div>
                <div className="ts">{p.role} {p.store} {p.date}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {pct !== null && <div style={{ fontWeight: 900, color }}>{pct}%</div>}
                <div className="ts">FP {actual}件 / 目標{target}件</div>
              </div>
            </div>
            {p.memo && <div className="ts" style={{ marginBottom: 6 }}>{p.memo}</div>}
            <button className="btn btn-outline" onClick={() => setEditing({ id, ...p })}>
              編集
            </button>
          </div>
        );
      })}

      <button className="btn btn-p" style={{ marginTop: 12 }} onClick={() => setEditing({ name: '', date: todayStr(), role: 'クローザー' })}>
        ＋ 個人実績を登録
      </button>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 10 }}>{editing.id ? '個人実績を編集' : '個人実績を登録'}</h3>
            <div className="form-group">
              <label>名前 <span className="req">*</span></label>
              <input className="inp" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>役職</label>
              <select className="inp" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
                <option value="クローザー">クローザー</option>
                <option value="ディレクター">ディレクター</option>
                <option value="キャッチャー">キャッチャー</option>
              </select>
            </div>
            <div className="form-group">
              <label>店舗名</label>
              <input className="inp" value={editing.store || ''} onChange={(e) => setEditing({ ...editing, store: e.target.value })} />
            </div>
            <div className="form-group">
              <label>日付 <span className="req">*</span></label>
              <input className="inp" type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>KPI目標</label>
              <input className="inp" type="text" inputMode="numeric" value={editing.target || ''} onChange={(e) => setEditing({ ...editing, target: e.target.value })} />
            </div>
            <div className="form-group">
              <label>FP獲得実績</label>
              <input className="inp" type="text" inputMode="numeric" value={editing.actual || ''} onChange={(e) => setEditing({ ...editing, actual: e.target.value })} />
            </div>
            <div className="form-group">
              <label>総販</label>
              <input className="inp" type="text" inputMode="numeric" value={editing.souhan || ''} onChange={(e) => setEditing({ ...editing, souhan: e.target.value })} />
            </div>
            <div className="form-group">
              <label>メモ</label>
              <textarea className="inp" rows={2} value={editing.memo || ''} onChange={(e) => setEditing({ ...editing, memo: e.target.value })} />
            </div>
            <button className="btn btn-p" onClick={handleSave}>保存</button>
            {editing.id && (
              <button className="btn" style={{ background: '#fee2e2', color: '#dc2626' }} onClick={() => handleDelete(editing.id)}>
                🗑 削除
              </button>
            )}
            <button className="btn btn-gray" onClick={() => setEditing(null)}>キャンセル</button>
          </div>
        </div>
      )}
    </Layout>
  );
}
