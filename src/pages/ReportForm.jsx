import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ref, push, set, remove } from 'firebase/database';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useFirebaseList } from '../lib/useFirebaseList';
import { parseLineBrief, classifyMembers } from '../lib/lineParser';
import Layout from '../components/Layout';

const DOWS = ['日', '月', '火', '水', '木', '金', '土'];
const CHANNELS = ['イオン', 'エディオン', 'ジョーシン', 'ケーズデンキ', 'ヤマダ', 'コジマ', 'その他'];

function todayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
function parseDateLocal(str) {
  if (!str) return new Date();
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function dowLabel(dateStr) {
  return dateStr ? DOWS[parseDateLocal(dateStr).getDay()] + '曜日' : '当日';
}
function detectChannel(storeName) {
  return CHANNELS.find((c) => c !== 'その他' && storeName.includes(c)) || '';
}

function emptyAuUq() {
  return Array(8).fill('');
}
function emptyDayPerf() {
  return { au: emptyAuUq(), uq: emptyAuUq(), fpA: '', fpB: '' };
}
function calcSouhanRiku(au, uq) {
  const n = (v) => +v || 0;
  const auTotal = au.reduce((a, b) => a + n(b), 0);
  const uqTotal = uq.reduce((a, b) => a + n(b), 0) - n(uq[1]);
  const souhan = auTotal + uqTotal;
  const riku = souhan - (n(au[1]) + n(au[7]) + n(uq[7]));
  return { souhan, riku };
}
function blank(v, mark = '○') {
  return v === '' || v === null || v === undefined ? mark : v;
}
function blankText(v) {
  return v && v.trim() !== '' ? v : '-';
}

const DRAFT_KEY = 'fp_draft_v3';

export default function ReportForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, canEditReport } = useAuth();
  const showToast = useToast();
  const { data: reports } = useFirebaseList('fp_reports');
  const { data: fpUsers } = useFirebaseList('fp_users');

  const [workDays, setWorkDays] = useState([todayStr()]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [store, setStore] = useState('');
  const [channel, setChannel] = useState('');
  const [channelAuto, setChannelAuto] = useState(true);
  const [director, setDirector] = useState(user?.name || '');
  const [hiyari, setHiyari] = useState('特に無し。');
  const [targetA, setTargetA] = useState('');
  const [targetB, setTargetB] = useState('');

  const [dayPerf, setDayPerf] = useState([emptyDayPerf()]);
  const [mikomi, setMikomi] = useState([{ g: '', d: '' }]);

  const [ank, setAnk] = useState('');
  const [bFp, setBFp] = useState(['', '', '', '']);
  const [bFc, setBFc] = useState(['', '', '', '']);
  const [bPop, setBPop] = useState(['', '', '', '']);
  const [bTa, setBTa] = useState(['', '', '', '']);
  const [bFuri, setBFuri] = useState(['', '', '', '']);
  const [ft, setFt] = useState(['', '', '', '', '']);
  const [ld, setLd] = useState(['', '']);
  const [other, setOther] = useState('');
  const [al, setAl] = useState([['', ''], ['', ''], ['', ''], ['', '']]);
  const [alEff, setAlEff] = useState('');
  const [ot, setOt] = useState([['0', '0', '0', '0'], ['0', '0', '0', '0'], ['0', '0', '0', '0'], ['0', '0', '0', '0']]);
  const [txtOv, setTxtOv] = useState('');
  const [txtRs, setTxtRs] = useState('');

  const [showPreview, setShowPreview] = useState(false);
  const [editingId, setEditingId] = useState(id || null);
  const [restoredOnce, setRestoredOnce] = useState(false);
  const [lineText, setLineText] = useState('');
  const [showLineBox, setShowLineBox] = useState(false);
  const [lineParsed, setLineParsed] = useState(null);
  const [dupModal, setDupModal] = useState(null);

  useEffect(() => {
    if (!id || !reports[id]) return;
    const r = reports[id];
    if (!canEditReport(r)) {
      showToast('この日報を編集する権限がありません');
      navigate('/reports');
      return;
    }
    const wd = r.workDays && r.workDays.length ? r.workDays : [r.date || todayStr()];
    setWorkDays(wd);
    setStore(r.store || '');
    setChannel(r.channel || '');
    setChannelAuto(false);
    setDirector(r.director || r.userName || '');
    setHiyari(r.hiyari || '');
    setTargetA(r.r_ta || '');
    setTargetB(r.r_tb || '');
    setDayPerf(wd.map((_, i) => ({
      au: (r.au_by_day && r.au_by_day[i]) || emptyAuUq(),
      uq: (r.uq_by_day && r.uq_by_day[i]) || emptyAuUq(),
      fpA: r.fp_by_day?.[i]?.a ?? '',
      fpB: r.fp_by_day?.[i]?.b ?? '',
    })));
    setMikomi(wd.map((_, i) => ({ g: r.v_mikomi?.[i]?.g ?? '', d: r.v_mikomi?.[i]?.d ?? '' })));
    setAnk(r.ank ?? '');
    setBFp(r.b_fp || ['', '', '', '']);
    setBFc(r.b_fc || ['', '', '', '']);
    setBPop(r.b_pop || ['', '', '', '']);
    setBTa(r.b_ta || ['', '', '', '']);
    setBFuri(r.b_furi || ['', '', '', '']);
    setFt(r.ft || ['', '', '', '', '']);
    setLd(r.ld || ['', '']);
    setOther(r.other || '');
    setAl(r.al || [['', ''], ['', ''], ['', ''], ['', '']]);
    setAlEff(r.al_eff || '');
    setOt(r.ot || [['0', '0', '0', '0'], ['0', '0', '0', '0'], ['0', '0', '0', '0'], ['0', '0', '0', '0']]);
    setTxtOv(r.txt_ov || '');
    setTxtRs(r.txt_rs || '');
    setActiveIdx(wd.length - 1);
    setEditingId(id);
  }, [id, reports]);

  useEffect(() => {
    if (id || restoredOnce) return;
    setRestoredOnce(true);
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || Date.now() - parsed.ts > 1000 * 60 * 60 * 24) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      if (confirm('前回の入力途中のデータがあります。復元しますか？')) {
        const d = parsed.data;
        setWorkDays(d.workDays || [todayStr()]);
        setStore(d.store || '');
        setChannel(d.channel || '');
        setChannelAuto(d.channelAuto ?? true);
        setDirector(d.director || user?.name || '');
        setHiyari(d.hiyari ?? '特に無し。');
        setTargetA(d.targetA || '');
        setTargetB(d.targetB || '');
        setDayPerf(d.dayPerf && d.dayPerf.length ? d.dayPerf : [emptyDayPerf()]);
        setMikomi(d.mikomi && d.mikomi.length ? d.mikomi : [{ g: '', d: '' }]);
        setAnk(d.ank ?? '');
        setBFp(d.bFp || ['', '', '', '']);
        setBFc(d.bFc || ['', '', '', '']);
        setBPop(d.bPop || ['', '', '', '']);
        setBTa(d.bTa || ['', '', '', '']);
        setBFuri(d.bFuri || ['', '', '', '']);
        setFt(d.ft || ['', '', '', '', '']);
        setLd(d.ld || ['', '']);
        setOther(d.other || '');
        setAl(d.al || [['', ''], ['', ''], ['', ''], ['', '']]);
        setAlEff(d.alEff || '');
        setOt(d.ot || [['0', '0', '0', '0'], ['0', '0', '0', '0'], ['0', '0', '0', '0'], ['0', '0', '0', '0']]);
        setTxtOv(d.txtOv || '');
        setTxtRs(d.txtRs || '');
        showToast('✅ 前回の入力を復元しました');
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch (e) {
      console.warn('draft restore error', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (editingId) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            ts: Date.now(),
            data: { workDays, store, channel, channelAuto, director, hiyari, targetA, targetB, dayPerf, mikomi, ank, bFp, bFc, bPop, bTa, bFuri, ft, ld, other, al, alEff, ot, txtOv, txtRs },
          })
        );
      } catch (e) {
        /* ignore */
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [workDays, store, channel, channelAuto, director, hiyari, targetA, targetB, dayPerf, mikomi, ank, bFp, bFc, bPop, bTa, bFuri, ft, ld, other, al, alEff, ot, txtOv, txtRs, editingId]);

  useEffect(() => {
    if (!channelAuto) return;
    const detected = detectChannel(store);
    if (detected) setChannel(detected);
  }, [store, channelAuto]);

  function handleChannelChange(v) {
    setChannel(v);
    setChannelAuto(false);
  }

  function addWorkday() {
    const last = workDays[workDays.length - 1];
    const d = parseDateLocal(last || todayStr());
    d.setDate(d.getDate() + 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setWorkDays([...workDays, next]);
    setDayPerf([...dayPerf, emptyDayPerf()]);
    setMikomi([...mikomi, { g: '', d: '' }]);
    setActiveIdx(workDays.length);
  }
  function removeWorkday(idx) {
    if (workDays.length <= 1) return;
    setWorkDays(workDays.filter((_, i) => i !== idx));
    setDayPerf(dayPerf.filter((_, i) => i !== idx));
    setMikomi(mikomi.filter((_, i) => i !== idx));
    setActiveIdx(Math.max(0, idx - 1));
  }
  function updateWorkdayDate(idx, value) {
    const next = [...workDays];
    next[idx] = value;
    setWorkDays(next);
  }

  function updateMobile(type, mi, value) {
    setDayPerf((prev) =>
      prev.map((d, i) => {
        if (i !== activeIdx) return d;
        const arr = [...d[type]];
        arr[mi] = value;
        return { ...d, [type]: arr };
      })
    );
  }
  function updateFp(which, value) {
    setDayPerf((prev) => prev.map((d, i) => (i === activeIdx ? { ...d, [which]: value } : d)));
  }
  function updateMikomi(idx, patch) {
    setMikomi((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }

  const cur = dayPerf[activeIdx] || emptyDayPerf();
  const curCalc = useMemo(() => calcSouhanRiku(cur.au, cur.uq), [cur]);

  const totals = useMemo(() => {
    const sums = dayPerf.map((d) => calcSouhanRiku(d.au, d.uq));
    const totalA = sums.reduce((s, x) => s + x.souhan, 0);
    const totalB = sums.reduce((s, x) => s + x.riku, 0);
    const ta = +targetA || 0;
    const tb = +targetB || 0;
    return {
      totalA,
      totalB,
      nokoriA: Math.max(ta - totalA, 0),
      nokoriB: Math.max(tb - totalB, 0),
      ach: ta > 0 ? Math.round((totalA / ta) * 100) : 0,
      sums,
    };
  }, [dayPerf, targetA, targetB]);

  function handleParseLine() {
    const parsed = parseLineBrief(lineText);
    setLineParsed(parsed);
    if (parsed.store) {
      setStore(parsed.store);
      setChannelAuto(true);
    }
    if (parsed.target) setTargetA(parsed.target);
    if (parsed.dates.length) {
      setWorkDays(parsed.dates);
      setDayPerf(parsed.dates.map(() => emptyDayPerf()));
      setMikomi(parsed.dates.map(() => ({ g: '', d: '' })));
      setActiveIdx(parsed.dates.length - 1);
    }
    showToast('✅ 案件指示書を読み取りました（実績の数字は別途入力してください）');
  }

  const registeredNames = useMemo(() => Object.values(fpUsers).map((u) => u.name).filter(Boolean), [fpUsers]);

  function buildText() {
    const wdays = workDays;
    const dayLabels = wdays.map(dowLabel);

    const jissekiLines = wdays
      .map((dt, i) => {
        const calc = totals.sums[i] || { souhan: '', riku: '' };
        const dp = dayPerf[i] || emptyDayPerf();
        const hasAny = dp.au.some((v) => v !== '') || dp.uq.some((v) => v !== '');
        if (!hasAny) return `${dayLabels[i]} : ○/○（内FP獲得○/○）`;
        return `${dayLabels[i]} : ${calc.souhan}/${calc.riku}（内FP獲得${blank(dp.fpA)}/${blank(dp.fpB)}）`;
      })
      .join('\n');

    const mikomiLines = wdays
      .map((dt, i) => {
        const m = mikomi[i] || { g: '', d: '' };
        const has = m.g !== '' && m.d !== '';
        return `${dayLabels[i]}獲得 : ${has ? `${m.g}組${m.d}台` : '-'}`;
      })
      .join('\n');
    const totalG = mikomi.reduce((s, m) => s + (+m.g || 0), 0);
    const totalD = mikomi.reduce((s, m) => s + (+m.d || 0), 0);
    const hasMikomiTotal = mikomi.some((m) => m.g !== '' && m.d !== '');

    const cur0 = dayPerf[0] || emptyDayPerf();

    return `お疲れ様です。
${director || '●●'}です。
本日の日報を下記に記載いたします。

⚠️ヒヤリハット報告⚠️
${blankText(hiyari)}

■実績：2Bダウン除き総販/2Bリク除き
目　標 : ${blank(targetA)}/${blank(targetB)}
${jissekiLines}
残　数：${targetA && targetB ? `${totals.nokoriA}/${totals.nokoriB}` : '○/○'}

■店舗様見込み獲得（${hasMikomiTotal ? `${totalG}組/${totalD}台` : '○組/○台'}）
※常勤様の当日獲得は除く
${mikomiLines}

■内訳（接客組/着座組/成約組/成約台数）
アンケート枚数（全体） : ${blank(ank)}枚
アンケート（内FP）　 : ${bFp.map((v) => blank(v)).join('/')}
フリーキャッチ　  　 : ${bFc.map((v) => blank(v)).join('/')}
什器/POP                  : ${bPop.map((v) => blank(v)).join('/')}
家電/TA                     : ${bTa.map((v) => blank(v)).join('/')}
振り（常勤/他）　　   : ${bFuri.map((v) => blank(v)).join('/')}
※フリーキャッチの接客組は「足を止めた数」
※アンケートの着座組は「見積りを出した数」

■au mobile実績
純新規獲得件数：${blank(cur0.au[0], 0)}件
MNP(UQ⇒au)：${blank(cur0.au[1], 0)}件
MNP(SB⇒au)：${blank(cur0.au[2], 0)}件
MNP(DCM⇒au)：${blank(cur0.au[3], 0)}件
MNP(YM⇒au)：${blank(cur0.au[4], 0)}件
MNP(楽天⇒au)：${blank(cur0.au[5], 0)}件
MNP(その他⇒au)：${blank(cur0.au[6], 0)}件
機種変更獲得件数：${blank(cur0.au[7], 0)}件

■UQ mobile実績
純新規獲得件数：${blank(cur0.uq[0], 0)}件
MNP(au⇒UQ)：${blank(cur0.uq[1], 0)}件
MNP(SB⇒UQ)：${blank(cur0.uq[2], 0)}件
MNP(DCM⇒UQ)：${blank(cur0.uq[3], 0)}件
MNP(YM⇒UQ)：${blank(cur0.uq[4], 0)}件
MNP(楽天⇒UQ)：${blank(cur0.uq[5], 0)}件
MNP(その他⇒UQ)：${blank(cur0.uq[6], 0)}件
機種変更件数：${blank(cur0.uq[7], 0)}件

■FTTH実績
auひかり　：${blank(ft[0])}件
BIGLOBE光：${blank(ft[1])}件
eo光：${blank(ft[2])}件
CATV : ${blank(ft[3])}件
WiMAX ：${blank(ft[4])}件

■ライフデザイン実績
auでんき　　：${blank(ld[0])}件
auPayカード：${blank(ld[1])}件

■その他獲得商材
${blankText(other)}

■アライアンス協業
❶振り組数/成約組数
KDDI→eo : ${blank(al[0][0])}/${blank(al[0][1])}
eo→KDDI : ${blank(al[1][0])}/${blank(al[1][1])}
KDDI→CATV : ${blank(al[2][0])}/${blank(al[2][1])}
CATV→KDDI : ${blank(al[3][0])}/${blank(al[3][1])}

❷アライアンス様連携（eo/CATV）取組み工夫
${blankText(alEff)}

■他社実績 
(純新規/MNP/番号移行/機変)
※他社取扱がない場合は「ー」を記入ください。
Softbank：${ot[0].join('/')}
docomo：${ot[1].join('/')}
Ymobile：${ot[2].join('/')}
楽天：${ot[3].join('/')}

■全体総括（活動内容/集客状況/他社状況）
${blankText(txtOv)}

■【達成：達成理由】【未達：改善策】
${blankText(txtRs)}

■【添付】着座管理シート貼付

ご確認の程、よろしくお願いいたします。`;
  }

  async function findDuplicate() {
    const date = workDays[0];
    const matches = Object.entries(reports).filter(
      ([rid, r]) =>
        rid !== editingId &&
        r.date === date &&
        r.store === store &&
        r.userName === user?.name &&
        r.userEmail === user?.email
    );
    return matches.length ? matches[0][0] : null;
  }

  async function doSave(deleteExistingId) {
    const payload = {
      date: workDays[0],
      workDays,
      store,
      channel,
      director,
      userName: user?.name || '',
      userEmail: user?.email || '',
      hiyari,
      r_ta: targetA,
      r_tb: targetB,
      jisseki: totals.sums.map((s) => ({ a: s.souhan, b: s.riku })),
      fp_by_day: dayPerf.map((d) => ({ a: +d.fpA || 0, b: +d.fpB || 0 })),
      v_mikomi: mikomi.map((m) => ({ g: +m.g || 0, d: +m.d || 0 })),
      au_by_day: dayPerf.map((d) => d.au.map((v) => +v || 0)),
      uq_by_day: dayPerf.map((d) => d.uq.map((v) => +v || 0)),
      auto_souhan: totals.totalA,
      auto_2b: totals.totalB,
      ach: totals.ach,
      ank: +ank || 0,
      b_fp: bFp,
      b_fc: bFc,
      b_pop: bPop,
      b_ta: bTa,
      b_furi: bFuri,
      ft,
      ld,
      other,
      al,
      al_eff: alEff,
      ot,
      txt_ov: txtOv,
      txt_rs: txtRs,
      updatedAt: Date.now(),
    };
    try {
      if (deleteExistingId) {
        await remove(ref(db, `fp_reports/${deleteExistingId}`));
      }
      if (editingId) {
        await set(ref(db, `fp_reports/${editingId}`), { ...reports[editingId], ...payload });
        showToast('✅ 日報を更新しました');
      } else {
        payload.createdAt = Date.now();
        await set(push(ref(db, 'fp_reports')), payload);
        showToast('✅ 日報を保存しました');
        localStorage.removeItem(DRAFT_KEY);
      }
      navigate('/reports');
    } catch (e) {
      showToast('保存エラー: ' + e.message);
    }
  }

  async function handleSaveClick() {
    if (!store || !workDays[0]) {
      showToast('店舗名は必須です');
      return;
    }
    if (!editingId) {
      const dupId = await findDuplicate();
      if (dupId) {
        setDupModal({ existingId: dupId });
        return;
      }
    }
    doSave(null);
  }

  return (
    <Layout title={editingId ? '日報編集' : '日報入力'} showBack>
      <div className="card">
        <button className="btn btn-outline" onClick={() => setShowLineBox(!showLineBox)}>
          {showLineBox ? '閉じる' : '📋 詳細から自動入力'}
        </button>
        {showLineBox && (
          <div style={{ marginTop: 10 }}>
            <textarea
              className="inp"
              rows={5}
              value={lineText}
              onChange={(e) => setLineText(e.target.value)}
              placeholder="LINEで届いた案件指示書をそのまま貼り付け"
              style={{ fontFamily: 'monospace', fontSize: '.78rem' }}
            />
            <button className="btn btn-p" style={{ marginTop: 8 }} onClick={handleParseLine}>
              読み取って自動入力
            </button>
            {lineParsed && lineParsed.dates.length > 0 && (
              <div style={{ marginTop: 10, fontSize: '.76rem', color: 'var(--sub)' }}>
                {lineParsed.dates.map((dt) => {
                  const names = lineParsed.membersByDate[dt] || [];
                  const classified = classifyMembers(names, registeredNames);
                  return (
                    <div key={dt} style={{ marginBottom: 6 }}>
                      <div style={{ fontWeight: 700 }}>{dt}（{dowLabel(dt)}）</div>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 3 }}>
                        {classified.map((m) => (
                          <span key={m.name} className={`badge ${m.isOwnCompany ? 'b-orange' : 'b-gray'}`}>
                            {m.name}（{m.isOwnCompany ? '自社' : '他社'}）
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">📅 稼働日</div>
        {workDays.map((dt, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: '.73rem', fontWeight: 600, flex: '0 0 60px' }}>{i + 1}日目</div>
            <input className="inp" type="date" value={dt} onChange={(e) => updateWorkdayDate(i, e.target.value)} />
            {i > 0 && (
              <button onClick={() => removeWorkday(i)} style={{ background: '#fee2e2', border: 'none', borderRadius: 6, padding: '6px 10px', color: '#dc2626', fontWeight: 700, cursor: 'pointer' }}>×</button>
            )}
          </div>
        ))}
        <button className="btn btn-gray" onClick={addWorkday}>＋ 日程を追加</button>
      </div>

      <div className="card">
        <div className="card-title">📌 基本情報</div>
        <div className="form-group">
          <label>店舗名 <span className="req">*</span></label>
          <input className="inp" value={store} onChange={(e) => setStore(e.target.value)} placeholder="例：○○イオン" />
        </div>
        <div className="form-group">
          <label>販路（店舗名から自動判定／手動変更可） <span className="req">*</span></label>
          <select className="inp" value={channel} onChange={(e) => handleChannelChange(e.target.value)}>
            <option value="">選択</option>
            {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>ディレクター名 <span className="req">*</span></label>
          <input className="inp" value={director} onChange={(e) => setDirector(e.target.value)} />
        </div>
        <div className="form-group">
          <label>⚠️ ヒヤリハット報告</label>
          <input className="inp" value={hiyari} onChange={(e) => setHiyari(e.target.value)} placeholder="特に無し。" />
        </div>
        <div className="form-group">
          <label>現在入力中の日（実績入力欄が切り替わります）</label>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {workDays.map((dt, i) => (
              <button key={i} onClick={() => setActiveIdx(i)} className={`fchip${i === activeIdx ? ' active' : ''}`} style={{ padding: '8px 14px' }}>
                {dowLabel(dt)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">🎯 目標／残数</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <input className="inp" type="text" inputMode="numeric" placeholder="総販目標" value={targetA} onChange={(e) => setTargetA(e.target.value)} />
          <span className="ts">/</span>
          <input className="inp" type="text" inputMode="numeric" placeholder="リク抜き目標" value={targetB} onChange={(e) => setTargetB(e.target.value)} />
        </div>
        <ResultRow label="総販/リク抜き" a={totals.totalA} b={totals.totalB} color="var(--pd)" />
        <ResultRow label="残数" a={targetA ? totals.nokoriA : '○'} b={targetB ? totals.nokoriB : '○'} color="var(--red)" />
      </div>

      <div className="card">
        <div className="card-title">📱 au / UQ mobile実績（{dowLabel(workDays[activeIdx])}）</div>
        <FieldRow label="純新規" value={cur.au[0]} onChange={(v) => updateMobile('au', 0, v)} />
        <FieldRow label="MNP(UQ⇒au)" value={cur.au[1]} onChange={(v) => updateMobile('au', 1, v)} />
        <FieldRow label="MNP(SB⇒au)" value={cur.au[2]} onChange={(v) => updateMobile('au', 2, v)} />
        <FieldRow label="MNP(DCM⇒au)" value={cur.au[3]} onChange={(v) => updateMobile('au', 3, v)} />
        <FieldRow label="MNP(YM⇒au)" value={cur.au[4]} onChange={(v) => updateMobile('au', 4, v)} />
        <FieldRow label="MNP(楽天⇒au)" value={cur.au[5]} onChange={(v) => updateMobile('au', 5, v)} />
        <FieldRow label="MNP(その他⇒au)" value={cur.au[6]} onChange={(v) => updateMobile('au', 6, v)} />
        <FieldRow label="機種変更" value={cur.au[7]} onChange={(v) => updateMobile('au', 7, v)} />
        <div style={{ height: 8 }} />
        <FieldRow label="UQ純新規" value={cur.uq[0]} onChange={(v) => updateMobile('uq', 0, v)} />
        <FieldRow label="MNP(au⇒UQ)" value={cur.uq[1]} onChange={(v) => updateMobile('uq', 1, v)} />
        <FieldRow label="MNP(SB⇒UQ)" value={cur.uq[2]} onChange={(v) => updateMobile('uq', 2, v)} />
        <FieldRow label="MNP(DCM⇒UQ)" value={cur.uq[3]} onChange={(v) => updateMobile('uq', 3, v)} />
        <FieldRow label="MNP(YM⇒UQ)" value={cur.uq[4]} onChange={(v) => updateMobile('uq', 4, v)} />
        <FieldRow label="MNP(楽天⇒UQ)" value={cur.uq[5]} onChange={(v) => updateMobile('uq', 5, v)} />
        <FieldRow label="MNP(その他⇒UQ)" value={cur.uq[6]} onChange={(v) => updateMobile('uq', 6, v)} />
        <FieldRow label="UQ機種変更" value={cur.uq[7]} onChange={(v) => updateMobile('uq', 7, v)} />
        <ResultRow label="総販/リク抜き" a={curCalc.souhan} b={curCalc.riku} color="var(--pd)" style={{ marginTop: 8 }} />
        <div style={{ height: 8 }} />
        <FieldRow label="FP獲得(総販)" value={cur.fpA} onChange={(v) => updateFp('fpA', v)} />
        <FieldRow label="FP獲得(リク抜)" value={cur.fpB} onChange={(v) => updateFp('fpB', v)} />
      </div>

      <div className="card">
        <div className="card-title">🏠 店舗様見込み獲得（土日とも常時表示）</div>
        {workDays.map((dt, i) => (
          <div key={i}>
            <FieldRow label={`${dowLabel(dt)}・組数`} value={mikomi[i]?.g ?? ''} onChange={(v) => updateMikomi(i, { g: v })} unit="組" />
            <FieldRow label={`${dowLabel(dt)}・台数`} value={mikomi[i]?.d ?? ''} onChange={(v) => updateMikomi(i, { d: v })} unit="台" />
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">📋 内訳（接客組/着座組/成約組/成約台数）</div>
        <FieldRow label="アンケート枚数" value={ank} onChange={setAnk} unit="枚" />
        <BreakdownRow label="アンケート（内FP）" values={bFp} onChange={setBFp} />
        <BreakdownRow label="フリーキャッチ" values={bFc} onChange={setBFc} />
        <BreakdownRow label="什器/POP" values={bPop} onChange={setBPop} />
        <BreakdownRow label="家電/TA" values={bTa} onChange={setBTa} />
        <BreakdownRow label="振り（常勤/他）" values={bFuri} onChange={setBFuri} />
      </div>

      <div className="card">
        <div className="card-title">🌐 FTTH実績</div>
        <FieldRow label="auひかり" value={ft[0]} onChange={(v) => setFt([v, ft[1], ft[2], ft[3], ft[4]])} />
        <FieldRow label="BIGLOBE光" value={ft[1]} onChange={(v) => setFt([ft[0], v, ft[2], ft[3], ft[4]])} />
        <FieldRow label="eo光" value={ft[2]} onChange={(v) => setFt([ft[0], ft[1], v, ft[3], ft[4]])} />
        <FieldRow label="CATV" value={ft[3]} onChange={(v) => setFt([ft[0], ft[1], ft[2], v, ft[4]])} />
        <FieldRow label="WiMAX" value={ft[4]} onChange={(v) => setFt([ft[0], ft[1], ft[2], ft[3], v])} />
      </div>

      <div className="card">
        <div className="card-title">💡 ライフデザイン実績</div>
        <FieldRow label="auでんき" value={ld[0]} onChange={(v) => setLd([v, ld[1]])} />
        <FieldRow label="auPayカード" value={ld[1]} onChange={(v) => setLd([ld[0], v])} />
      </div>

      <div className="card">
        <div className="card-title">🎁 その他獲得商材</div>
        <input className="inp" value={other} onChange={(e) => setOther(e.target.value)} placeholder="（あれば自由記述）" />
      </div>

      <div className="card">
        <div className="card-title">🤝 アライアンス協業（振り組数/成約組数）</div>
        {['KDDI→eo', 'eo→KDDI', 'KDDI→CATV', 'CATV→KDDI'].map((lbl, i) => (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: '.73rem', flex: '0 0 90px' }}>{lbl}</span>
            <input
              className="inp"
              type="text"
              inputMode="numeric"
              value={al[i][0]}
              onChange={(e) => {
                const next = al.map((row, ri) => (ri === i ? [e.target.value, row[1]] : row));
                setAl(next);
              }}
            />
            <span className="ts">/</span>
            <input
              className="inp"
              type="text"
              inputMode="numeric"
              value={al[i][1]}
              onChange={(e) => {
                const next = al.map((row, ri) => (ri === i ? [row[0], e.target.value] : row));
                setAl(next);
              }}
            />
          </div>
        ))}
        <div className="form-group">
          <label>アライアンス様連携（eo/CATV）取組み工夫</label>
          <textarea className="inp" rows={2} value={alEff} onChange={(e) => setAlEff(e.target.value)} placeholder="（あれば自由記述）" />
        </div>
      </div>

      <div className="card">
        <div className="card-title">🏢 他社実績（純新規/MNP/番号移行/機変）</div>
        {['Softbank', 'docomo', 'Ymobile', '楽天'].map((lbl, i) => (
          <div key={lbl} style={{ marginBottom: 8 }}>
            <div className="ts" style={{ marginBottom: 3 }}>{lbl}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 4 }}>
              {[0, 1, 2, 3].map((j) => (
                <input
                  key={j}
                  className="inp-s"
                  type="text"
                  inputMode="numeric"
                  value={ot[i][j]}
                  onChange={(e) => {
                    const next = ot.map((row, ri) => (ri === i ? row.map((v, vi) => (vi === j ? e.target.value : v)) : row));
                    setOt(next);
                  }}
                  style={{ textAlign: 'center' }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">✍️ コメント</div>
        <div className="form-group">
          <label>■全体総括（活動内容/集客状況/他社状況）</label>
          <textarea className="inp" rows={4} value={txtOv} onChange={(e) => setTxtOv(e.target.value)} placeholder="（あれば自由記述）" />
        </div>
        <div className="form-group">
          <label>■【達成：達成理由】【未達：改善策】</label>
          <textarea className="inp" rows={4} value={txtRs} onChange={(e) => setTxtRs(e.target.value)} placeholder="（あれば自由記述）" />
        </div>
      </div>

      <button className="btn btn-p" onClick={() => setShowPreview(true)}>📋 プレビュー</button>

      {showPreview && (
        <div className="modal-overlay" onClick={() => setShowPreview(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 10 }}>📋 日報プレビュー</h3>
            <div style={{ background: '#f8faff', border: '1px solid var(--border)', borderRadius: 10, padding: 14, fontSize: '.76rem', lineHeight: 1.8, whiteSpace: 'pre-wrap', maxHeight: '50vh', overflowY: 'auto' }}>
              {buildText()}
            </div>
            <button
              className="btn btn-outline"
              style={{ marginTop: 12 }}
              onClick={() => {
                navigator.clipboard.writeText(buildText());
                showToast('✅ コピーしました');
              }}
            >
              📋 コピー
            </button>
            <button className="btn btn-green" onClick={handleSaveClick}>💾 保存</button>
            <button className="btn btn-gray" onClick={() => setShowPreview(false)}>閉じる</button>
          </div>
        </div>
      )}

      {dupModal && (
        <div className="modal-overlay" onClick={() => setDupModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.6rem', marginBottom: 8 }}>⚠️</div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>すでに日報データが存在します</div>
            <div className="ts" style={{ marginBottom: 14 }}>同じ日付・店舗・ユーザーの日報が見つかりました。</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-gray" onClick={() => setDupModal(null)}>キャンセル</button>
              <button
                className="btn"
                style={{ background: '#dc2626', color: '#fff' }}
                onClick={() => {
                  const exId = dupModal.existingId;
                  setDupModal(null);
                  doSave(exId);
                }}
              >
                上書き
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function FieldRow({ label, value, onChange, unit = '件' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <span style={{ fontSize: '.73rem', flex: '0 0 110px', color: 'var(--text)' }}>{label}：</span>
      <input className="inp" type="text" inputMode="numeric" pattern="[0-9]*" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" style={{ textAlign: 'right' }} />
      <span className="ts" style={{ flex: '0 0 16px' }}>{unit}</span>
    </div>
  );
}

function BreakdownRow({ label, values, onChange }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="ts" style={{ marginBottom: 3 }}>{label}（接客/着座/成約組/成約台）</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 4 }}>
        {values.map((v, i) => (
          <input
            key={i}
            className="inp-s"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={v}
            onChange={(e) => {
              const next = values.map((vv, vi) => (vi === i ? e.target.value : vv));
              onChange(next);
            }}
            style={{ textAlign: 'center' }}
          />
        ))}
      </div>
    </div>
  );
}

function ResultRow({ label, a, b, color, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--pl)', borderRadius: 8, padding: '8px 12px', marginBottom: 6, ...style }}>
      <span style={{ fontSize: '.78rem', fontWeight: 700, color, flex: '0 0 110px' }}>{label}：</span>
      <span style={{ fontSize: '.9rem', fontWeight: 700, color, width: 32, textAlign: 'right', display: 'inline-block' }}>{a}</span>
      <span style={{ fontSize: '.9rem', color: 'var(--sub)', width: 16, textAlign: 'center', display: 'inline-block' }}>/</span>
      <span style={{ fontSize: '.9rem', fontWeight: 700, color, width: 32, textAlign: 'left', display: 'inline-block' }}>{b}</span>
    </div>
  );
}
