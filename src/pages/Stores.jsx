import { useState } from 'react';
import { ref, push, set, remove } from 'firebase/database';
import { db } from '../lib/firebase';
import { useFirebaseList } from '../lib/useFirebaseList';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import Layout from '../components/Layout';

export default function Stores() {
  const { data: stores } = useFirebaseList('fp_store_features');
  const { isAdmin } = useAuth();
  const showToast = useToast();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // {id, name, feature, manager, memo} or null=closed, {}=new

  const filtered = Object.entries(stores).filter(([, s]) => !search || (s.name || '').includes(search));

  async function handleSave() {
    if (!editing.name?.trim()) {
      showToast('店舗名は必須です');
      return;
    }
    const data = { name: editing.name, feature: editing.feature || '', manager: editing.manager || '', memo: editing.memo || '', updatedAt: Date.now() };
    if (editing.id) {
      await set(ref(db, `fp_store_features/${editing.id}`), data);
    } else {
      await set(push(ref(db, 'fp_store_features')), data);
    }
    showToast('✅ 保存しました');
    setEditing(null);
  }

  async function handleDelete(id) {
    if (!confirm('削除しますか？')) return;
    await remove(ref(db, `fp_store_features/${id}`));
    showToast('削除しました');
  }

  return (
    <Layout title="店舗特徴" showBack>
      <div style={{ fontSize: '.74rem', color: 'var(--sub)', background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: '9px 12px', marginBottom: 12 }}>
        🔒 この情報はFPへの日報には含まれません（社内管理用）
      </div>
      <input className="inp" placeholder="🔍 店舗名で検索" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 10 }} />
      <button className="btn btn-p" style={{ marginBottom: 12 }} onClick={() => setEditing({ name: search })}>＋ 店舗を追加</button>

      {filtered.map(([id, s]) => (
        <div key={id} className="report-card" onClick={() => setEditing({ id, ...s })}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div className="fw8">🏪 {s.name}</div>
            {isAdmin && (
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(id); }}
                style={{ background: '#fee2e2', border: 'none', borderRadius: 6, padding: '4px 9px', color: '#dc2626', fontSize: '.7rem', fontWeight: 700 }}
              >
                削除
              </button>
            )}
          </div>
          <div className="ts" style={{ marginTop: 4 }}>{s.feature} {s.manager}</div>
        </div>
      ))}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 10 }}>{editing.id ? '店舗特徴を編集' : '店舗特徴を追加'}</h3>
            <div className="form-group">
              <label>店舗名 <span className="req">*</span></label>
              <input className="inp" value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>店舗の特徴・雰囲気</label>
              <textarea className="inp" rows={3} value={editing.feature || ''} onChange={(e) => setEditing({ ...editing, feature: e.target.value })} />
            </div>
            <div className="form-group">
              <label>店舗管理者の特徴</label>
              <textarea className="inp" rows={3} value={editing.manager || ''} onChange={(e) => setEditing({ ...editing, manager: e.target.value })} />
            </div>
            <div className="form-group">
              <label>その他メモ</label>
              <textarea className="inp" rows={2} value={editing.memo || ''} onChange={(e) => setEditing({ ...editing, memo: e.target.value })} />
            </div>
            <button className="btn btn-p" onClick={handleSave}>保存</button>
            <button className="btn btn-gray" onClick={() => setEditing(null)}>キャンセル</button>
          </div>
        </div>
      )}
    </Layout>
  );
}
