import { useMemo, useState } from 'react';
import { ref, push, set, remove } from 'firebase/database';
import { db } from '../lib/firebase';
import { useFirebaseList } from '../lib/useFirebaseList';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import Layout from '../components/Layout';
import MonthPicker from '../components/MonthPicker';

const CHANNELS = ['エディオン', 'イオン', 'ジョーシン', 'ケーズデンキ', 'ヤマダ', 'コジマ', 'その他'];

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export default function Stores() {
  const { data: stores } = useFirebaseList('fp_store_features');
  const { isAdmin } = useAuth();
  const showToast = useToast();
  const [search, setSearch] = useState('');
  const [pickerVal, setPickerVal] = useState(null);
  const [channelFilter, setChannelFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [openIds, setOpenIds] = useState({});

  const filtered = useMemo(() => {
    return Object.entries(stores).filter(([, s]) => {
      const qOk = !search || (s.name || '').includes(search);
      const cOk = !channelFilter || s.channel === channelFilter;
      const mOk = !pickerVal || (() => {
        if (!s.updatedAt) return false;
        const d = new Date(s.updatedAt);
        return d.getFullYear() === pickerVal.year && (d.getMonth() + 1) === pickerVal.month;
      })();
      return qOk && cOk && mOk;
    });
  }, [stores, search, channelFilter, pickerVal]);

  function toggleOpen(id) {
    setOpenIds(prev => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleSave() {
    if (!editing.name?.trim()) { showToast('店舗名は必須です'); return; }
    const data = {
      name: editing.name,
      channel: editing.channel || '',
      feature: editing.feature || '',
      manager: editing.manager || '',
      memo: editing.memo || '',
      updatedAt: Date.now(),
    };
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
      <MonthPicker value={pickerVal} onChange={setPickerVal} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <select
          className="inp"
          style={{ flex: '0 0 auto', width: 'auto', padding: '8px 10px', fontSize: '.84rem' }}
          value={channelFilter}
          onChange={e => setChannelFilter(e.target.value)}
        >
          <option value="">すべての販路</option>
          {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          className="inp"
          placeholder="🔍 店舗名で検索"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <button className="btn btn-p" style={{ marginBottom: 12 }} onClick={() => setEditing({ name: search })}>＋ 店舗を追加</button>

      {filtered.map(([id, s]) => (
        <div key={id} style={{ background: '#fff', borderRadius: 'var(--r)', border: '1px solid var(--border)', marginBottom: 8, overflow: 'hidden', boxShadow: 'var(--sh-sm)' }}>
          <div
            style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => toggleOpen(id)}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px' }}>🏪 {s.name}</div>
              {s.updatedAt && <div style={{ fontSize: '10px', color: 'var(--sub)', marginTop: 2 }}>最終更新：{fmtDate(s.updatedAt)}</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {s.channel && <span className="badge b-orange" style={{ fontSize: '.64rem' }}>{s.channel}</span>}
              <span style={{ color: 'var(--sub)', fontSize: 13 }}>{openIds[id] ? '▾' : '›'}</span>
            </div>
          </div>
          {openIds[id] && (
            <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
              {s.feature && <div style={{ fontSize: '12px', color: '#374151', lineHeight: 1.7, marginTop: 10 }}>{s.feature}</div>}
              {s.manager && <div style={{ fontSize: '12px', color: '#374151', lineHeight: 1.7, marginTop: 4 }}>{s.manager}</div>}
              {s.memo && <div style={{ fontSize: '12px', color: 'var(--sub)', marginTop: 4 }}>{s.memo}</div>}
              {s.updatedAt && <div style={{ fontSize: '10px', color: 'var(--sub)', marginTop: 8 }}>🕐 記録日：{fmtDate(s.updatedAt)}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn-outline" style={{ fontSize: '.8rem', padding: '7px 12px' }} onClick={() => setEditing({ id, ...s })}>編集</button>
                {isAdmin && (
                  <button
                    style={{ background: '#fee2e2', border: 'none', borderRadius: 8, padding: '7px 12px', color: '#dc2626', fontSize: '.8rem', fontWeight: 700, cursor: 'pointer' }}
                    onClick={() => handleDelete(id)}
                  >削除</button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 10 }}>{editing.id ? '店舗特徴を編集' : '店舗特徴を追加'}</h3>
            <div className="form-group">
              <label>店舗名 <span className="req">*</span></label>
              <input className="inp" value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>販路</label>
              <select className="inp" value={editing.channel || ''} onChange={e => setEditing({ ...editing, channel: e.target.value })}>
                <option value="">選択</option>
                {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>店舗の特徴・雰囲気</label>
              <textarea className="inp" rows={3} value={editing.feature || ''} onChange={e => setEditing({ ...editing, feature: e.target.value })} />
            </div>
            <div className="form-group">
              <label>店舗管理者の特徴</label>
              <textarea className="inp" rows={3} value={editing.manager || ''} onChange={e => setEditing({ ...editing, manager: e.target.value })} />
            </div>
            <div className="form-group">
              <label>その他メモ</label>
              <textarea className="inp" rows={2} value={editing.memo || ''} onChange={e => setEditing({ ...editing, memo: e.target.value })} />
            </div>
            <button className="btn btn-p" onClick={handleSave}>保存</button>
            <button className="btn btn-gray" onClick={() => setEditing(null)}>キャンセル</button>
          </div>
        </div>
      )}
    </Layout>
  );
}
