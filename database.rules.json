import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, set, remove } from 'firebase/database';
import { db } from '../lib/firebase';
import { useFirebaseList } from '../lib/useFirebaseList';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import Layout from '../components/Layout';

function todayYm() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
}

export default function Admin() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const showToast = useToast();
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
        <button className={`fchip${tab === 'list' ? ' active' : ''}`} onClick={() => setTab('list')}>日報管理</button>
        <button className={`fchip${tab === 'goal' ? ' active' : ''}`} onClick={() => setTab('goal')}>月次目標</button>
        <button className={`fchip${tab === 'users' ? ' active' : ''}`} onClick={() => setTab('users')}>ユーザー管理</button>
      </div>
      {tab === 'list' && <ReportManageTab />}
      {tab === 'goal' && <GoalTab />}
      {tab === 'users' && <UsersTab />}
    </Layout>
  );
}

function ReportManageTab() {
  const { data: reports } = useFirebaseList('fp_reports');
  const showToast = useToast();
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const filtered = Object.entries(reports)
    .filter(([, r]) => !search || (r.store || '').includes(search) || (r.director || '').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b[1].date || '').localeCompare(a[1].date || ''));

  async function handleDelete(id) {
    if (!confirm('この日報を削除しますか？')) return;
    await remove(ref(db, `fp_reports/${id}`));
    showToast('🗑 削除しました');
  }

  return (
    <div>
      <input className="inp" placeholder="🔍 店舗名・ディレクター名" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 10 }} />
      {filtered.length === 0 && <div className="empty">データなし</div>}
      {filtered.map(([id, r]) => (
        <div key={id} className="report-card" style={{ cursor: 'default' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <div className="fw8">{r.store || '−'}</div>
            <span className="ts">{r.date}</span>
          </div>
          <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
            <span className="badge b-blue">{r.channel || '−'}</span>
            <span className="badge b-gray">{r.director || r.userName || '−'}</span>
            <span className="badge b-green">{r.ach || 0}%</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" onClick={() => navigate(`/report/edit/${id}`)}>編集</button>
            <button className="btn" style={{ background: '#fee2e2', color: '#dc2626' }} onClick={() => handleDelete(id)}>削除</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function GoalTab() {
  const { data: goals } = useFirebaseList('fp_goals');
  const showToast = useToast();
  const [month, setMonth] = useState(todayYm());
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [memo, setMemo] = useState('');

  async function handleSave() {
    if (!month) {
      showToast('対象月を選択してください');
      return;
    }
    const key = month.replace('-', '');
    await set(ref(db, `fp_goals/${key}`), { month, a: +a || 0, b: +b || 0, memo, updatedAt: Date.now() });
    showToast('✅ 目標を保存しました');
  }

  return (
    <div>
      <div className="card">
        <div className="form-group">
          <label>対象月</label>
          <input className="inp" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div className="form-group">
          <label>総販目標</label>
          <input className="inp" type="number" value={a} onChange={(e) => setA(e.target.value)} />
        </div>
        <div className="form-group">
          <label>2Bリク除き目標</label>
          <input className="inp" type="number" value={b} onChange={(e) => setB(e.target.value)} />
        </div>
        <div className="form-group">
          <label>自由記述（方針など）</label>
          <textarea className="inp" rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>
        <button className="btn btn-p" onClick={handleSave}>目標を保存</button>
      </div>
      <div className="card-title" style={{ marginTop: 12 }}>設定済み月次目標</div>
      {Object.entries(goals).sort((a2, b2) => (b2[1].month || '').localeCompare(a2[1].month || '')).map(([key, g]) => (
        <div key={key} className="card">
          <div className="fw8">{g.month}</div>
          <div className="ts">総販目標：{g.a}台 ／ 2Bリク除き目標：{g.b}台</div>
          {g.memo && <div className="ts" style={{ marginTop: 6 }}>{g.memo}</div>}
        </div>
      ))}
    </div>
  );
}

function UsersTab() {
  const { data: users } = useFirebaseList('fp_users');
  const showToast = useToast();

  async function approve(id) {
    await set(ref(db, `fp_users/${id}/permission`), 'edit');
    showToast('✅ 承認しました');
  }
  async function setPermission(id, permission) {
    await set(ref(db, `fp_users/${id}/permission`), permission);
    showToast('✅ 更新しました');
  }

  const entries = Object.entries(users).sort((a, b) => {
    if (a[1].permission === 'pending' && b[1].permission !== 'pending') return -1;
    if (b[1].permission === 'pending' && a[1].permission !== 'pending') return 1;
    return (a[1].name || '').localeCompare(b[1].name || '');
  });

  const permLabel = { edit: '編集・登録可', readonly: '閲覧のみ', disabled: 'ログイン不可', pending: '申請中' };

  return (
    <div>
      {entries.length === 0 && <div className="empty">登録ユーザーなし</div>}
      {entries.map(([id, u]) => (
        <div key={id} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <div className="fw8">{u.name}</div>
              <div className="ts">{u.email}</div>
            </div>
            <span className="badge b-blue">{permLabel[u.permission || 'edit'] || u.permission}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {u.permission === 'pending' && <button className="btn btn-green" onClick={() => approve(id)}>✅ 承認</button>}
            <button className="btn btn-outline" onClick={() => setPermission(id, 'edit')}>編集可に</button>
            <button className="btn btn-outline" onClick={() => setPermission(id, 'readonly')}>閲覧のみに</button>
            <button className="btn" style={{ background: '#fee2e2', color: '#dc2626' }} onClick={() => setPermission(id, 'disabled')}>ログイン不可に</button>
          </div>
        </div>
      ))}
    </div>
  );
}
