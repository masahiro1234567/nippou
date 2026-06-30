import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth, signInAnonymously } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDzhKiWLngKPLL85L8JyBkOQCWztLoSMwI',
  authDomain: 'nippou-data-base.firebaseapp.com',
  databaseURL: 'https://nippou-data-base-default-rtdb.firebaseio.com',
  projectId: 'nippou-data-base',
  storageBucket: 'nippou-data-base.firebasestorage.app',
  messagingSenderId: '516171183375',
  appId: '1:516171183375:web:bffa959ef109da150aba7a',
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

export function ensureAnonAuth() {
  return signInAnonymously(auth).catch((e) => {
    console.error('匿名ログイン失敗:', e);
  });
}
