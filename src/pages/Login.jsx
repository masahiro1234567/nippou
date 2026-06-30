import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

export default function Login() {
  const { login } = useAuth();
  const showToast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleLogin() {
    setBusy(true);
    try {
      const result = await login(name.trim(), email.trim(), pass);
      if (result.pending) {
        setPending(true);
      } else {
        navigate('/');
      }
    } catch (e) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (pending) {
    return (
      <div className="body">
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>⏳</div>
          <div className="fw8" style={{ marginBottom: 6 }}>アクセス申請中</div>
          <div className="ts">管理者が承認するまでお待ちください。<br />承認後に再度ログインしてください。</div>
          <button className="btn btn-gray" style={{ marginTop: 12 }} onClick={() => setPending(false)}>戻る</button>
        </div>
      </div>
    );
  }

  return (
    <div className="body">
      <div style={{ textAlign: 'center', padding: '22px 0 26px' }}>
        <div style={{ fontSize: '2.2rem', marginBottom: 7 }}>📋</div>
        <div className="fw8" style={{ fontSize: '1rem' }}>FP日報アプリ</div>
        <div className="ts" style={{ marginTop: 8 }}>名前・メールアドレス・パスコードを入力してください</div>
      </div>
      <div className="card">
        <div className="form-group">
          <label>名前 <span className="req">*</span></label>
          <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：山田 太郎" />
        </div>
        <div className="form-group">
          <label>メールアドレス <span className="req">*</span></label>
          <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="例：yamada@example.com" />
        </div>
        <div className="form-group">
          <label>パスコード <span className="req">*</span></label>
          <input className="inp" type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="パスコードを入力" />
        </div>
        <button className="btn btn-p" style={{ marginTop: 8 }} disabled={busy} onClick={handleLogin}>
          {busy ? 'ログイン中…' : 'ログイン / アクセス申請'}
        </button>
      </div>
    </div>
  );
}
