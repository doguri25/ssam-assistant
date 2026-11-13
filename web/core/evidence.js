/* 근거가 보이는 평어 (스펙 2026-11-13 §5): 학생마다 근거 목록(번호·종류·글) → AI가 문장마다 기댄 근거 번호(src)를 적어 옴 →
   평어 아래 문장마다 「근거 n」 단추(펼치면 그 근거 줄), 근거가 없는 문장은 주황 「근거 없음」(글자도 함께).
   저장은 평어 옆 ev: { list, sentences }. 복사·전체복사·나이스 붙여넣기에는 평어 글만 들어감(근거는 화면에만).
   단원평가 결과(unit-results.js)는 그대로 부르고, 기존 평가 화면(evaluate.js)은 window.SSAM.evidence로 씀 */

export const EVIDENCE_MAX = 12, LABEL_MAX = 80;
export const EVIDENCE_RULE = '근거 목록에 있는 사실만 쓰고, 문장마다 기대는 근거 번호를 src에 적어요. 근거가 없는 문장은 src를 비워요(지어내지 않음).';
const KINDS = ['unit', 'activity', 'gr', 'ref', 'memo'];
const KIND_NAME = { unit: '단원평가', activity: '활동지', gr: '채점', ref: '참고', memo: '메모' };
const one = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* items: [{ kind, label }] → [{ id: 'e1'(메모는 'm1'), kind, label }] — 학생마다 12개까지, 글은 80자까지, 같은 글은 하나 */
export function evidenceList(items) {
  const out = [], seen = new Set(), n = { e: 0, m: 0 };
  for (const x of Array.isArray(items) ? items : []) {
    if (out.length >= EVIDENCE_MAX) break;
    const label = one(x && x.label).slice(0, LABEL_MAX).trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const kind = KINDS.includes(x.kind) ? x.kind : 'ref', p = kind === 'memo' ? 'm' : 'e';
    out.push({ id: p + ++n[p], kind, label });
  }
  return out;
}

/* 한 학생 몫: 「[근거 목록]\ne1) …」. 여러 학생을 한 요청에 보낼 때는 indent로 학생 줄 아래에 들여 씀 */
export function evidencePrompt(list, indent = '') {
  const l = Array.isArray(list) ? list : [];
  if (!l.length) return `${indent}[근거 목록] 없음`;
  return [`${indent}[근거 목록]`, ...l.map(e => `${indent}${e.id}) ${e.label}`)].join('\n');
}

/* AI 답의 문장들 → [{ t, src: [목록에 있는 id] }] (빈 문장은 빼고, 목록에 없는 id는 빼고, 겹친 id는 하나) */
export function normSentences(v, list) {
  const arr = Array.isArray(v) ? v : (v && Array.isArray(v.sentences) ? v.sentences : []);
  const ids = new Set((Array.isArray(list) ? list : []).map(e => e.id));
  const out = [];
  for (const x of arr) {
    const t = one(typeof x === 'string' ? x : x && x.t);
    if (!t) continue;
    const raw = x && typeof x === 'object' ? x.src : null;
    const got = (Array.isArray(raw) ? raw : raw == null ? [] : String(raw).split(/[\s,，、/]+/)).map(id => String(id == null ? '' : id).trim().toLowerCase().replace(/[)\].]+$/, ''));
    out.push({ t, src: [...new Set(got.filter(id => ids.has(id)))] });
  }
  return out;
}

export const joinSentences = ss => (Array.isArray(ss) ? ss : []).map(s => one(s && s.t)).filter(Boolean).join(' ');

/* 앱이 글을 다듬은 뒤(앞 번호·따옴표 떼기, 끝맺음·마침표 고치기, 길이 맞추기로 끝 문장 자르기)에도 문장과 근거를 함께 둠.
   글(text)에 맞춘 문장들을 돌려줌. 앞이나 끝 한 곳만 바뀐 것까지 맞추고, 그보다 많이 바뀌어 맞출 수 없으면 null(한 문장은 늘 맞춤) */
export function alignSentences(ss, text) {
  const list = (Array.isArray(ss) ? ss : []).filter(s => s && one(s.t)).map(s => ({ ...s, t: one(s.t) }));
  const t = one(text);
  if (!list.length || !t) return [];
  if (joinSentences(list) === t) return ss;
  if (list.length === 1) return [{ ...list[0], t }];
  // 앞에서부터: 그대로인 문장은 두고, 처음 달라진 문장이 끝 문장(끝을 고침)이거나 글 끝에서 잘린 앞부분이면 그 문장만 맞춤
  const out = [];
  let acc = '';
  for (let i = 0; i < list.length; i++) {
    const next = acc ? `${acc} ${list[i].t}` : list[i].t;
    if (t === next) return [...out, list[i]];
    if (t.startsWith(next + ' ')) { out.push(list[i]); acc = next; continue; }
    if (!acc || t.startsWith(acc + ' ')) {
      const rest = t.slice(acc ? acc.length + 1 : 0);
      if (rest && (i === list.length - 1 || list[i].t.startsWith(rest))) return [...out, { ...list[i], t: rest }];
    }
    break;
  }
  // 뒤에서부터: 첫 문장 앞만 바뀜(「1. 」·따옴표를 뗌)
  const tail = joinSentences(list.slice(1));
  if (t.endsWith(' ' + tail)) { const head = t.slice(0, t.length - tail.length - 1); if (head) return [{ ...list[0], t: head }, ...list.slice(1)]; }
  return null;
}

/* 행특 교사 메모 → 근거 목록: 줄·쉼표로 나눈 조각(괄호·낫표 안 쉼표는 나누지 않음). 줄 앞 날짜 「[11. 6.]」는 그 줄 조각마다 그대로.
   memo는 이름 칸을 뺀 글(core/bundle.js memoForAI)을 줌 */
const MASKED = /^(?:(?:이\s?름|성\s?명|학생\s?이름)\s*[:：]?\s*)?[○◯●*]+$/;
export function memoEvidence(memo) {
  const items = [];
  for (const line of String(memo || '').split(/\r?\n/)) {
    const d = /^\s*(\[\d{1,2}\.\s*\d{1,2}\.?\])\s*/.exec(line);
    const head = d ? d[1] + ' ' : '', body = d ? line.slice(d[0].length) : line;
    let depth = 0, cur = '';
    // 가린 이름 칸만 남은 조각(「이름: ○○○」)은 근거가 아님
    const cut = () => { const c = one(cur); if (c && !MASKED.test(c)) items.push({ kind: 'memo', label: head + c }); cur = ''; };
    for (const ch of body) {
      if ('([{「『“'.includes(ch)) depth++;
      else if (')]}」』”'.includes(ch)) depth = Math.max(0, depth - 1);
      if (!depth && /[,，、;；\t]/.test(ch)) { cut(); continue; }
      cur += ch;
    }
    cut();
  }
  return evidenceList(items);
}

/* 펼친 근거(다시 그려도 그대로): 「key:문장 번호」 */
const OPEN = new Set();
let seq = 0;
/* 평어 아래 근거 표시: 문장마다 「근거 n」 단추(누르면 그 근거 줄), src가 빈 문장은 주황 「근거 없음」.
   지금 글(text)이 처음 쓴 문장들과 다르면 위에 「고친 글 · 근거는 처음 쓴 글 기준이에요」. 한 문장이면 문장은 다시 쓰지 않음.
   key: 펼친 것을 기억할 열쇠(평어마다 다르게) */
export function evidenceHTML({ sentences, list, text, key } = {}) {
  const ss = (Array.isArray(sentences) ? sentences : []).filter(s => s && one(s.t));
  if (!ss.length || (text != null && !one(text))) return '';
  const by = new Map((Array.isArray(list) ? list : []).map(e => [e.id, e]));
  const edited = text != null && one(text) !== joinSentences(ss);
  const solo = ss.length === 1;
  const rows = ss.map((s, i) => {
    const src = (s.src || []).map(id => by.get(id)).filter(Boolean);
    const k = key ? `${key}:${i}` : '', open = !!(k && OPEN.has(k));
    const head = solo ? '' : `<span class="evd-n" aria-hidden="true">${i + 1}</span><span class="evd-t">${esc(s.t)}</span>`;
    if (!src.length) return `<li class="evd-s evd-none">${head}<span class="evd-no"><span aria-hidden="true">!</span> 근거 없음</span></li>`;
    const id = `evd-${++seq}`;
    return `<li class="evd-s${open ? ' open' : ''}">${head}<button type="button" class="evd-btn" data-evd-toggle${k ? ` data-evd-key="${esc(k)}"` : ''} aria-expanded="${open}" aria-controls="${id}"><span class="evd-pill">근거 ${src.length}<span class="evd-chev" aria-hidden="true">▾</span></span></button>`
      + `<ul class="evd-src" id="${id}"${open ? '' : ' hidden'}>${src.map(e => `<li><span class="evd-k">${esc(KIND_NAME[e.kind] || '참고')}</span>${esc(e.label)}</li>`).join('')}</ul></li>`;
  }).join('');
  return `<div class="evd" data-evd>${edited ? '<p class="evd-edit"><b>고친 글</b> · 근거는 처음 쓴 글 기준이에요</p>' : ''}<ol class="evd-ss" aria-label="문장별 근거">${rows}</ol></div>`;
}

/* 「근거 n」 단추: 그 근거 줄을 펴고 접음(다시 그리지 않음) */
function onToggle(e) {
  const b = e.target && e.target.closest && e.target.closest('[data-evd-toggle]');
  if (!b) return;
  const open = b.getAttribute('aria-expanded') !== 'true';
  b.setAttribute('aria-expanded', String(open));
  const el = document.getElementById(b.getAttribute('aria-controls'));
  if (el) el.hidden = !open;
  const li = b.closest('.evd-s'); if (li) li.classList.toggle('open', open);
  const k = b.dataset.evdKey;
  if (k) { if (open) OPEN.add(k); else OPEN.delete(k); }
}
if (globalThis.document && !globalThis.__ssamEvidence) { globalThis.__ssamEvidence = 1; document.addEventListener('click', onToggle); }
if (globalThis.window) {
  window.SSAM = window.SSAM || {};
  window.SSAM.evidence = { evidenceList, evidencePrompt, EVIDENCE_RULE, normSentences, joinSentences, alignSentences, memoEvidence, evidenceHTML };
}
