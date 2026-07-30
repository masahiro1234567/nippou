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
function blank(v, mark = '○') { return v === '' || v === null || v === undefined ? mark : v; }
function blankText(v) { return v && String(v).trim() !== '' ? v : '-'; }
function dowLabel(dateStr) {
  return dateStr ? DOWS[parseDateLocal(dateStr).getDay()] + '曜日' : '当日';
}

export default function ReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: reports } = useFirebaseList('fp_reports');
  const { isAdmin, canEditReport } = useAuth();
  const showToast = useToast();
  const r = reports[id];

  if (!r) {
    return <Layout title="詳細" showBack><div className="empty">読み込み中、またはデータが見つかりません</div></Layout>;
  }

  const dow = r.date ? DOWS[parseDateLocal(r.date).getDay()] : '';
  const text = buildText(r);

  async function handleDelete() {
    if (!confirm('この日報を削除しますか？')) return;
    try {
      await remove(ref(db, `fp_reports/${id}`));
      showToast('🗑 削除しました');
      navigate('/reports');
    } catch (e) {
      showToast('エラー: ' + e.message);
    }
  }

  return (
    <Layout title="詳細" showBack>
      <div className="ts" style={{ marginBottom: 8 }}>{r.store || '−'} {r.date || ''}（{dow}） {r.ach || 0}%</div>
      <div style={{ background: '#f8faff', border: '1px solid var(--border)', borderRadius: 10, padding: 14, fontSize: '.76rem', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
        {text}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-p" onClick={() => { navigator.clipboard.writeText(text); showToast('✅ コピーしました'); }}>
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

function buildText(r) {
  const date = r.date || '';
  const dow = dowLabel(date);
  // au/uqは新形式（フラット配列）と旧形式（au_by_day配列）の両方に対応
  const au = r.au || (r.au_by_day && r.au_by_day[0]) || Array(8).fill(0);
  const uq = r.uq || (r.uq_by_day && r.uq_by_day[0]) || Array(8).fill(0);
  const fpA = r.fpA ?? r.fp_by_day?.[0]?.a ?? 0;
  const fpB = r.fpB ?? r.fp_by_day?.[0]?.b ?? 0;
  const n = v => +v || 0;
  const auTotal = au.reduce((a, b) => a + n(b), 0);
  const uqTotal = au.reduce((a, b) => a + n(b), 0) >= 0
    ? uq.reduce((a, b) => a + n(b), 0) - n(uq[1]) : 0;
  const souhan = auTotal + (uq.reduce((a, b) => a + n(b), 0) - n(uq[1]));
  const riku = souhan - (n(au[1]) + n(au[7]) + n(uq[7]));
  const ta = +r.r_ta || 0, tb = +r.r_tb || 0;
  // 旧データ互換
  const jA = r.jisseki?.[0]?.a ?? souhan;
  const jB = r.jisseki?.[0]?.b ?? riku;
  const nokoriA = ta > 0 ? Math.max(ta - jA, 0) : '○';
  const nokoriB = tb > 0 ? Math.max(tb - jB, 0) : '○';
  const mikomiG = r.mikomiG ?? r.v_mikomi?.[0]?.g ?? '';
  const mikomiD = r.mikomiD ?? r.v_mikomi?.[0]?.d ?? '';

  return `お疲れ様です。
${r.director || r.userName || '●●'}です。
本日の日報を下記に記載いたします。

⚠️ヒヤリハット報告⚠️
${blankText(r.hiyari)}

■実績：2Bダウン除き総販/2Bリク除き
目　標 : ${blank(r.r_ta)}/${blank(r.r_tb)}
${dow} : ${jA}/${jB}（内FP獲得${blank(fpA)}/${blank(fpB)}）
残　数：${ta > 0 ? `${nokoriA}/${nokoriB}` : '○/○'}

■店舗様見込み獲得（${mikomiG && mikomiD ? `${mikomiG}組/${mikomiD}台` : '○組/○台'}）
※常勤様の当日獲得は除く
${dow}獲得 : ${mikomiG && mikomiD ? `${mikomiG}組${mikomiD}台` : '-'}

■内訳（接客組/着座組/成約組/成約台数）
アンケート枚数（全体）：${blank(r.ank)}枚
アンケート（内FP）：${(r.b_fp || []).map(v => blank(v)).join('/') || '○/○/○/○'}
フリーキャッチ：${(r.b_fc || []).map(v => blank(v)).join('/') || '○/○/○/○'}
什器/POP：${(r.b_pop || []).map(v => blank(v)).join('/') || '○/○/○/○'}
家電/TA：${(r.b_ta || []).map(v => blank(v)).join('/') || '○/○/○/○'}
振り（常勤/他）：${(r.b_furi || []).map(v => blank(v)).join('/') || '○/○/○/○'}

■au mobile実績
純新規獲得件数：${blank(au[0], 0)}件
MNP(UQ⇒au)：${blank(au[1], 0)}件
MNP(SB⇒au)：${blank(au[2], 0)}件
MNP(DCM⇒au)：${blank(au[3], 0)}件
MNP(YM⇒au)：${blank(au[4], 0)}件
MNP(楽天⇒au)：${blank(au[5], 0)}件
MNP(その他⇒au)：${blank(au[6], 0)}件
機種変更獲得件数：${blank(au[7], 0)}件

■UQ mobile実績
純新規獲得件数：${blank(uq[0], 0)}件
MNP(au⇒UQ)：${blank(uq[1], 0)}件
MNP(SB⇒UQ)：${blank(uq[2], 0)}件
MNP(DCM⇒UQ)：${blank(uq[3], 0)}件
MNP(YM⇒UQ)：${blank(uq[4], 0)}件
MNP(楽天⇒UQ)：${blank(uq[5], 0)}件
MNP(その他⇒UQ)：${blank(uq[6], 0)}件
機種変更件数：${blank(uq[7], 0)}件

■FTTH実績
auひかり　：${blank((r.ft || [])[0])}件
BIGLOBE光：${blank((r.ft || [])[1])}件
eo光：${blank((r.ft || [])[2])}件
CATV : ${blank((r.ft || [])[3])}件
WiMAX ：${blank((r.ft || [])[4])}件

■ライフデザイン実績
auでんき　　：${blank((r.ld || [])[0])}件
auPayカード：${blank((r.ld || [])[1])}件

■その他獲得商材
${blankText(r.other)}

■アライアンス協業
❶振り組数/成約組数
KDDI→eo : ${blank((r.al||[[]])[0]?.[0])}/${blank((r.al||[[]])[0]?.[1])}
eo→KDDI : ${blank((r.al||[,[]])[1]?.[0])}/${blank((r.al||[,[]])[1]?.[1])}
KDDI→CATV : ${blank((r.al||[,,[]])[2]?.[0])}/${blank((r.al||[,,[]])[2]?.[1])}
CATV→KDDI : ${blank((r.al||[,,,[]])[3]?.[0])}/${blank((r.al||[,,,[]])[3]?.[1])}

❷アライアンス様連携（eo/CATV）取組み工夫
${blankText(r.al_eff)}

■他社実績 
(純新規/MNP/番号移行/機変)
※他社取扱がない場合は「ー」を記入ください。
Softbank：${(r.ot||[['0','0','0','0']])[0]?.join('/')||'0/0/0/0'}
docomo：${(r.ot||[[],['0','0','0','0']])[1]?.join('/')||'0/0/0/0'}
Ymobile：${(r.ot||[[],[],['0','0','0','0']])[2]?.join('/')||'0/0/0/0'}
楽天：${(r.ot||[[],[],[],['0','0','0','0']])[3]?.join('/')||'0/0/0/0'}

■全体総括（活動内容/集客状況/他社状況）
${blankText(r.txt_ov)}

■【達成：達成理由】【未達：改善策】
${blankText(r.txt_rs)}

■【添付】着座管理シート貼付

ご確認の程、よろしくお願いいたします。`;
}
