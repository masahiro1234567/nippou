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
function blank(v, mark = '○') {
  return v === '' || v === null || v === undefined ? mark : v;
}
function blankText(v) {
  return v && String(v).trim() !== '' ? v : '-';
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
      <Layout title="詳細" showBack>
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
    <Layout title="詳細" showBack>
      <div className="ts" style={{ marginBottom: 8 }}>{r.store || '−'} {r.date || ''}（{dow}） {r.ach || 0}%</div>
      <div style={{ background: '#f8faff', border: '1px solid var(--border)', borderRadius: 10, padding: 14, fontSize: '.76rem', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
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
      const j = d.jisseki?.[i];
      const fp = d.fp_by_day?.[i];
      if (!j) return `${dayLabels[i]} : ○/○（内FP獲得○/○）`;
      return `${dayLabels[i]} : ${blank(j.a, 0)}/${blank(j.b, 0)}（内FP獲得${blank(fp?.a, 0)}/${blank(fp?.b, 0)}）`;
    })
    .join('\n');

  const totalJA = (d.jisseki || []).reduce((s, j) => s + (+j.a || 0), 0);
  const totalJB = (d.jisseki || []).reduce((s, j) => s + (+j.b || 0), 0);
  const hasTarget = d.r_ta && d.r_tb;
  const nokoriA = hasTarget ? Math.max((+d.r_ta || 0) - totalJA, 0) : '○';
  const nokoriB = hasTarget ? Math.max((+d.r_tb || 0) - totalJB, 0) : '○';

  const mikomiLines = wdays
    .map((dt, i) => {
      const vm = d.v_mikomi?.[i];
      const has = vm && (vm.g || vm.d);
      return `${dayLabels[i]}獲得 : ${has ? `${vm.g}組${vm.d}台` : '-'}`;
    })
    .join('\n');
  const totalG = (d.v_mikomi || []).reduce((s, v) => s + (+v.g || 0), 0);
  const totalD = (d.v_mikomi || []).reduce((s, v) => s + (+v.d || 0), 0);
  const hasMikomi = (d.v_mikomi || []).some((v) => v.g || v.d);

  const au0 = (d.au_by_day && d.au_by_day[0]) || [];
  const uq0 = (d.uq_by_day && d.uq_by_day[0]) || [];

  return `お疲れ様です。
${d.director || d.userName || '●●'}です。
本日の日報を下記に記載いたします。

⚠️ヒヤリハット報告⚠️
${blankText(d.hiyari)}

■実績：2Bダウン除き総販/2Bリク除き
目　標 : ${blank(d.r_ta)}/${blank(d.r_tb)}
${jissekiLines}
残　数：${hasTarget ? `${nokoriA}/${nokoriB}` : '○/○'}

■店舗様見込み獲得（${hasMikomi ? `${totalG}組/${totalD}台` : '○組/○台'}）
※常勤様の当日獲得は除く
${mikomiLines}

■内訳（接客組/着座組/成約組/成約台数）
アンケート枚数（全体） : ${blank(d.ank)}枚
アンケート（内FP）　 : ${(d.b_fp || []).map((v) => blank(v)).join('/') || '○/○/○/○'}
フリーキャッチ　  　 : ${(d.b_fc || []).map((v) => blank(v)).join('/') || '○/○/○/○'}
什器/POP                  : ${(d.b_pop || []).map((v) => blank(v)).join('/') || '○/○/○/○'}
家電/TA                     : ${(d.b_ta || []).map((v) => blank(v)).join('/') || '○/○/○/○'}
振り（常勤/他）　　   : ${(d.b_furi || []).map((v) => blank(v)).join('/') || '○/○/○/○'}

■au mobile実績
純新規獲得件数：${blank(au0[0], 0)}件
MNP(UQ⇒au)：${blank(au0[1], 0)}件
MNP(SB⇒au)：${blank(au0[2], 0)}件
MNP(DCM⇒au)：${blank(au0[3], 0)}件
MNP(YM⇒au)：${blank(au0[4], 0)}件
MNP(楽天⇒au)：${blank(au0[5], 0)}件
MNP(その他⇒au)：${blank(au0[6], 0)}件
機種変更獲得件数：${blank(au0[7], 0)}件

■UQ mobile実績
純新規獲得件数：${blank(uq0[0], 0)}件
MNP(au⇒UQ)：${blank(uq0[1], 0)}件
MNP(SB⇒UQ)：${blank(uq0[2], 0)}件
MNP(DCM⇒UQ)：${blank(uq0[3], 0)}件
MNP(YM⇒UQ)：${blank(uq0[4], 0)}件
MNP(楽天⇒UQ)：${blank(uq0[5], 0)}件
MNP(その他⇒UQ)：${blank(uq0[6], 0)}件
機種変更件数：${blank(uq0[7], 0)}件

■FTTH実績
auひかり　：${blank((d.ft || [])[0])}件
BIGLOBE光：${blank((d.ft || [])[1])}件
eo光：${blank((d.ft || [])[2])}件
CATV : ${blank((d.ft || [])[3])}件
WiMAX ：${blank((d.ft || [])[4])}件

■ライフデザイン実績
auでんき　　：${blank((d.ld || [])[0])}件
auPayカード：${blank((d.ld || [])[1])}件

■その他獲得商材
${blankText(d.other)}

■アライアンス協業
❶振り組数/成約組数
KDDI→eo : ${blank((d.al || [[]])[0]?.[0])}/${blank((d.al || [[]])[0]?.[1])}
eo→KDDI : ${blank((d.al || [[], []])[1]?.[0])}/${blank((d.al || [[], []])[1]?.[1])}
KDDI→CATV : ${blank((d.al || [[], [], []])[2]?.[0])}/${blank((d.al || [[], [], []])[2]?.[1])}
CATV→KDDI : ${blank((d.al || [[], [], [], []])[3]?.[0])}/${blank((d.al || [[], [], [], []])[3]?.[1])}

❷アライアンス様連携（eo/CATV）取組み工夫
${blankText(d.al_eff)}

■他社実績 
(純新規/MNP/番号移行/機変)
※他社取扱がない場合は「ー」を記入ください。
Softbank：${(d.ot || [['0', '0', '0', '0']])[0]?.join('/') || '0/0/0/0'}
docomo：${(d.ot || [[], ['0', '0', '0', '0']])[1]?.join('/') || '0/0/0/0'}
Ymobile：${(d.ot || [[], [], ['0', '0', '0', '0']])[2]?.join('/') || '0/0/0/0'}
楽天：${(d.ot || [[], [], [], ['0', '0', '0', '0']])[3]?.join('/') || '0/0/0/0'}

■全体総括（活動内容/集客状況/他社状況）
${blankText(d.txt_ov)}

■【達成：達成理由】【未達：改善策】
${blankText(d.txt_rs)}

■【添付】着座管理シート貼付

ご確認の程、よろしくお願いいたします。`;
}
