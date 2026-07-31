import { useState, useRef, useCallback } from 'react';

const YEARS = [2024, 2025, 2026, 2027, 2028];
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function WheelCol({ items, selected, unit, onChange }) {
  const colRef = useRef(null);
  const scrolling = useRef(false);

  function updateStyles(col, si) {
    col.querySelectorAll('.wh-item').forEach((el, i) => {
      const d = Math.abs(i - si);
      el.className = 'wh-item ' + (d === 0 ? 'wh-sel' : d === 1 ? 'wh-near' : 'wh-far');
    });
  }

  function handleScroll() {
    const col = colRef.current;
    if (!col) return;
    const ci = Math.max(0, Math.min(Math.round(col.scrollTop / 40), items.length - 1));
    updateStyles(col, ci);
    onChange(items[ci]);
  }

  function init(el) {
    if (!el) return;
    colRef.current = el;
    el.innerHTML = '';
    items.forEach(v => {
      const div = document.createElement('div');
      div.className = 'wh-item';
      div.textContent = v + unit;
      el.appendChild(div);
    });
    const idx = items.indexOf(selected);
    el.scrollTop = idx * 40;
    updateStyles(el, idx >= 0 ? idx : 0);
  }

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 70,
        background: 'linear-gradient(to bottom, rgba(255,255,255,.97), transparent)',
        pointerEvents: 'none', zIndex: 2,
      }} />
      <div
        ref={init}
        onScroll={handleScroll}
        style={{
          height: 160, overflowY: 'scroll',
          scrollSnapType: 'y mandatory',
          WebkitOverflowScrolling: 'touch',
          padding: '60px 0',
        }}
        className="wh-col"
      />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 70,
        background: 'linear-gradient(to top, rgba(255,255,255,.97), transparent)',
        pointerEvents: 'none', zIndex: 2,
      }} />
    </div>
  );
}

/**
 * MonthPicker - ホイール式の年月絞り込みコンポーネント
 *
 * Props:
 *   value: { year: number|null, month: number|null }
 *   onChange: (value) => void  ← { year, month } | null（すべての場合）
 */
export default function MonthPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [tmpYear, setTmpYear] = useState(value?.year ?? 2026);
  const [tmpMonth, setTmpMonth] = useState(value?.month ?? new Date().getMonth() + 1);

  const displayLabel = value?.year
    ? `${value.year}年　${value.month}月`
    : 'すべて';

  function handleOpen() {
    setTmpYear(value?.year ?? 2026);
    setTmpMonth(value?.month ?? new Date().getMonth() + 1);
    setOpen(v => !v);
  }

  function apply() {
    onChange({ year: tmpYear, month: tmpMonth });
    setOpen(false);
  }

  function showAll() {
    onChange(null);
    setOpen(false);
  }

  return (
    <>
      <style>{`
        .wh-col::-webkit-scrollbar{display:none;}
        .wh-item{height:40px;display:flex;align-items:center;justify-content:center;scroll-snap-align:center;cursor:pointer;transition:all .1s;}
        .wh-sel{font-size:19px;font-weight:800;color:#111827;}
        .wh-near{font-size:15px;font-weight:500;color:#6b7280;}
        .wh-far{font-size:13px;font-weight:400;color:#d1d5db;}
        @keyframes wh-slide{from{opacity:0;transform:translateY(-6px);}to{opacity:1;transform:translateY(0);}}
      `}</style>

      {/* トリガーボタン */}
      <button
        onClick={handleOpen}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '11px 14px', border: `1.5px solid ${open ? 'var(--primary)' : 'var(--border)'}`,
          borderRadius: 10, background: open ? 'var(--pl)' : '#fff',
          cursor: 'pointer', marginBottom: open ? 8 : 0,
          transition: 'all .15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>📅</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '.72rem', color: 'var(--sub)' }}>期間で絞り込み</div>
            <div style={{ fontSize: '.88rem', fontWeight: 700, color: 'var(--text)' }}>{displayLabel}</div>
          </div>
        </div>
        <span style={{
          fontSize: 13, color: 'var(--sub)',
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform .2s',
          display: 'inline-block',
        }}>▾</span>
      </button>

      {/* ホイールパネル */}
      {open && (
        <div style={{
          background: '#fff', borderRadius: 12,
          border: '1.5px solid var(--border)',
          boxShadow: '0 4px 20px rgba(0,0,0,.1)',
          overflow: 'hidden', marginBottom: 10,
          animation: 'wh-slide .18s ease',
        }}>
          <div style={{ display: 'flex', padding: '0 8px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ textAlign: 'center', fontSize: '.66rem', fontWeight: 700, color: 'var(--sub)', padding: '10px 0 4px', letterSpacing: '.06em' }}>年</div>
              <WheelCol items={YEARS} selected={tmpYear} unit="年" onChange={setTmpYear} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ textAlign: 'center', fontSize: '.66rem', fontWeight: 700, color: 'var(--sub)', padding: '10px 0 4px', letterSpacing: '.06em' }}>月</div>
              <WheelCol items={MONTHS} selected={tmpMonth} unit="月" onChange={setTmpMonth} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
            <button
              onClick={showAll}
              style={{ flex: 1, padding: 10, borderRadius: 9, border: '1.5px solid var(--border)', background: '#f9fafb', color: 'var(--sub)', fontSize: '.84rem', cursor: 'pointer' }}
            >
              すべて
            </button>
            <button
              onClick={apply}
              style={{ flex: 2, padding: 10, borderRadius: 9, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: '.84rem', fontWeight: 700, cursor: 'pointer' }}
            >
              この期間で絞り込む
            </button>
          </div>
        </div>
      )}
    </>
  );
}
