import { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../lib/firebase';

// path配下のデータをリアルタイムで {id: data} の形で取得する共通フック
export function useFirebaseList(path) {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const r = ref(db, path);
    const unsub = onValue(
      r,
      (snap) => {
        const result = {};
        snap.forEach((c) => {
          result[c.key] = c.val();
        });
        setData(result);
        setLoading(false);
      },
      (err) => {
        console.error(`${path} 読み込みエラー:`, err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [path]);

  return { data, loading };
}
