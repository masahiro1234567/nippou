import { createContext, useContext, useEffect, useState } from 'react';
import { ref, get, push, set } from 'firebase/database';
import { db, auth, ensureAnonAuth } from '../lib/firebase';

const PASSCODE = 'orinavi.au';
const ADMIN_PW = 'aunippou26';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // {name, email, uid, permission}
  const [isAdmin, setIsAdmin] = useState(sessionStorage.getItem('fp_admin') === '1');
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    ensureAnonAuth().finally(() => setAuthReady(true));
    const saved = localStorage.getItem('fp_user') || sessionStorage.getItem('fp_user');
    if (saved) {
      try {
        setUser(JSON.parse(saved));
      } catch (e) {
        /* ignore */
      }
    }
  }, []);

  // 事前登録制ログイン：管理者が fp_users に登録した名簿と照合する。
  // 「最初の1人だけ自動承認」という例外は廃止し、登録済みかどうかだけで判定する。
  async function login(name, email, pass) {
    if (!name || !email || !pass) throw new Error('全ての項目を入力してください');
    if (pass !== PASSCODE) throw new Error('パスコードが違います');

    const snap = await get(ref(db, 'fp_users'));
    const users = {};
    snap.forEach((c) => {
      users[c.key] = c.val();
    });

    let entry = Object.entries(users).find(
      ([, u]) => u.email && u.email.toLowerCase() === email.toLowerCase()
    );
    if (!entry) entry = Object.entries(users).find(([, u]) => !u.email && u.name === name);

    if (!entry) {
      // 名簿に登録がない場合は申請として登録し、管理者の承認待ちにする
      await set(push(ref(db, 'fp_users')), {
        name,
        email,
        permission: 'pending',
        createdAt: Date.now(),
      });
      return { pending: true };
    }

    const [uid, userData] = entry;
    if (userData.permission === 'disabled') throw new Error('このアカウントはログインが禁止されています');
    if (userData.permission === 'pending') return { pending: true };

    if (!userData.email && email) {
      await set(ref(db, `fp_users/${uid}/email`), email);
    }
    const u = { name: userData.name || name, email, uid, permission: userData.permission || 'edit' };
    persistUser(u);
    setUser(u);
    await set(push(ref(db, 'fp_login_logs')), {
      uid,
      name: u.name,
      email,
      loginAt: Date.now(),
      loginAtStr: new Date().toLocaleString('ja-JP'),
    });
    await set(ref(db, `fp_users/${uid}/lastLogin`), Date.now());
    return { pending: false };
  }

  function persistUser(u) {
    try {
      localStorage.setItem('fp_user', JSON.stringify(u));
    } catch (e) {
      /* ignore */
    }
  }

  function logout() {
    setUser(null);
    localStorage.removeItem('fp_user');
    sessionStorage.removeItem('fp_user');
  }

  function adminLogin(pw) {
    if (pw !== ADMIN_PW) throw new Error('パスワードが違います');
    sessionStorage.setItem('fp_admin', '1');
    setIsAdmin(true);
  }

  function adminLogout() {
    sessionStorage.removeItem('fp_admin');
    setIsAdmin(false);
  }

  // 日報の編集権限：管理者、または本人が作成した日報（閲覧のみユーザーは不可）
  const canEditReport = (report) =>
    isAdmin ||
    (user &&
      user.permission !== 'readonly' &&
      (report.userName === user.name || report.director === user.name));

  return (
    <AuthContext.Provider
      value={{ user, isAdmin, authReady, login, logout, adminLogin, adminLogout, canEditReport }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
