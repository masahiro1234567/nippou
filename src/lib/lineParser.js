// LINEで届く「現場の案件指示書」テキストから、店舗名・日程・目標・日ごとの人員リストを抽出する。
// 実績数値（au/UQ獲得件数など）はこの種のメッセージには含まれないため対象外。
// フォーマットが現場・担当者によって揺れる可能性があるため、なるべく緩く拾う設計にしている。

const DOWS = ['日', '月', '火', '水', '木', '金', '土'];

function parseDateLocal(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 「6月27日(土)-6月28日(日)」「6/27(土)-6/28(日)」のような表記から日付配列を作る
function extractDates(text) {
  const yearGuess = new Date().getFullYear();
  const results = [];
  const re = /(\d{1,2})\s*月\s*(\d{1,2})\s*日|(\d{1,2})\/(\d{1,2})/g;
  let m;
  while ((m = re.exec(text))) {
    const mo = m[1] || m[3];
    const da = m[2] || m[4];
    if (mo && da) {
      const mm = String(mo).padStart(2, '0');
      const dd = String(da).padStart(2, '0');
      const dateStr = `${yearGuess}-${mm}-${dd}`;
      if (!results.includes(dateStr)) results.push(dateStr);
    }
  }
  return results;
}

function extractStoreName(text) {
  // 【店舗】xxx を優先、なければ ⭕️xxx の行
  let m = text.match(/【店舗】\s*(\S+)/);
  if (m) return m[1].trim();
  m = text.match(/⭕️\s*(\S+)/);
  if (m) return m[1].trim();
  return '';
}

function extractTarget(text) {
  // ■目標 の次の行、または「総販○○」というパターン
  const m = text.match(/総販\s*(\d+)/);
  if (m) return m[1];
  return '';
}

// 日付見出し（6/27 や 6月27日）の後に続く人名の並びを、日付ごとのメンバーリストとして拾う
function extractMembersByDate(text, dates) {
  const result = {};
  if (!dates.length) return result;

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let currentDateIdx = -1;

  const dateLineRe = /^(\d{1,2})\/(\d{1,2})$|^(\d{1,2})月(\d{1,2})日/;

  lines.forEach((line) => {
    const dm = line.match(dateLineRe);
    if (dm) {
      const mo = dm[1] || dm[3];
      const da = dm[2] || dm[4];
      const mm = String(mo).padStart(2, '0');
      const dd = String(da).padStart(2, '0');
      const idx = dates.findIndex((d) => d.endsWith(`-${mm}-${dd}`));
      if (idx >= 0) {
        currentDateIdx = idx;
        if (!result[dates[idx]]) result[dates[idx]] = [];
      }
      return;
    }
    if (currentDateIdx < 0) return;
    // 見出しや記号で始まる行はメンバー名とみなさない
    if (/^[【■❶❷⭕️※]/.test(line)) {
      currentDateIdx = -1;
      return;
    }
    // 「／」「、」「,」区切りの複数名、または1行1名
    const names = line.split(/[／、,]/).map((n) => n.trim()).filter(Boolean);
    names.forEach((n) => {
      if (n && n.length <= 12 && !result[dates[currentDateIdx]].includes(n)) {
        result[dates[currentDateIdx]].push(n);
      }
    });
  });

  return result;
}

export function parseLineBrief(text) {
  if (!text || !text.trim()) {
    return { store: '', dates: [], target: '', membersByDate: {} };
  }
  const dates = extractDates(text).sort();
  const store = extractStoreName(text);
  const target = extractTarget(text);
  const membersByDate = extractMembersByDate(text, dates);
  return { store, dates, target, membersByDate };
}

// fp_users に登録済みの名前と突き合わせて、自社／他社を判定する
export function classifyMembers(names, registeredNames) {
  const registered = new Set(registeredNames.map((n) => n.trim()));
  return names.map((name) => ({
    name,
    isOwnCompany: registered.has(name.trim()),
  }));
}

export function dowLabel(dateStr) {
  const d = parseDateLocal(dateStr);
  return d ? DOWS[d.getDay()] + '曜日' : '';
}
