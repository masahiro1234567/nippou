import { useEffect, useMemo, useState, useCallback } from 'react';
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
  return v && String(v).trim() !== '' ? v : '-';
}

// 1日分のデータの初期値（タブごとに独立）
function emptyDayData(date = '') {
  return {
    date,
    au: Array(8).fill(''),
    uq: Array(8).fill(''),
    fpA: '',
    fpB: '',
    hiyari: '特に無し。',
    ank: '',
    bFp: ['', '', '', ''],
    bFc: ['', '', '', ''],
    bPop: ['', '', '', ''],
    bTa: ['', '', '', ''],
    bFuri: ['', '', '', ''],
    ft: ['', '', '', '', ''],
    ld: ['', ''],
    other: '',
    al: [['', ''], ['', ''], ['', ''], ['', '']],
    alEff: '',
    ot: [['0', '0', '0', '0'], ['0', '0', '0', '0'], ['0', '0', '0', '0'], ['0', '0', '0', '0']],
    txtOv: '',
    txtRs: '',
    mikomiG: '',
    mikomiD: '',
  };
}

const DRAFT_KEY = 'fp_draft_v4';

export default function ReportForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, canEditReport } = useAuth();
  const showToast = useToast();
  const { data: reports } = useFirebaseList('fp_reports');
  const { data: fpUsers } = useFirebaseList('fp_users');

  // 共通フィールド（タブ切り替えで変わらない）
  const [store, setStore] = useState('');
  const [channel, setChannel] = useState('');
  const [channelAuto, setChannelAuto] = useState(true);
  const [director, setDirector] = useState(user?.name || '');
  const [targetA, setTargetA] = useState('');
  const [targetB, setTargetB] = useState('');

  // 日ごとのデータ（タブで切り替わる。土曜・日曜それぞれ独立）
  const [days, setDays] = useState([emptyDayData(todayStr())]);
  const [activeIdx, setActiveIdx] = useState(0);

  // 編集モード
  const [editingId, setEditingId] = useState(id || null);
  const [restoredOnce, setRestoredOnce] = useState(false);

  // LINE指示書
  const [lineText, setLineText] = useState('');
  const [showLineBox, setShowLineBox] = useState(false);
  const [lineParsed, setLineParsed] = useState(null);

  // 重複保存
  const [dupModal, setDupModal] = useState(null);

  // プレビュー
  const [showPreview, setShowPreview] = useState(false);

  // 編集モード読み込み
  useEffect(() => {
    if (!id || !reports[id]) return;
    const r = reports[id];
    if (!canEditReport(r)) {
      showToast('この日報を編集する権限がありません');
      navigate('/reports');
      return;
    }
    setStore(r.store || '');
    setChannel(r.channel || '');
    setChannelAuto(false);
    setDirector(r.director || r.userName || '');
    setTargetA(r.r_ta || '');
    setTargetB(r.r_tb || '');
    // 既存データを1日分として読み込む
    const d = emptyDayData(r.date || todayStr());
    d.au = r.au || Array(8).fill('');
    d.uq = r.uq || Array(8).fill('');
    d.fpA = r.fpA ?? '';
    d.fpB = r.fpB ?? '';
    d.hiyari = r.hiyari || '';
    d.ank = r.ank ?? '';
    d.bFp = r.b_fp || ['', '', '', ''];
    d.bFc = r.b_fc || ['', '', '', ''];
    d.bPop = r.b_pop || ['', '', '', ''];
    d.bTa = r.b_ta || ['', '', '', ''];
    d.bFuri = r.b_furi || ['', '', '', ''];
    d.ft = r.ft || ['', '', '', '', ''];
    d.ld = r.ld || ['', ''];
    d.other = r.other || '';
    d.al = r.al || [['', ''], ['', ''], ['', ''], ['', '']];
    d.alEff = r.al_eff || '';
    d.ot = r.ot || [['0', '0', '0', '0'], ['0', '0', '0', '0'], ['0', '0', '0', '0'], ['0', '0', '0', '0']];
    d.txtOv = r.txt_ov || '';
    d.txtRs = r.txt_rs || '';
    d.mikomiG = r.mikomiG ?? '';
    d.mikomiD = r.mikomiD ?? '';
    setDays([d]);
    setActiveIdx(0);
    setEditingId(id);
  }, [id, reports]);

  // 下書き復元
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
        setStore(d.store || '');
        setChannel(d.channel || '');
        setChannelAuto(d.channelAuto ?? true);
        setDirector(d.director || user?.name || '');
        setTargetA(d.targetA || '');
        setTargetB(d.targetB || '');
        setDays(d.days && d.days.length ? d.days : [emptyDayData(todayStr())]);
        setActiveIdx(d.activeIdx || 0);
        showToast('✅ 前回の入力を復元しました');
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch (e) {
      console.warn('draft restore error', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 下書き自動保存
  useEffect(() => {
    if (editingId) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          ts: Date.now(),
          data: { store, channel, channelAuto, director, targetA, targetB, days, activeIdx },
        }));
      } catch (e) { /* ignore */ }
    }, 600);
    return () => clearTimeout(timer);
  }, [store, channel, channelAuto, director, targetA, targetB, days, activeIdx, editingId]);

  // 販路自動判定
  useEffect(() => {
    if (!channelAuto) return;
    const detected = detectChannel(store);
    if (detected) setChannel(detected);
  }, [store, channelAuto]);

  // 日の追加/削除
  function addDay() {
    const last = days[days.length - 1].date;
    const d = parseDateLocal(last || todayStr());
    d.setDate(d.getDate() + 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setDays([...days, emptyDayData(next)]);
    setActiveIdx(days.length);
  }
  function removeDay(idx) {
    if (days.length <= 1) return;
    setDays(days.filter((_, i) => i !== idx));
    setActiveIdx(Math.max(0, idx - 1));
  }
  function updateDayDate(idx, value) {
    setDays(prev => prev.map((d, i) => i === idx ? { ...d, date: value } : d));
  }

  // 現在のタブのデータを更新するヘルパー
  const updateCur = useCallback((patch) => {
    setDays(prev => prev.map((d, i) => i === activeIdx ? { ...d, ...patch } : d));
  }, [activeIdx]);

  const updateMobile = useCallback((type, mi, value) => {
    setDays(prev => prev.map((d, i) => {
      if (i !== activeIdx) return d;
      const arr = [...d[type]];
      arr[mi] = value;
      return { ...d, [type]: arr };
    }));
  }, [activeIdx]);

  const cur = days[activeIdx] || emptyDayData();
  const curCalc = useMemo(() => calcSouhanRiku(cur.au, cur.uq), [cur.au, cur.uq]);
  const nokoriA = targetA ? Math.max((+targetA || 0) - curCalc.souhan, 0) : '○';
  const nokoriB = targetB ? Math.max((+targetB || 0) - curCalc.riku, 0) : '○';

  // LINE指示書解析
  const registeredNames = useMemo(() => Object.values(fpUsers).map(u => u.name).filter(Boolean), [fpUsers]);

  function handleParseLine() {
    const parsed = parseLineBrief(lineText);
    setLineParsed(parsed);
    if (parsed.store) { setStore(parsed.store); setChannelAuto(true); }
    if (parsed.target) setTargetA(parsed.target);
    if (parsed.dates.length) {
      const newDays = parsed.dates.map(dt => emptyDayData(dt));
      setDays(newDays);
      setActiveIdx(newDays.length - 1);
    }
    showToast('✅ 案件指示書を読み取りました');
  }

  // テキスト生成
  function buildText(d = cur) {
    const calc = calcSouhanRiku(d.au, d.uq);
    return `お疲れ様です。
${director || '●●'}です。
本日の日報を下記に記載いたします。

⚠️ヒヤリハット報告⚠️
${blankText(d.hiyari)}

■実績：2Bダウン除き総販/2Bリク除き
目　標 : ${blank(targetA)}/${blank(targetB)}
${dowLabel(d.date)} : ${calc.souhan}/${calc.riku}（内FP獲得${blank(d.fpA)}/${blank(d.fpB)}）
残　数：${targetA && targetB ? `${Math.max((+targetA||0)-calc.souhan,0)}/${Math.max((+targetB||0)-calc.riku,0)}` : '○/○'}

■店舗様見込み獲得（${d.mikomiG && d.mikomiD ? `${d.mikomiG}組/${d.mikomiD}台` : '○組/○台'}）
※常勤様の当日獲得は除く
${dowLabel(d.date)}獲得 : ${d.mikomiG && d.mikomiD ? `${d.mikomiG}組${d.mikomiD}台` : '-'}

■内訳（接客組/着座組/成約組/成約台数）
アンケート枚数（全体）：${blank(d.ank)}枚
アンケート（内FP）：${d.bFp.map(v => blank(v)).join('/')}
フリーキャッチ：${d.bFc.map(v => blank(v)).join('/')}
什器/POP：${d.bPop.map(v => blank(v)).join('/')}
家電/TA：${d.bTa.map(v => blank(v)).join('/')}
振り（常勤/他）：${d.bFuri.map(v => blank(v)).join('/')}

■au mobile実績
純新規獲得件数：${blank(d.au[0], 0)}件
MNP(UQ⇒au)：${blank(d.au[1], 0)}件
MNP(SB⇒au)：${blank(d.au[2], 0)}件
MNP(DCM⇒au)：${blank(d.au[3], 0)}件
MNP(YM⇒au)：${blank(d.au[4], 0)}件
MNP(楽天⇒au)：${blank(d.au[5], 0)}件
MNP(その他⇒au)：${blank(d.au[6], 0)}件
機種変更獲得件数：${blank(d.au[7], 0)}件

■UQ mobile実績
純新規獲得件数：${blank(d.uq[0], 0)}件
MNP(au⇒UQ)：${blank(d.uq[1], 0)}件
MNP(SB⇒UQ)：${blank(d.uq[2], 0)}件
MNP(DCM⇒UQ)：${blank(d.uq[3], 0)}件
MNP(YM⇒UQ)：${blank(d.uq[4], 0)}件
MNP(楽天⇒UQ)：${blank(d.uq[5], 0)}件
MNP(その他⇒UQ)：${blank(d.uq[6], 0)}件
機種変更件数：${blank(d.uq[7], 0)}件

■FTTH実績
auひかり　：${blank(d.ft[0])}件
BIGLOBE光：${blank(d.ft[1])}件
eo光：${blank(d.ft[2])}件
CATV : ${blank(d.ft[3])}件
WiMAX ：${blank(d.ft[4])}件

■ライフデザイン実績
auでんき　　：${blank(d.ld[0])}件
auPayカード：${blank(d.ld[1])}件

■その他獲得商材
${blankText(d.other)}

■アライアンス協業
❶振り組数/成約組数
KDDI→eo : ${blank(d.al[0][0])}/${blank(d.al[0][1])}
eo→KDDI : ${blank(d.al[1][0])}/${blank(d.al[1][1])}
KDDI→CATV : ${blank(d.al[2][0])}/${blank(d.al[2][1])}
CATV→KDDI : ${blank(d.al[3][0])}/${blank(d.al[3][1])}

❷アライアンス様連携（eo/CATV）取組み工夫
${blankText(d.alEff)}

■他社実績 
(純新規/MNP/番号移行/機変)
※他社取扱がない場合は「ー」を記入ください。
Softbank：${d.ot[0].join('/')}
docomo：${d.ot[1].join('/')}
Ymobile：${d.ot[2].join('/')}
楽天：${d.ot[3].join('/')}

■全体総括（活動内容/集客状況/他社状況）
${blankText(d.txtOv)}

■【達成：達成理由】【未達：改善策】
${blankText(d.txtRs)}

■【添付】着座管理シート貼付

ご確認の程、よろしくお願いいたします。`;
  }

  // 重複チェック（同日・同店舗・同ユーザー）
  async function findDuplicate(date) {
    const matches = Object.entries(reports).filter(([rid, r]) =>
      rid !== editingId &&
      r.date === date &&
      r.store === store &&
      r.userName === user?.name &&
      r.userEmail === user?.email
    );
    return matches.length ? matches[0][0] : null;
  }

  // 保存（現在のタブの日付の日報を1件保存）
  async function doSave(deleteExistingId) {
    const d = days[activeIdx];
    const calc = calcSouhanRiku(d.au, d.uq);
    const payload = {
      date: d.date,
      store,
      channel,
      director,
      userName: user?.name || '',
      userEmail: user?.email || '',
      hiyari: d.hiyari,
      r_ta: targetA,
      r_tb: targetB,
      au: d.au.map(v => +v || 0),
      uq: d.uq.map(v => +v || 0),
      fpA: +d.fpA || 0,
      fpB: +d.fpB || 0,
      auto_souhan: calc.souhan,
      auto_2b: calc.riku,
      ach: +targetA > 0 ? Math.round((calc.souhan / +targetA) * 100) : 0,
      ank: +d.ank || 0,
      b_fp: d.bFp,
      b_fc: d.bFc,
      b_pop: d.bPop,
      b_ta: d.bTa,
      b_furi: d.bFuri,
      ft: d.ft,
      ld: d.ld,
      other: d.other,
      al: d.al,
      al_eff: d.alEff,
      ot: d.ot,
      txt_ov: d.txtOv,
      txt_rs: d.txtRs,
      mikomiG: +d.mikomiG || 0,
      mikomiD: +d.mikomiD || 0,
      updatedAt: Date.now(),
    };
    try {
      if (deleteExistingId) await remove(ref(db, `fp_reports/${deleteExistingId}`));
      if (editingId) {
        await set(ref(db, `fp_reports/${editingId}`), { ...reports[editingId], ...payload });
        showToast('✅ 日報を更新しました');
        navigate('/reports');
      } else {
        payload.createdAt = Date.now();
        await set(push(ref(db, 'fp_reports')), payload);
        showToast(`✅ ${dowLabel(d.date)}の日報を保存しました`);
        localStorage.removeItem(DRAFT_KEY);
        // 他の日がまだあれば次の日に移動、なければ一覧へ
        const remaining = days.filter((_, i) => i !== activeIdx);
        if (remaining.length > 0) {
          setDays(remaining);
          setActiveIdx(Math.min(activeIdx, remaining.length - 1));
          setShowPreview(false);
        } else {
          navigate('/reports');
        }
      }
    } catch (e) {
      showToast('保存エラー: ' + e.message);
    }
  }

  async function handleSaveClick() {
    const d = days[activeIdx];
    if (!store || !d.date) {
      showToast('店舗名と日付は必須です');
      return;
    }
    if (!editingId) {
      const dupId = await findDuplicate(d.date);
      if (dupId) {
        setDupModal({ existingId: dupId });
        return;
      }
    }
    doSave(null);
  }

  const curDow = dowLabel(cur.date);

  return (
    <Layout title={editingId ? '日報編集' : '日報入力'} showBack>
      {/* LINE指示書 */}
      <div className="card">
        <button className="btn btn-outline" onClick={() => setShowLineBox(!showLineBox)}>
          {showLineBox ? '閉じる' : '📋 詳細から自動入力'}
        </button>
        {showLineBox && (
          <div style={{ marginTop: 10 }}>
            <textarea className="inp" rows={5} value={lineText} onChange={e => setLineText(e.target.value)}
              placeholder="LINEで届いた案件指示書をそのまま貼り付け" style={{ fontFamily: 'monospace', fontSize: '.78rem' }} />
            <button className="btn btn-p" style={{ marginTop: 8 }} onClick={handleParseLine}>読み取って自動入力</button>
            {lineParsed && lineParsed.dates.length > 0 && (
              <div style={{ marginTop: 10, fontSize: '.76rem', color: 'var(--sub)' }}>
                {lineParsed.dates.map(dt => {
                  const names = lineParsed.membersByDate[dt] || [];
                  const cl = classifyMembers(names, registeredNames);
                  return (
                    <div key={dt} style={{ marginBottom: 6 }}>
                      <div style={{ fontWeight: 700 }}>{dt}（{dowLabel(dt)}）</div>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 3 }}>
                        {cl.map(m => (
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

      {/* 共通：店舗・販路・ディレクター・目標 */}
      <div className="card">
        <div className="card-title">📌 基本情報（全日共通）</div>
        <div className="form-group">
          <label>店舗名 <span className="req">*</span></label>
          <input className="inp" value={store} onChange={e => setStore(e.target.value)} placeholder="例：○○イオン" />
        </div>
        <div className="form-group">
          <label>販路（店舗名から自動判定／手動変更可）</label>
          <select className="inp" value={channel} onChange={e => { setChannel(e.target.value); setChannelAuto(false); }}>
            <option value="">選択</option>
            {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>ディレクター名</label>
          <input className="inp" value={director} onChange={e => setDirector(e.target.value)} />
        </div>
        <div className="form-group">
          <label>目標（総販 / リク抜き）</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input className="inp" type="text" inputMode="numeric" placeholder="総販" value={targetA} onChange={e => setTargetA(e.target.value)} />
            <span className="ts">/</span>
            <input className="inp" type="text" inputMode="numeric" placeholder="リク抜き" value={targetB} onChange={e => setTargetB(e.target.value)} />
          </div>
        </div>
      </div>

      {/* 日付タブ（全フィールドが切り替わる） */}
      <div className="card">
        <div className="card-title">📅 稼働日</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {days.map((d, i) => (
            <button key={i} onClick={() => setActiveIdx(i)}
              className={`fchip${i === activeIdx ? ' active' : ''}`}
              style={{ padding: '8px 14px' }}>
              {dowLabel(d.date)}
            </button>
          ))}
          {!editingId && (
            <button className="fchip" onClick={addDay} style={{ padding: '8px 14px' }}>＋ 日程を追加</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input className="inp" type="date" value={cur.date} onChange={e => updateDayDate(activeIdx, e.target.value)} />
          {days.length > 1 && (
            <button onClick={() => removeDay(activeIdx)}
              style={{ background: '#fee2e2', border: 'none', borderRadius: 6, padding: '6px 10px', color: '#dc2626', fontWeight: 700, cursor: 'pointer' }}>
              ×
            </button>
          )}
        </div>
      </div>

      {/* 以下、全フィールドが activeIdx（現在のタブ）に連動 */}

      <div className="card">
        <div className="card-title">⚠️ ヒヤリハット報告（{curDow}）</div>
        <input className="inp" value={cur.hiyari} onChange={e => updateCur({ hiyari: e.target.value })} placeholder="特に無し。" />
      </div>

      {/* 目標・残数 */}
      <div className="card">
        <div className="card-title">📊 実績／残数（{curDow}）</div>
        <ResultRow label="総販/リク抜き" a={curCalc.souhan} b={curCalc.riku} color="var(--pd)" />
        <ResultRow label="残数" a={nokoriA} b={nokoriB} color="var(--red)" />
      </div>

      {/* au/UQ実績 */}
      <div className="card">
        <div className="card-title">📱 au / UQ mobile実績（{curDow}）</div>
        {['純新規', 'MNP(UQ⇒au)', 'MNP(SB⇒au)', 'MNP(DCM⇒au)', 'MNP(YM⇒au)', 'MNP(楽天⇒au)', 'MNP(その他⇒au)', '機種変更'].map((lbl, mi) => (
          <FieldRow key={mi} label={lbl} value={cur.au[mi]} onChange={v => updateMobile('au', mi, v)} />
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 10px' }}>
          <div style={{ height: 1, flex: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--sub)', whiteSpace: 'nowrap' }}>UQ mobile</span>
          <div style={{ height: 1, flex: 1, background: 'var(--border)' }} />
        </div>
        {['UQ純新規', 'MNP(au⇒UQ)', 'MNP(SB⇒UQ)', 'MNP(DCM⇒UQ)', 'MNP(YM⇒UQ)', 'MNP(楽天⇒UQ)', 'MNP(その他⇒UQ)', 'UQ機種変更'].map((lbl, mi) => (
          <FieldRow key={mi} label={lbl} value={cur.uq[mi]} onChange={v => updateMobile('uq', mi, v)} />
        ))}
        <ResultRow label="総販/リク抜き" a={curCalc.souhan} b={curCalc.riku} color="var(--pd)" style={{ marginTop: 8 }} />
        <div style={{ height: 8 }} />
        <FieldRow label="FP獲得(総販)" value={cur.fpA} onChange={v => updateCur({ fpA: v })} />
        <FieldRow label="FP獲得(リク抜)" value={cur.fpB} onChange={v => updateCur({ fpB: v })} />
      </div>

      {/* 見込み獲得（その日分） */}
      <div className="card">
        <div className="card-title">🏠 店舗様見込み獲得（{curDow}）</div>
        <FieldRow label="組数" value={cur.mikomiG} onChange={v => updateCur({ mikomiG: v })} unit="組" />
        <FieldRow label="台数" value={cur.mikomiD} onChange={v => updateCur({ mikomiD: v })} unit="台" />
      </div>

      {/* 内訳 */}
      <div className="card">
        <div className="card-title">📋 内訳（{curDow}）</div>
        <FieldRow label="アンケート枚数" value={cur.ank} onChange={v => updateCur({ ank: v })} unit="枚" />
        <BreakdownRow label="アンケート（内FP）" values={cur.bFp} onChange={v => updateCur({ bFp: v })} />
        <BreakdownRow label="フリーキャッチ" values={cur.bFc} onChange={v => updateCur({ bFc: v })} />
        <BreakdownRow label="什器/POP" values={cur.bPop} onChange={v => updateCur({ bPop: v })} />
        <BreakdownRow label="家電/TA" values={cur.bTa} onChange={v => updateCur({ bTa: v })} />
        <BreakdownRow label="振り（常勤/他）" values={cur.bFuri} onChange={v => updateCur({ bFuri: v })} />
      </div>

      {/* FTTH */}
      <div className="card">
        <div className="card-title">🌐 FTTH実績（{curDow}）</div>
        {['auひかり', 'BIGLOBE光', 'eo光', 'CATV', 'WiMAX'].map((lbl, i) => (
          <FieldRow key={i} label={lbl} value={cur.ft[i]}
            onChange={v => updateCur({ ft: cur.ft.map((x, j) => j === i ? v : x) })} />
        ))}
      </div>

      {/* ライフデザイン */}
      <div className="card">
        <div className="card-title">💡 ライフデザイン実績（{curDow}）</div>
        <FieldRow label="auでんき" value={cur.ld[0]} onChange={v => updateCur({ ld: [v, cur.ld[1]] })} />
        <FieldRow label="auPayカード" value={cur.ld[1]} onChange={v => updateCur({ ld: [cur.ld[0], v] })} />
      </div>

      {/* その他 */}
      <div className="card">
        <div className="card-title">🎁 その他獲得商材（{curDow}）</div>
        <input className="inp" value={cur.other} onChange={e => updateCur({ other: e.target.value })} placeholder="（あれば自由記述）" />
      </div>

      {/* アライアンス */}
      <div className="card">
        <div className="card-title">🤝 アライアンス協業（{curDow}）</div>
        {['KDDI→eo', 'eo→KDDI', 'KDDI→CATV', 'CATV→KDDI'].map((lbl, i) => (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: '.73rem', flex: '0 0 90px' }}>{lbl}</span>
            <input className="inp" type="text" inputMode="numeric" value={cur.al[i][0]}
              onChange={e => updateCur({ al: cur.al.map((row, ri) => ri === i ? [e.target.value, row[1]] : row) })} />
            <span className="ts">/</span>
            <input className="inp" type="text" inputMode="numeric" value={cur.al[i][1]}
              onChange={e => updateCur({ al: cur.al.map((row, ri) => ri === i ? [row[0], e.target.value] : row) })} />
          </div>
        ))}
        <div className="form-group">
          <label>アライアンス様連携（eo/CATV）取組み工夫</label>
          <textarea className="inp" rows={2} value={cur.alEff} onChange={e => updateCur({ alEff: e.target.value })} placeholder="（あれば自由記述）" />
        </div>
      </div>

      {/* 他社実績 */}
      <div className="card">
        <div className="card-title">🏢 他社実績（{curDow}）</div>
        {['Softbank', 'docomo', 'Ymobile', '楽天'].map((lbl, i) => (
          <div key={lbl} style={{ marginBottom: 8 }}>
            <div className="ts" style={{ marginBottom: 3 }}>{lbl}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 4 }}>
              {[0, 1, 2, 3].map(j => (
                <input key={j} className="inp-s" type="text" inputMode="numeric" value={cur.ot[i][j]}
                  onChange={e => updateCur({ ot: cur.ot.map((row, ri) => ri === i ? row.map((v, vi) => vi === j ? e.target.value : v) : row) })}
                  style={{ textAlign: 'center' }} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* コメント */}
      <div className="card">
        <div className="card-title">✍️ コメント（{curDow}）</div>
        <div className="form-group">
          <label>■全体総括</label>
          <textarea className="inp" rows={4} value={cur.txtOv} onChange={e => updateCur({ txtOv: e.target.value })} placeholder="（あれば自由記述）" />
        </div>
        <div className="form-group">
          <label>■【達成：達成理由】【未達：改善策】</label>
          <textarea className="inp" rows={4} value={cur.txtRs} onChange={e => updateCur({ txtRs: e.target.value })} placeholder="（あれば自由記述）" />
        </div>
      </div>

      {/* 保存ボタン（現在のタブの曜日名が入る） */}
      <button className="btn btn-p" onClick={() => setShowPreview(true)}>
        📋 {curDow}の日報をプレビュー
      </button>

      {/* プレビューモーダル */}
      {showPreview && (
        <div className="modal-overlay" onClick={() => setShowPreview(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 10 }}>📋 {curDow}の日報プレビュー</h3>
            <div style={{ background: '#f8faff', border: '1px solid var(--border)', borderRadius: 10, padding: 14, fontSize: '.76rem', lineHeight: 1.8, whiteSpace: 'pre-wrap', maxHeight: '50vh', overflowY: 'auto' }}>
              {buildText()}
            </div>
            <button className="btn btn-outline" style={{ marginTop: 12 }}
              onClick={() => { navigator.clipboard.writeText(buildText()); showToast('✅ コピーしました'); }}>
              📋 コピー
            </button>
            <button className="btn btn-green" onClick={handleSaveClick}>
              💾 {curDow}の日報を保存
            </button>
            <button className="btn btn-gray" onClick={() => setShowPreview(false)}>閉じる</button>
          </div>
        </div>
      )}

      {/* 重複確認モーダル */}
      {dupModal && (
        <div className="modal-overlay" onClick={() => setDupModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.6rem', marginBottom: 8 }}>⚠️</div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>すでに日報データが存在します</div>
            <div className="ts" style={{ marginBottom: 14 }}>同じ日付・店舗・ユーザーの日報が見つかりました。</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-gray" onClick={() => setDupModal(null)}>キャンセル</button>
              <button className="btn" style={{ background: '#dc2626', color: '#fff' }}
                onClick={() => { const exId = dupModal.existingId; setDupModal(null); doSave(exId); }}>
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
      <input className="inp" type="text" inputMode="numeric" pattern="[0-9]*"
        value={value} onChange={e => onChange(e.target.value)} placeholder="0" style={{ textAlign: 'right' }} />
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
          <input key={i} className="inp-s" type="text" inputMode="numeric" pattern="[0-9]*"
            value={v} onChange={e => onChange(values.map((vv, vi) => vi === i ? e.target.value : vv))}
            style={{ textAlign: 'center' }} />
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
