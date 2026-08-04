import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
function formatDateJa(dateStr) {
  if (!dateStr) return '';
  const d = parseDateLocal(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${DOWS[d.getDay()]}）`;
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

function emptyDayData(date = '') {
  return {
    date,
    au: Array(8).fill(''),
    uq: Array(8).fill(''),
    fpA: '', fpB: '',
    hiyari: '特に無し。',
    ank: '',
    bFp: ['', '', '', ''], bFc: ['', '', '', ''],
    bPop: ['', '', '', ''], bTa: ['', '', '', ''], bFuri: ['', '', '', ''],
    ft: ['', '', '', '', ''], ld: ['', ''],
    other: '',
    al: [['', ''], ['', ''], ['', ''], ['', '']],
    alEff: '',
    ot: [['0','0','0','0'],['0','0','0','0'],['0','0','0','0'],['0','0','0','0']],
    txtOv: '', txtRs: '',
    mikomiG: '', mikomiD: '',
  };
}

const DRAFT_KEY = 'fp_draft_v4';

export default function ReportForm() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const copyId = searchParams.get('copyId');
  const mode = searchParams.get('mode'); // 'continue' or null
  const navigate = useNavigate();
  const { user, canEditReport } = useAuth();
  const showToast = useToast();
  const { data: reports } = useFirebaseList('fp_reports');
  const { data: fpUsers } = useFirebaseList('fp_users');

  const [store, setStore] = useState('');
  const [channel, setChannel] = useState('');
  const [channelAuto, setChannelAuto] = useState(true);
  const [director, setDirector] = useState(user?.name || '');
  const [targetA, setTargetA] = useState('');
  const [targetB, setTargetB] = useState('');
  const [days, setDays] = useState([emptyDayData(todayStr())]);
  const [activeIdx, setActiveIdx] = useState(0);

  const [editingId, setEditingId] = useState(id || null);
  const [lineText, setLineText] = useState('');
  const [showLineBox, setShowLineBox] = useState(false);
  const [lineParsed, setLineParsed] = useState(null);
  const [dupModal, setDupModal] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  // スワイプ用
  const swipeRef = useRef(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isHoriz = useRef(false);
  const liveDragX = useRef(0);
  const [dragX, setDragX] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [tabWidth, setTabWidth] = useState(0);
  const tabContainerRef = useRef(null);

  // 編集モード
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
    const d = emptyDayData(r.date || todayStr());
    // au/uqは新形式（フラット配列）と旧形式（au_by_day等）の両方に対応
    d.au = (r.au || (r.au_by_day && r.au_by_day[0]) || Array(8).fill(0)).map(String);
    d.uq = (r.uq || (r.uq_by_day && r.uq_by_day[0]) || Array(8).fill(0)).map(String);
    d.fpA = String(r.fpA ?? r.fp_by_day?.[0]?.a ?? '');
    d.fpB = String(r.fpB ?? r.fp_by_day?.[0]?.b ?? '');
    d.hiyari = r.hiyari || '';
    d.ank = r.ank ?? '';
    d.bFp = r.b_fp || ['','','','']; d.bFc = r.b_fc || ['','','',''];
    d.bPop = r.b_pop || ['','','','']; d.bTa = r.b_ta || ['','','',''];
    d.bFuri = r.b_furi || ['','','',''];
    d.ft = r.ft || ['','','','','']; d.ld = r.ld || ['',''];
    d.other = r.other || '';
    d.al = r.al || [['',''],['',''],['',''],['','']];
    d.alEff = r.al_eff || '';
    d.ot = r.ot || [['0','0','0','0'],['0','0','0','0'],['0','0','0','0'],['0','0','0','0']];
    d.txtOv = r.txt_ov || ''; d.txtRs = r.txt_rs || '';
    d.mikomiG = String(r.mikomiG ?? r.v_mikomi?.[0]?.g ?? '');
    d.mikomiD = String(r.mikomiD ?? r.v_mikomi?.[0]?.d ?? '');
    setDays([d]);
    setActiveIdx(0);
    setEditingId(id);
  }, [id, reports]);

  // copyId/continueモード：前の日報データを引き継ぐ
  useEffect(() => {
    if (id || !copyId || !reports[copyId]) return;
    const r = reports[copyId];
    setStore(r.store || '');
    setChannel(r.channel || '');
    setChannelAuto(false);
    setDirector(r.director || r.userName || '');
    setTargetA(r.r_ta || '');
    setTargetB(r.r_tb || '');
    if (mode === 'continue') {
      const d = emptyDayData(todayStr());
      d.au = (r.au || Array(8).fill(0)).map(String);
      d.uq = (r.uq || Array(8).fill(0)).map(String);
      d.fpA = String(r.fpA ?? ''); d.fpB = String(r.fpB ?? '');
      d.hiyari = r.hiyari || '特に無し。';
      d.ank = String(r.ank ?? '');
      d.bFp = r.b_fp || ['','','','']; d.bFc = r.b_fc || ['','','',''];
      d.bPop = r.b_pop || ['','','','']; d.bTa = r.b_ta || ['','','',''];
      d.bFuri = r.b_furi || ['','','',''];
      d.ft = r.ft || ['','','','','']; d.ld = r.ld || ['',''];
      d.other = r.other || '';
      d.al = r.al || [['',''],['',''],['',''],['','']];
      d.alEff = r.al_eff || '';
      d.ot = r.ot || [['0','0','0','0'],['0','0','0','0'],['0','0','0','0'],['0','0','0','0']];
      d.txtOv = r.txt_ov || ''; d.txtRs = r.txt_rs || '';
      setDays([d]);
      d.mikomiG = String(r.mikomiG ?? '');
      d.mikomiD = String(r.mikomiD ?? '');
      showToast('🔄 前回の日報を引き継ぎました');
    } else if (mode === 'add') {
      // 追加モード：店舗・目標だけ引き継ぎ、数値はリセット
      showToast('➕ 同じ店舗で新規日報を追加します');
    } else {
      // コピーモード：全フィールドを引き継ぎ
      const d = emptyDayData(todayStr());
      d.au = (r.au || Array(8).fill(0)).map(String);
      d.uq = (r.uq || Array(8).fill(0)).map(String);
      d.fpA = String(r.fpA ?? ''); d.fpB = String(r.fpB ?? '');
      d.hiyari = r.hiyari || '特に無し。';
      d.ank = String(r.ank ?? '');
      d.bFp = r.b_fp || ['','','','']; d.bFc = r.b_fc || ['','','',''];
      d.bPop = r.b_pop || ['','','','']; d.bTa = r.b_ta || ['','','',''];
      d.bFuri = r.b_furi || ['','','',''];
      d.ft = r.ft || ['','','','','']; d.ld = r.ld || ['',''];
      d.other = r.other || '';
      d.al = r.al || [['',''],['',''],['',''],['','']];
      d.alEff = r.al_eff || '';
      d.ot = r.ot || [['0','0','0','0'],['0','0','0','0'],['0','0','0','0'],['0','0','0','0']];
      d.txtOv = r.txt_ov || ''; d.txtRs = r.txt_rs || '';
      setDays([d]);
      d.mikomiG = String(r.mikomiG ?? '');
      d.mikomiD = String(r.mikomiD ?? '');
      showToast('📋 日報をコピーしました');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copyId, mode, reports[copyId]]);

  // 下書き自動保存
  useEffect(() => {
    if (editingId) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          ts: Date.now(),
          data: { store, channel, channelAuto, director, targetA, targetB, days, activeIdx },
        }));
      } catch (e) { /* ignore */ }
    }, 600);
    return () => clearTimeout(t);
  }, [store, channel, channelAuto, director, targetA, targetB, days, activeIdx, editingId]);

  // 販路自動判定
  useEffect(() => {
    if (!channelAuto) return;
    const d = detectChannel(store);
    if (d) setChannel(d);
  }, [store, channelAuto]);

  // タブコンテナ幅の計測（スライダーピルの位置計算用）
  useEffect(() => {
    if (tabContainerRef.current) {
      setTabWidth(tabContainerRef.current.offsetWidth);
    }
  }, [days.length]);

  function addDay() {
    const last = days[days.length - 1].date;
    const d = parseDateLocal(last || todayStr());
    d.setDate(d.getDate() + 1);
    const next = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    setDays([...days, emptyDayData(next)]);
    setActiveIdx(days.length);
  }
  function removeDay(idx) {
    if (days.length <= 1) return;
    setDays(days.filter((_,i) => i !== idx));
    setActiveIdx(Math.max(0, idx - 1));
  }
  function updateDayDate(idx, value) {
    setDays(prev => prev.map((d,i) => i === idx ? { ...d, date: value } : d));
  }

  const updateCur = useCallback((patch) => {
    setDays(prev => prev.map((d,i) => i === activeIdx ? { ...d, ...patch } : d));
  }, [activeIdx]);

  const updateMobile = useCallback((type, mi, value) => {
    setDays(prev => prev.map((d,i) => {
      if (i !== activeIdx) return d;
      const arr = [...d[type]]; arr[mi] = value;
      return { ...d, [type]: arr };
    }));
  }, [activeIdx]);

  // スワイプハンドラ
  function switchDay(dir) {
    const W = window.innerWidth || 400;
    setTransitioning(true);
    setDragX(dir > 0 ? -W : W);
    setTimeout(() => {
      setActiveIdx(prev => prev + dir);
      setTransitioning(false);
      setDragX(dir > 0 ? W : -W);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setTransitioning(true);
        setDragX(0);
        setTimeout(() => setTransitioning(false), 240);
      }));
    }, 220);
  }

  function handleTouchStart(e) {
    if (transitioning) return;
    const tgt = e.target;
    if (['INPUT','TEXTAREA','SELECT','BUTTON'].includes(tgt.tagName)) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isHoriz.current = false;
    liveDragX.current = 0;
  }
  function handleTouchMove(e) {
    if (transitioning) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (!isHoriz.current) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) >= Math.abs(dx)) return;
      isHoriz.current = true;
    }
    liveDragX.current = dx;
    setDragX(dx);
  }
  function handleTouchEnd() {
    if (!isHoriz.current) return;
    isHoriz.current = false;
    const dx = liveDragX.current;
    liveDragX.current = 0;
    if (dx < -80 && activeIdx < days.length - 1) {
      switchDay(1);
    } else if (dx > 80 && activeIdx > 0) {
      switchDay(-1);
    } else {
      setTransitioning(true);
      setDragX(0);
      setTimeout(() => setTransitioning(false), 200);
    }
  }

  const cur = days[activeIdx] || emptyDayData();
  const curCalc = useMemo(() => calcSouhanRiku(cur.au, cur.uq), [cur.au, cur.uq]);
  const nokoriA = targetA ? Math.max((+targetA||0) - curCalc.souhan, 0) : '○';
  const nokoriB = targetB ? Math.max((+targetB||0) - curCalc.riku, 0) : '○';
  const curDow = dowLabel(cur.date);

  const registeredNames = useMemo(() => Object.values(fpUsers).map(u => u.name).filter(Boolean), [fpUsers]);

  // 同じ店舗・直近7日以内の保存済み日報（累計計算用）
  const relatedReports = useMemo(() => {
    if (!store || !cur.date) return [];
    const curDateMs = parseDateLocal(cur.date).getTime();
    const curFormDates = new Set(days.map(d => d.date));
    return Object.values(reports).filter(r => {
      if (r.store !== store) return false;
      if (curFormDates.has(r.date)) return false; // 今のフォームの日付は除外
      const diff = Math.abs(curDateMs - parseDateLocal(r.date).getTime()) / (1000 * 60 * 60 * 24);
      return diff <= 6;
    }).sort((a, b) => a.date.localeCompare(b.date));
  }, [store, cur.date, days, reports]);

  // 累計（保存済み関連日報 ＋ 現在のフォーム全タブ）
  const cumulativeCalc = useMemo(() => {
    let totalA = 0, totalB = 0;
    relatedReports.forEach(r => {
      totalA += r.auto_souhan || 0;
      totalB += r.auto_2b || 0;
    });
    days.forEach(d => {
      const c = calcSouhanRiku(d.au, d.uq);
      totalA += c.souhan;
      totalB += c.riku;
    });
    return { totalA, totalB };
  }, [relatedReports, days]);

  function handleParseLine() {
    const parsed = parseLineBrief(lineText);
    setLineParsed(parsed);
    if (parsed.store) { setStore(parsed.store); setChannelAuto(true); }
    if (parsed.target) setTargetA(parsed.target);
    if (parsed.dates.length) {
      const newDays = parsed.dates.map(dt => emptyDayData(dt));
      setDays(newDays); setActiveIdx(newDays.length - 1);
    }
    showToast('✅ 案件指示書を読み取りました');
  }

  function buildText(d = cur) {
    // 全日程を日付順に並べる（保存済み関連日報 ＋ 現フォームの全タブ）
    const curFormDates = new Set(days.map(dd => dd.date));
    const allDayLines = [
      // 保存済み関連日報（現フォームにない日付のみ）
      ...relatedReports
        .filter(r => !curFormDates.has(r.date))
        .map(r => ({
          date: r.date,
          souhan: r.auto_souhan || 0,
          riku: r.auto_2b || 0,
          fpA: r.fpA || 0,
          fpB: r.fpB || 0,
          filled: true,
        })),
      // 現フォームの全タブ
      ...days.map(dd => {
        const c = calcSouhanRiku(dd.au, dd.uq);
        const hasInput = dd.au.some(v => v !== '') || dd.uq.some(v => v !== '');
        return {
          date: dd.date,
          souhan: c.souhan,
          riku: c.riku,
          fpA: dd.fpA,
          fpB: dd.fpB,
          filled: hasInput,
          isCurrent: dd.date === d.date,
        };
      }),
    ].sort((a, b) => a.date.localeCompare(b.date));

    const jissekiLines = allDayLines.map(day => {
      if (day.filled) {
        return `${dowLabel(day.date)} : ${day.souhan}/${day.riku}（内FP獲得${blank(day.fpA)}/${blank(day.fpB)}）`;
      }
      return `${dowLabel(day.date)} : ○/○（内FP獲得○/○）`;
    }).join('\n');

    const totalSouhan = allDayLines.filter(x => x.filled).reduce((s, x) => s + x.souhan, 0);
    const totalRiku   = allDayLines.filter(x => x.filled).reduce((s, x) => s + x.riku, 0);
    const nokoriA2 = targetA ? Math.max((+targetA || 0) - totalSouhan, 0) : '○';
    const nokoriB2 = targetB ? Math.max((+targetB || 0) - totalRiku, 0) : '○';

    return `お疲れ様です。
${director || '●●'}です。
本日の日報を下記に記載いたします。

⚠️ヒヤリハット報告⚠️
${blankText(d.hiyari)}

■実績：2Bダウン除き総販/2Bリク除き
目　標 : ${blank(targetA)}/${blank(targetB)}
${jissekiLines}
残　数：${nokoriA2}/${nokoriB2}

■店舗様見込み獲得
※常勤様の当日獲得は除く
${allDayLines.map(day => {
      const mg = day.isCurrent ? d.mikomiG : (day.mikomiG ?? '');
      const md = day.isCurrent ? d.mikomiD : (day.mikomiD ?? '');
      return `${dowLabel(day.date)}獲得 : ${mg && md ? `${mg}組${md}台` : '○組/○台'}`;
    }).join('\n')}

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

  function buildPayload(d) {
    const calc = calcSouhanRiku(d.au, d.uq);
    return {
      date: d.date, store, channel, director,
      userName: user?.name || '', userEmail: user?.email || '',
      hiyari: d.hiyari, r_ta: targetA, r_tb: targetB,
      au: d.au.map(v => +v || 0), uq: d.uq.map(v => +v || 0),
      fpA: +d.fpA || 0, fpB: +d.fpB || 0,
      auto_souhan: calc.souhan, auto_2b: calc.riku,
      ach: +targetA > 0 ? Math.round((calc.souhan / +targetA) * 100) : 0,
      ank: +d.ank || 0, b_fp: d.bFp, b_fc: d.bFc, b_pop: d.bPop,
      b_ta: d.bTa, b_furi: d.bFuri, ft: d.ft, ld: d.ld,
      other: d.other, al: d.al, al_eff: d.alEff, ot: d.ot,
      txt_ov: d.txtOv, txt_rs: d.txtRs,
      mikomiG: +d.mikomiG || 0, mikomiD: +d.mikomiD || 0,
      updatedAt: Date.now(),
    };
  }

  // 全日程（土日タブ分すべて）を一括保存する
  async function doSaveAll(daysToSave, existingIds = {}) {
    try {
      if (editingId) {
        // 編集モードは常に1件のみ
        const payload = buildPayload(days[0]);
        await set(ref(db, `fp_reports/${editingId}`), { ...reports[editingId], ...payload });
        showToast('✅ 日報を更新しました');
        navigate('/reports');
        return;
      }
      for (const d of daysToSave) {
        const exId = existingIds[d.date];
        if (exId) await remove(ref(db, `fp_reports/${exId}`));
        const payload = buildPayload(d);
        payload.createdAt = Date.now();
        await set(push(ref(db, 'fp_reports')), payload);
      }
      showToast(daysToSave.length > 1 ? '✅ 日報を保存しました（全日程分）' : '✅ 日報を保存しました');
      localStorage.removeItem(DRAFT_KEY);
      navigate('/reports');
    } catch (e) { showToast('保存エラー: ' + e.message); }
  }

  async function handleSaveClick() {
    if (!store) { showToast('店舗名は必須です'); return; }
    // 実績が何も入力されていないタブ（未入力のまま放置されたタブ）は保存対象から除外する
    const filledDays = editingId ? days : days.filter(d => d.au.some(v => v !== '') || d.uq.some(v => v !== ''));
    if (filledDays.length === 0) { showToast('実績が未入力です。数値を入力してから保存してください'); return; }
    for (const d of filledDays) {
      if (!d.date) { showToast('日付は必須です'); return; }
    }
    if (!editingId) {
      const dupMap = {};
      for (const d of filledDays) {
        const exId = await findDuplicate(d.date);
        if (exId) dupMap[d.date] = exId;
      }
      if (Object.keys(dupMap).length > 0) { setDupModal({ existingIds: dupMap, daysToSave: filledDays }); return; }
    }
    doSaveAll(filledDays, {});
  }

  return (
    <Layout title={editingId ? '日報編集' : '日報入力'} showBack>

      {/* ===== 上部：店舗名＋日付（sticky固定） ===== */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'var(--bg)',
        paddingBottom: 4,
      }}>
      <div style={{
        background: '#fff', borderRadius: 'var(--r)', border: '1px solid var(--border)',
        padding: '14px 16px', marginBottom: 6, boxShadow: 'var(--sh-sm)',
      }}>
        <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--sub)', marginBottom: 4 }}>店舗名</div>
        <input
          className="inp"
          value={store}
          onChange={e => { setStore(e.target.value); if (channelAuto) setChannelAuto(true); }}
          placeholder=""
          style={{ fontSize: '1.1rem', fontWeight: 700, border: 'none', borderBottom: '2px solid var(--border)', borderRadius: 0, padding: '4px 0', marginBottom: 8 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* 日付（現在のタブ） */}
          <span style={{ fontSize: '.72rem', color: 'var(--sub)' }}>{formatDateJa(cur.date)}</span>
          {/* 販路バッジ */}
          {channel && (
            <span style={{ fontSize: '.68rem', fontWeight: 700, background: 'var(--pl)', color: 'var(--pd)', padding: '2px 8px', borderRadius: 20 }}>
              {channel}
            </span>
          )}
          {!channel && (
            <select
              className="inp"
              value={channel}
              onChange={e => { setChannel(e.target.value); setChannelAuto(false); }}
              style={{ fontSize: '.72rem', padding: '3px 8px', height: 'auto', width: 'auto' }}
            >
              <option value="">販路を選択</option>
              {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {channel && (
            <button
              onClick={() => setChannelAuto(true)}
              style={{ fontSize: '.68rem', color: 'var(--sub)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              変更
            </button>
          )}
        </div>
      </div>
      </div>{/* sticky wrapper end */}

      {/* ===== スワイプコンテナ（店舗名以下全部） ===== */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: transitioning ? 'transform 0.22s cubic-bezier(0.4,0,0.2,1)' : 'none',
          touchAction: 'pan-y',
          willChange: 'transform',
        }}
      >

      {/* ===== 詳細から自動入力（スクロール追従） ===== */}
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

      {/* ===== 稼働日タブ（スライダー型） ===== */}
      <div style={{ background: '#fff', borderRadius: 'var(--r)', border: '1px solid var(--border)', marginBottom: 12, boxShadow: 'var(--sh-sm)', overflow: 'hidden' }}>

        {/* スライダータブ＋＋ボタン */}
        <div style={{ padding: '8px 8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            ref={tabContainerRef}
            style={{ position: 'relative', background: '#f3f4f6', borderRadius: 24, padding: 4, display: 'flex', flex: 1 }}
          >
            {/* スライドするオレンジピル */}
            <div style={{
              position: 'absolute', top: 4, bottom: 4,
              width: `calc(${100 / days.length}% - ${4 / days.length}px)`,
              left: 4,
              background: 'var(--primary)',
              borderRadius: 20,
              boxShadow: '0 3px 12px rgba(249,115,22,.4)',
              transform: `translateX(${activeIdx * (tabWidth / days.length)}px)`,
              transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
              zIndex: 0,
              pointerEvents: 'none',
            }} />
            {days.map((d, i) => (
              <button
                key={i}
                onClick={() => setActiveIdx(i)}
                style={{
                  flex: 1, border: 'none', background: 'transparent', cursor: 'pointer',
                  padding: '10px 8px', textAlign: 'center', position: 'relative', zIndex: 1,
                }}
              >
                <span style={{
                  display: 'block',
                  fontWeight: i === activeIdx ? 800 : 500,
                  fontSize: i === activeIdx ? '15px' : '12px',
                  color: i === activeIdx ? '#fff' : '#9ca3af',
                  transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                }}>
                  {dowLabel(d.date)}
                </span>
                <span style={{
                  display: 'block',
                  fontSize: i === activeIdx ? '10px' : '9px',
                  color: i === activeIdx ? 'rgba(255,255,255,.75)' : '#d1d5db',
                  marginTop: 2,
                  transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                }}>
                  {d.date ? `${parseDateLocal(d.date).getMonth() + 1}/${parseDateLocal(d.date).getDate()}` : ''}
                </span>
              </button>
            ))}
          </div>
          {/* ＋ボタンをスライダーの外に配置 */}
          {!editingId && (
            <button
              onClick={addDay}
              style={{
                width: 36, height: 36, border: 'none', borderRadius: '50%',
                background: 'var(--pl)', color: 'var(--primary)',
                fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', flex: '0 0 36px',
              }}
            >＋</button>
          )}
        </div>

        {/* 日付入力 */}
        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            className="inp"
            type="date"
            value={cur.date}
            onChange={e => updateDayDate(activeIdx, e.target.value)}
            style={{ flex: 1, padding: '6px 10px', fontSize: '.84rem' }}
          />
          {days.length > 1 && (
            <button
              onClick={() => removeDay(activeIdx)}
              style={{ background: '#fee2e2', border: 'none', borderRadius: 6, padding: '6px 10px', color: '#dc2626', fontWeight: 700, cursor: 'pointer', fontSize: '.8rem' }}
            >
              削除
            </button>
          )}
        </div>
      </div>

      {/* 基本情報（販路・ディレクター・目標） */}
      <div className="card">
        <div className="card-title">📌 基本情報（全日共通）</div>
        {channel && (
          <div className="form-group">
            <label>販路</label>
            <select className="inp" value={channel} onChange={e => { setChannel(e.target.value); setChannelAuto(false); }}>
              {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
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

      {/* ===== 以下、スワイプで切り替わるフィールド ===== */}
      <div>
        <div className="card">
          <div className="card-title">⚠️ ヒヤリハット（{curDow}）</div>
          <input className="inp" value={cur.hiyari} onChange={e => updateCur({ hiyari: e.target.value })} placeholder="特に無し。" />
        </div>

        <div className="card">
          <div className="card-title">📊 実績／残数（{curDow}）</div>
          <ResultRow label="当日実績" a={curCalc.souhan} b={curCalc.riku} color="var(--pd)" />
          {(relatedReports.length > 0 || days.length > 1) && (
            <ResultRow label="累計" a={cumulativeCalc.totalA} b={cumulativeCalc.totalB} color="var(--orange)" />
          )}
          <ResultRow
            label="残数"
            a={targetA ? Math.max((+targetA || 0) - cumulativeCalc.totalA, 0) : '○'}
            b={targetB ? Math.max((+targetB || 0) - cumulativeCalc.totalB, 0) : '○'}
            color="var(--red)"
          />
          {relatedReports.length > 0 && (
            <div style={{ fontSize: '.68rem', color: 'var(--sub)', marginTop: 4 }}>
              ※ {relatedReports.map(r => `${dowLabel(r.date)}(${r.auto_souhan || 0}件)`).join('・')} の実績を含む
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">📱 au / UQ mobile実績（{curDow}）</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ height: 1, flex: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--sub)', whiteSpace: 'nowrap' }}>au mobile</span>
            <div style={{ height: 1, flex: 1, background: 'var(--border)' }} />
          </div>
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

        <div className="card">
          <div className="card-title">🏠 店舗様見込み獲得</div>
          {days.map((d, i) => (
            <div key={i} style={{ marginBottom: i < days.length - 1 ? 12 : 0 }}>
              {days.length > 1 && (
                <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--sub)', marginBottom: 5 }}>
                  {dowLabel(d.date)}
                </div>
              )}
              <FieldRow label="組数" value={d.mikomiG} onChange={v => setDays(prev => prev.map((dd, j) => j === i ? { ...dd, mikomiG: v } : dd))} unit="組" />
              <FieldRow label="台数" value={d.mikomiD} onChange={v => setDays(prev => prev.map((dd, j) => j === i ? { ...dd, mikomiD: v } : dd))} unit="台" />
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-title">📋 内訳（{curDow}）</div>
          <FieldRow label="アンケート枚数" value={cur.ank} onChange={v => updateCur({ ank: v })} unit="枚" />
          <BreakdownRow label="アンケート（内FP）" values={cur.bFp} onChange={v => updateCur({ bFp: v })} />
          <BreakdownRow label="フリーキャッチ" values={cur.bFc} onChange={v => updateCur({ bFc: v })} />
          <BreakdownRow label="什器/POP" values={cur.bPop} onChange={v => updateCur({ bPop: v })} />
          <BreakdownRow label="家電/TA" values={cur.bTa} onChange={v => updateCur({ bTa: v })} />
          <BreakdownRow label="振り（常勤/他）" values={cur.bFuri} onChange={v => updateCur({ bFuri: v })} />
        </div>

        <div className="card">
          <div className="card-title">🌐 FTTH実績（{curDow}）</div>
          {['auひかり', 'BIGLOBE光', 'eo光', 'CATV', 'WiMAX'].map((lbl, i) => (
            <FieldRow key={i} label={lbl} value={cur.ft[i]}
              onChange={v => updateCur({ ft: cur.ft.map((x,j) => j===i ? v : x) })} />
          ))}
        </div>

        <div className="card">
          <div className="card-title">💡 ライフデザイン実績（{curDow}）</div>
          <FieldRow label="auでんき" value={cur.ld[0]} onChange={v => updateCur({ ld: [v, cur.ld[1]] })} />
          <FieldRow label="auPayカード" value={cur.ld[1]} onChange={v => updateCur({ ld: [cur.ld[0], v] })} />
        </div>

        <div className="card">
          <div className="card-title">🎁 その他獲得商材（{curDow}）</div>
          <input className="inp" value={cur.other} onChange={e => updateCur({ other: e.target.value })} placeholder="" />
        </div>

        <div className="card">
          <div className="card-title">🤝 アライアンス協業（{curDow}）</div>
          {['KDDI→eo', 'eo→KDDI', 'KDDI→CATV', 'CATV→KDDI'].map((lbl, i) => (
            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: '.73rem', flex: '0 0 90px' }}>{lbl}</span>
              <input className="inp" type="text" inputMode="numeric" value={cur.al[i][0]}
                onChange={e => updateCur({ al: cur.al.map((row,ri) => ri===i ? [e.target.value, row[1]] : row) })} />
              <span className="ts">/</span>
              <input className="inp" type="text" inputMode="numeric" value={cur.al[i][1]}
                onChange={e => updateCur({ al: cur.al.map((row,ri) => ri===i ? [row[0], e.target.value] : row) })} />
            </div>
          ))}
          <div className="form-group">
            <label>アライアンス様連携（eo/CATV）取組み工夫</label>
            <textarea className="inp" rows={2} value={cur.alEff} onChange={e => updateCur({ alEff: e.target.value })} placeholder="" />
          </div>
        </div>

        <div className="card">
          <div className="card-title">🏢 他社実績（{curDow}）<span style={{ fontSize: '.65rem', fontWeight: 500, color: 'var(--sub)', marginLeft: 6 }}>純新規 / MNP / 番号移行 / 機変</span></div>
          {['Softbank', 'docomo', 'Ymobile', '楽天'].map((lbl, i) => (
            <div key={lbl} style={{ marginBottom: 8 }}>
              <div className="ts" style={{ marginBottom: 3 }}>{lbl}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 4 }}>
                {[0,1,2,3].map(j => (
                  <input key={j} className="inp-s" type="text" inputMode="numeric" value={cur.ot[i][j]}
                    onChange={e => updateCur({ ot: cur.ot.map((row,ri) => ri===i ? row.map((v,vi) => vi===j ? e.target.value : v) : row) })}
                    style={{ textAlign: 'center' }} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-title">✍️ コメント（{curDow}）</div>
          <div className="form-group">
            <label>■全体総括（活動内容/集客状況/他社状況）</label>
            <textarea className="inp" rows={4} value={cur.txtOv} onChange={e => updateCur({ txtOv: e.target.value })} placeholder="" />
          </div>
          <div className="form-group">
            <label>■【達成：達成理由】【未達：改善策】</label>
            <textarea className="inp" rows={4} value={cur.txtRs} onChange={e => updateCur({ txtRs: e.target.value })} placeholder="" />
          </div>
        </div>
      </div>

      </div>{/* swipe container end */}

      <button className="btn btn-p" onClick={() => setShowPreview(true)}>
        📋 {curDow}の日報をプレビュー
      </button>

      {showPreview && (
        <div className="modal-overlay" onClick={() => setShowPreview(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 10 }}>📋 {curDow}の日報プレビュー</h3>
            <div style={{ background: '#f9fafb', border: '1px solid var(--border)', borderRadius: 10, padding: 14, fontSize: '.76rem', lineHeight: 1.8, whiteSpace: 'pre-wrap', maxHeight: '50vh', overflowY: 'auto' }}>
              {buildText()}
            </div>
            <button className="btn btn-outline" style={{ marginTop: 12 }}
              onClick={() => { navigator.clipboard.writeText(buildText()); showToast('✅ コピーしました'); }}>
              📋 コピー
            </button>
            <button className="btn btn-p" onClick={handleSaveClick}>
              💾 保存
            </button>
            <button className="btn btn-gray" onClick={() => setShowPreview(false)}>閉じる</button>
          </div>
        </div>
      )}

      {dupModal && (
        <div className="modal-overlay" onClick={() => setDupModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.6rem', marginBottom: 8 }}>⚠️</div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>すでに日報データが存在します</div>
            <div className="ts" style={{ marginBottom: 14 }}>
              同じ日付・店舗・ユーザーの日報が見つかりました。{Object.keys(dupModal.existingIds).length > 1 ? '（' + Object.keys(dupModal.existingIds).join('・') + '）' : ''}上書きしてよろしいですか？
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-gray" onClick={() => setDupModal(null)}>キャンセル</button>
              <button className="btn" style={{ background: '#dc2626', color: '#fff' }}
                onClick={() => { const { existingIds, daysToSave } = dupModal; setDupModal(null); doSaveAll(daysToSave, existingIds); }}>
                上書きして保存
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
            value={v} onChange={e => onChange(values.map((vv,vi) => vi===i ? e.target.value : vv))}
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
