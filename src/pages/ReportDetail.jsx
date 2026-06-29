import { useNavigate, useParams } from 'react-router-dom';
import { remove, ref } from 'firebase/database';
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

export default function ReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: reports } = useFirebaseList('fp_reports');
  const { isAdmin, canEditReport } = useAuth();
  const showToast = useToast();
  const r = reports[id];

  if (!r) {
    return (
      <Layout title="日報詳細" showBack>
        <div className="empty">読み込み中、またはデータが見つかりません</div>
      </Layout>
    );
  }

  const dow = r.date ? DOWS[parseDateLocal(r.date).getDay()] : '';
  const text = buildText(r);

  async function handleDelete() {
    if (!confirm('この日報を削除しますか？削除したデータは元に戻せません')) return;
    try {
      await remove(ref(db, `fp_reports/${id}`));
      showToast('🗑 削除しました');
      navigate('/reports');
    } catch (e) {
      showToast('エラー: ' + e.message);
    }
  }

  return (
    <Layout title={`${r.store || '−'} ${r.date || ''}(${dow})`} showBack>
      <div style={{ background: '#f8faff', border: '1px solid var(--border)', borderRadius: 10, padding: 14, fontSize: '.78rem', lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>
        {text}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          className="btn btn-p"
          onClick={() => {
            navigator.clipboard.writeText(text);
            showToast('✅ コピーしました');
          }}
        >
          📋 コピー
        </button>
      </div>
      {canEditReport(r) && (
        <button className="btn btn-outline" style={{ marginTop: 8 }} onClick={() => navigate(`/report/edit/${id}`)}>
          ✏️ 編集
        </button>
      )}
      {isAdmin && (
        <button className="btn" style={{ marginTop: 8, background: '#fee2e2', color: '#dc2626', fontWeight: 700 }} onClick={handleDelete}>
          🗑 削除
        </button>
      )}
    </Layout>
  );
}

function buildText(d) {
  const wdays = d.workDays && d.workDays.length ? d.workDays : d.date ? [d.date] : [];
  const dayLabels = wdays.map((dt) => DOWS[parseDateLocal(dt).getDay()] + '曜日');
  const jissekiLines = wdays
    .map((dt, i) => {
      const j = d.jisseki?.[i] || { a: 0, b: 0 };
      const fp = d.fp_by_day?.[i] || { a: 0, b: 0 };
      return `${dayLabels[i]}：${j.a}/${j.b}（内FP獲得${fp.a}/${fp.b}）`;
    })
    .join('\n');
  const totalJA = (d.jisseki || []).reduce((s, j) => s + (+j.a || 0), 0);
  const totalJB = (d.jisseki || []).reduce((s, j) => s + (+j.b || 0), 0);
  const nokoriA = Math.max((+d.r_ta || 0) - totalJA, 0);
  const nokoriB = Math.max((+d.r_tb || 0) - totalJB, 0);
  const mikomiLines = wdays
    .map((dt, i) => {
      const vm = d.v_mikomi?.[i] || { g: 0, d: 0 };
      return `${dayLabels[i]}獲得 : ${vm.g}組${vm.d}台`;
    })
    .join('\n');
  const totalG = (d.v_mikomi || []).reduce((s, v) => s + (+v.g || 0), 0);
  const totalD = (d.v_mikomi || []).reduce((s, v) => s + (+v.d || 0), 0);

  return `お疲れ様です。
${d.director || d.userName || '●●'}です。
本日の日報を下記に記載いたします。
⚠️ヒヤリハット報告⚠️
${d.hiyari || '特になし。'}

■実績：2Bダウン除き総販/2Bリク除き
目　標 : ${d.r_ta || '-'}/${d.r_tb || '-'}
${jissekiLines}
残数：${nokoriA}/${nokoriB}

■店舗様見込み獲得（${totalG}組/${totalD}台）
${mikomiLines}

■全体総括（活動内容/集客状況/他社状況）
${d.txt_ov || ''}

■【達成：達成理由】【未達：改善策】
${d.txt_rs || ''}

ご確認の程、よろしくお願いいたします。`;
}
