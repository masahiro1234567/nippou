import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ref, push, set } from 'firebase/database';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useFirebaseList } from '../lib/useFirebaseList';
import Layout from '../components/Layout';

const DOWS = ['日', '月', '火', '水', '木', '金', '土'];
const CHANNELS = ['イオン', 'エディオン', 'ジョーシン', 'ケーズデンキ', 'ヤマダ', 'コジマ', 'その他'];
const AU_LABELS = ['純新規', 'MNP(UQ⇒au)', 'MNP(SB⇒au)', 'MNP(DCM⇒au)', 'MNP(YM⇒au)', 'MNP(楽天⇒au)', 'MNP(その他⇒au)', '機種変更'];
const UQ_LABELS = ['純新規', 'MNP(au⇒UQ)', 'MNP(SB⇒UQ)', 'MNP(DCM⇒UQ)', 'MNP(YM⇒UQ)', 'MNP(楽天⇒UQ)', 'MNP(その他⇒UQ)', '機種変更'];

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
function emptyDay() {
  return { au: Array(8).fill(0), uq: Array(8).fill(0), jissekiA: '', jissekiB: '', fpA: '', fpB: '', mikomiG: '', mikomiD: '' };
}
function calcSouhanRiku(au, uq) {
  const auTotal = au.reduce((a, b) => a + (+b || 0), 0);
  const uqTotal = uq.reduce((a, b) => a + (+b || 0), 0) - (+uq[1] || 0);
  const souhan = auTotal + uqTotal;
  const riku = souhan - ((+au[1] || 0) + (+au[7] || 0) + (+uq[7] || 0));
  return { souhan, riku };
}

const DRAFT_KEY = 'fp_draft_v2';

export default function ReportForm() {
  const { id } = useParams(); // 編集時の既存レポートID
  const navigate = useNavigate();
  const { user, canEditReport } = useAuth();
  const showToast = useToast();
  const { data: reports } = useFirebaseList('fp_reports');

  const [workDays, setWorkDays] = useState([todayStr()]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [store, setStore] = useState('');
  const [channel, setChannel] = useState('');
  const [director, setDirector] = useState(user?.name || '');
  const [hiyari, setHiyari] = useState('');
  const [targetA, setTargetA] = useState('');
  const [targetB, setTargetB] = useState('');
  const [days, setDays] = useState([emptyDay()]);
  const [txtOv, setTxtOv] = useState('');
  const [txtRs, setTxtRs] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [editingId, setEditingId] = useState(id || null);
  const [restoredOnce, setRestoredOnce] = useState(false);

  // 既存日報を編集モードで開いた場合に復元
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
    setDirector(r.director || r.userName || '');
    setHiyari(r.hiyari || '');
    setTargetA(r.r_ta || '');
    setTargetB(r.r_tb || '');
    setTxtOv(r.txt_ov || '');
    setTxtRs(r.txt_rs || '');
    setDays(
      wd.map((_, i) => ({
        au: (r.au_by_day && r.au_by_day[i]) || Array(8).fill(0),
        uq: (r.uq_by_day && r.uq_by_day[i]) || Array(8).fill(0),
        jissekiA: r.jisseki?.[i]?.a ?? '',
        jissekiB: r.jisseki?.[i]?.b ?? '',
        fpA: r.fp_by_day?.[i]?.a ?? '',
        fpB: r.fp_by_day?.[i]?.b ?? '',
        mikomiG: r.v_mikomi?.[i]?.g ?? '',
        mikomiD: r.v_mikomi?.[i]?.d ?? '',
      }))
    );
    setActiveIdx(wd.length - 1);
    setEditingId(id);
  }, [id, reports]);

  // 新規作成時：下書きの復元提案（1回だけ）
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
        setDirector(d.director || user?.name || '');
        setHiyari(d.hiyari || '');
        setTargetA(d.targetA || '');
        setTargetB(d.targetB || '');
        setDays(d.days && d.days.length ? d.days : [emptyDay()]);
        setTxtOv(d.txtOv || '');
        setTxtRs(d.txtRs || '');
        setActiveIdx(Math.max((d.days?.length || 1) - 1, 0));
        showToast('✅ 前回の入力を復元しました');
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch (e) {
      console.warn('draft restore error', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 下書き自動保存（編集中は保存しない）
  useEffect(() => {
    if (editingId) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ ts: Date.now(), data: { workDays, store, channel, director, hiyari, targetA, targetB, days, txtOv, txtRs } })
        );
      } catch (e) {
        /* ignore */
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [workDays, store, channel, director, hiyari, targetA, targetB, days, txtOv, txtRs, editingId]);

  function addWorkday() {
    const last = workDays[workDays.length - 1];
    const d = parseDateLocal(last || todayStr());
    d.setDate(d.getDate() + 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setWorkDays([...workDays, next]);
    setDays([...days, emptyDay()]); // 既存の日のデータはそのまま残る
    setActiveIdx(workDays.length);
  }
  function removeWorkday(idx) {
    if (workDays.length <= 1) return;
    setWorkDays(workDays.filter((_, i) => i !== idx));
    setDays(days.filter((_, i) => i !== idx));
    setActiveIdx(Math.max(0, idx - 1));
  }
  function updateWorkdayDate(idx, value) {
    const next = [...workDays];
    next[idx] = value;
    setWorkDays(next);
  }

  function updateDay(idx, patch) {
    setDays((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }
  function updateMobile(idx, type, mi, value) {
    setDays((prev) =>
      prev.map((d, i) => {
        if (i !== idx) return d;
        const arr = [...d[type]];
        arr[mi] = value === '' ? '' : +value;
        const nd = { ...d, [type]: arr };
        const au = type === 'au' ? arr : d.au;
        const uq = type === 'uq' ? arr : d.uq;
        const hasMobileData = au.some((v) => +v > 0) || uq.some((v) => +v > 0);
        if (hasMobileData) {
          const { souhan, riku } = calcSouhanRiku(au, uq);
          nd.jissekiA = souhan;
          nd.jissekiB = riku;
        }
        return nd;
      })
    );
  }

  const totals = useMemo(() => {
    const totalA = days.reduce((s, d) => s + (+d.jissekiA || 0), 0);
    const totalB = days.reduce((s, d) => s + (+d.jissekiB || 0), 0);
    const ta = +targetA || 0;
    const tb = +targetB || 0;
    const ach = ta > 0 ? Math.round((totalA / ta) * 100) : 0;
    return { totalA, totalB, nokoriA: Math.max(ta - totalA, 0), nokoriB: Math.max(tb - totalB, 0), ach };
  }, [days, targetA, targetB]);

  function buildText() {
    const dayLabels = workDays.map(dowLabel);
    const jissekiLines = workDays
      .map((dt, i) => `${dayLabels[i]}：${days[i].jissekiA || 0}/${days[i].jissekiB || 0}（内FP獲得${days[i].fpA || 0}/${days[i].fpB || 0}）`)
      .join('\n');
    const mikomiLines = workDays.map((dt, i) => `${dayLabels[i]}獲得 : ${days[i].mikomiG || 0}組${days[i].mikomiD || 0}台`).join('\n');
    const totalG = days.reduce((s, d) => s + (+d.mikomiG || 0), 0);
    const totalD = days.reduce((s, d) => s + (+d.mikomiD || 0), 0);

    return `お疲れ様です。
${director || '●●'}です。
本日の日報を下記に記載いたします。
⚠️ヒヤリハット報告⚠️
${hiyari || '特になし。'}

■実績：2Bダウン除き総販/2Bリク除き
目　標 : ${targetA || '-'}/${targetB || '-'}
${jissekiLines}
残数：${totals.nokoriA}/${totals.nokoriB}

■店舗様見込み獲得（${totalG}組/${totalD}台）
※常勤様の当日獲得は除く
${mikomiLines}

■全体総括（活動内容/集客状況/他社状況）
${txtOv || ''}

■【達成：達成理由】【未達：改善策】
${txtRs || ''}

ご確認の程、よろしくお願いいたします。`;
  }

  async function handleSave() {
    if (!store || !workDays[0]) {
      showToast('店舗名は必須です');
      return;
    }
    const payload = {
      date: workDays[0],
      workDays,
      store,
      channel,
      director,
      userName: user?.name || '',
      hiyari,
      r_ta: targetA,
      r_tb: targetB,
      jisseki: days.map((d) => ({ a: +d.jissekiA || 0, b: +d.jissekiB || 0 })),
      fp_by_day: days.map((d) => ({ a: +d.fpA || 0, b: +d.fpB || 0 })),
      v_mikomi: days.map((d) => ({ g: +d.mikomiG || 0, d: +d.mikomiD || 0 })),
      au_by_day: days.map((d) => d.au),
      uq_by_day: days.map((d) => d.uq),
      auto_souhan: totals.totalA,
      auto_2b: totals.totalB,
      ach: totals.ach,
      txt_ov: txtOv,
      txt_rs: txtRs,
      updatedAt: Date.now(),
    };
    try {
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

  const cur = days[activeIdx] || emptyDay();

  return (
    <Layout title={editingId ? '日報編集' : '日報入力'} showBack>
      {/* 稼働日 */}
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

      {/* 基本情報 */}
      <div className="card">
        <div className="card-title">📌 基本情報</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
          <div className="form-group">
            <label>店舗名 <span className="req">*</span></label>
            <input className="inp" value={store} onChange={(e) => setStore(e.target.value)} placeholder="例：○○イオン" />
          </div>
          <div className="form-group">
            <label>販路 <span className="req">*</span></label>
            <select className="inp" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="">選択</option>
              {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>ディレクター名 <span className="req">*</span></label>
          <input className="inp" value={director} onChange={(e) => setDirector(e.target.value)} />
        </div>
        <div className="form-group">
          <label>⚠️ ヒヤリハット報告</label>
          <textarea className="inp" rows={2} value={hiyari} onChange={(e) => setHiyari(e.target.value)} placeholder="あれば記入（なければ空白でOK）" />
        </div>
        <div className="form-group">
          <label>現在入力中の日</label>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {workDays.map((dt, i) => (
              <button
                key={i}
                onClick={() => setActiveIdx(i)}
                className={`fchip${i === activeIdx ? ' active' : ''}`}
                style={{ padding: '8px 14px' }}
              >
                {dowLabel(dt)}（{i + 1}日目）
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 目標 */}
      <div className="card">
        <div className="card-title">🎯 目標</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input className="inp" type="number" placeholder="総販" value={targetA} onChange={(e) => setTargetA(e.target.value)} />
          <span className="ts">台 /</span>
          <input className="inp" type="number" placeholder="リク抜き" value={targetB} onChange={(e) => setTargetB(e.target.value)} />
          <span className="ts">台</span>
        </div>
      </div>

      {/* au/UQ実績（タブはactiveIdxで管理、各日のデータはstateで個別保持） */}
      <div className="card">
        <div className="card-title">📱 au / UQ mobile実績（{dowLabel(workDays[activeIdx])}）</div>
        <div style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--pd)', background: 'var(--pl)', padding: '5px 10px', borderRadius: 6, marginBottom: 7 }}>📱 au mobile</div>
        {AU_LABELS.map((lbl, mi) => (
          <MobileRow key={mi} label={lbl} value={cur.au[mi]} onChange={(v) => updateMobile(activeIdx, 'au', mi, v)} />
        ))}
        <div style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--pd)', background: 'var(--pl)', padding: '5px 10px', borderRadius: 6, margin: '10px 0 7px' }}>📱 UQ mobile</div>
        {UQ_LABELS.map((lbl, mi) => (
          <MobileRow key={mi} label={lbl} value={cur.uq[mi]} onChange={(v) => updateMobile(activeIdx, 'uq', mi, v)} />
        ))}
      </div>

      {/* 実績（全日表示・タブ切替の影響を受けない） */}
      <div className="card">
        <div className="card-title">📊 実績（2Bダウン除き総販 / 2Bリク除き）</div>
        {workDays.map((dt, i) => (
          <div key={i} style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '.74rem', fontWeight: 800, color: 'var(--pd)', marginBottom: 6 }}>{dowLabel(dt)}</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <span className="ts" style={{ flex: '0 0 90px' }}>総販/リク抜き</span>
              <input className="inp" type="number" value={days[i].jissekiA} onChange={(e) => updateDay(i, { jissekiA: e.target.value })} placeholder="0" />
              <span>/</span>
              <input className="inp" type="number" value={days[i].jissekiB} onChange={(e) => updateDay(i, { jissekiB: e.target.value })} placeholder="0" />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span className="ts" style={{ flex: '0 0 90px' }}>FP獲得数</span>
              <input className="inp" type="number" value={days[i].fpA} onChange={(e) => updateDay(i, { fpA: e.target.value })} placeholder="0" />
              <span>/</span>
              <input className="inp" type="number" value={days[i].fpB} onChange={(e) => updateDay(i, { fpB: e.target.value })} placeholder="0" />
            </div>
          </div>
        ))}
        <div style={{ background: 'var(--pl)', borderRadius: 9, padding: '9px 13px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', fontWeight: 700, color: 'var(--red)' }}>
            <span>残数</span><span>{totals.nokoriA}/{totals.nokoriB}</span>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: 10 }}>
          <div className="ts">達成率</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: totals.ach >= 100 ? 'var(--green)' : totals.ach >= 70 ? 'var(--orange)' : 'var(--red)' }}>
            {targetA ? `${totals.ach}%` : '- %'}
          </div>
        </div>
      </div>

      {/* 見込み獲得 */}
      <div className="card">
        <div className="card-title">🏠 店舗様見込み獲得</div>
        {workDays.map((dt, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <span className="ts" style={{ flex: '0 0 90px' }}>{dowLabel(dt)}獲得</span>
            <input className="inp" type="number" value={days[i].mikomiG} onChange={(e) => updateDay(i, { mikomiG: e.target.value })} placeholder="0" />
            <span>組 /</span>
            <input className="inp" type="number" value={days[i].mikomiD} onChange={(e) => updateDay(i, { mikomiD: e.target.value })} placeholder="0" />
            <span>台</span>
          </div>
        ))}
      </div>

      {/* コメント */}
      <div className="card">
        <div className="card-title">✍️ コメント</div>
        <div className="form-group">
          <label>■全体総括（活動内容/集客状況/他社状況）</label>
          <textarea className="inp" rows={4} value={txtOv} onChange={(e) => setTxtOv(e.target.value)} />
        </div>
        <div className="form-group">
          <label>■【達成：達成理由】【未達：改善策】</label>
          <textarea className="inp" rows={4} value={txtRs} onChange={(e) => setTxtRs(e.target.value)} />
        </div>
      </div>

      <button className="btn btn-p" onClick={() => setShowPreview(true)}>📋 プレビュー</button>

      {showPreview && (
        <div className="modal-overlay" onClick={() => setShowPreview(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 10 }}>📋 日報プレビュー</h3>
            <div style={{ background: '#f8faff', border: '1px solid var(--border)', borderRadius: 10, padding: 14, fontSize: '.78rem', lineHeight: 1.9, whiteSpace: 'pre-wrap', maxHeight: '50vh', overflowY: 'auto' }}>
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
            <button className="btn btn-green" onClick={handleSave}>💾 保存してコピー</button>
            <button className="btn btn-gray" onClick={() => setShowPreview(false)}>閉じる</button>
          </div>
        </div>
      )}
    </Layout>
  );
}

function MobileRow({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <div style={{ fontSize: '.73rem', fontWeight: 600, flex: '0 0 132px' }}>{label}</div>
      <input className="inp" type="number" min="0" value={value === 0 ? '' : value} onChange={(e) => onChange(e.target.value)} placeholder="0" />
      <span className="ts">件</span>
    </div>
  );
}
