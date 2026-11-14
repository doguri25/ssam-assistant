/* 생활기록부 글 쓰기 틀(스펙 2026-11-14-eval-redesign §6) — 화면 없이 돌아감(Node 시험).
   교과 평어·창체·행동특성이 같이 씀: 지금 글 → 문장 줄(문장마다 근거 src, 근거 없음·기재 점검 규칙에 걸린 문장은 고칠 곳),
   근거 쓰임(목록 번호·쓴 문장 번호·아직 안 쓴 근거), 학생 상태(다 씀·초안·고칠 곳), 문장 빼기·바꾸기·더하기(글과 근거를 함께).
   평가지 채점 확인 목록(§4)은 한눈에의 grPending(eval-stage.js)과 같은 규칙으로 학생을 고름.
   근거·문장 맞추기는 core/evidence.js, 고칠 곳은 기재 점검 규칙(check/check-rules.js)을 그대로 씀 */
import { alignSentences, joinSentences, evidenceList } from '../../../core/evidence.js';
import { checkText, splitSentences, sentenceKey, findDuplicates, overLimit } from '../check/check-rules.js';

const one = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const MIN_KEY = 8; // 기재 점검의 같은 문장과 같게: 이보다 짧은 조각은 같은 문장으로 세지 않음

export const STATE_LABEL = { run: '쓰는 중', wait: '기다리는 중', err: '오류', done: '다 씀', draft: '초안', none: '아직' };
const ISSUE_NOTE = { none: '근거 없음', name: '이름 들어감', ban: '쓰면 안 되는 말', neg: '부정 표현', dup: '같은 문장', len: '글자 수 넘음', stale: '활동이 바뀜', sheet: '학습지 반영 전' };

/* 글 → { rows: [{ t, start, end, src(배열 | null: 근거를 모름), issues: [{ kind, why, word }], none, bad }], known, edited, over, bad }
   - ev({ list, sentences })의 문장이 지금 글과 맞으면(alignSentences) 문장마다 근거(known). 맞지 않거나 근거가 없는 옛 글은 문장으로 나누고 근거를 모름.
   - edited: 처음 쓴 문장과 지금 글이 다름(「고친 글 · 근거는 처음 쓴 글 기준이에요」).
   - 고칠 곳: 근거 없는 문장(none) · 기재 점검 규칙(쓰면 안 되는 말·부정 표현·이름) · 다른 학생과 같은 문장(dups: sentenceKey 모음) · extra[i](화면이 덧붙이는 까닭).
     글자 수(limit 넘침)는 문장이 아니라 글 전체(over). bad: 고칠 문장 수 + 글자 수 넘침 */
export function sentenceRows(text, ev, { limit = null, dups = null, extra = null } = {}) {
  const t = one(text);
  if (!t) return { rows: [], known: false, edited: false, over: null, bad: 0 };
  const ss = ev && Array.isArray(ev.sentences) ? ev.sentences.filter(s => s && one(s.t)) : [];
  const edited = !!ss.length && one(joinSentences(ss)) !== t;
  const al = ss.length ? alignSentences(ss, t) : null;
  const known = !!(al && al.length);
  let rows = known ? al.map(s => ({ t: one(s.t), src: Array.isArray(s.src) ? s.src.slice() : [] })) : splitSentences(t).map(s => ({ t: s.t, src: null }));
  let at = 0;
  rows = rows.map(r => { const i = t.indexOf(r.t, at), start = i < 0 ? at : i, end = Math.min(t.length, start + r.t.length); at = end; return { ...r, start, end }; });
  const found = checkText(t, { limit }).filter(x => x.kind !== 'len');
  rows.forEach((r, i) => {
    r.issues = found.filter(x => x.start < r.end && r.start < x.end).map(({ kind, why, word }) => ({ kind, why, word }));
    const key = sentenceKey(r.t);
    if (dups && key.length >= MIN_KEY && dups.has(key)) r.issues.push({ kind: 'dup', why: '다른 학생 글과 같은 문장이에요', word: r.t });
    for (const x of (extra && extra[i]) || []) r.issues.push({ kind: x.kind, why: x.why, word: x.word || r.t });
    r.none = known && !r.src.length;
    r.bad = r.none || r.issues.length > 0;
  });
  const over = limit ? overLimit(t, limit) : null;
  return { rows, known, edited, over, bad: rows.filter(r => r.bad).length + (over ? 1 : 0) };
}

/* 같은 묶음 안에서 2명 이상이 쓴 문장 → sentenceKey 모음. items: [{ who, text }] */
export function dupKeys(items) {
  const arr = (Array.isArray(items) ? items : []).filter(x => x && one(x.text)).map((x, i) => ({ id: i, who: x.who, text: x.text }));
  return new Set(findDuplicates(arr).map(g => g.key));
}

/* 근거 목록 → [{ ...근거, n: 목록 번호(1부터), use: [그 근거를 쓴 문장 번호] }] (use가 빈 것이 아직 안 쓴 근거) */
export function evidenceUse(list, rows) {
  const rs = Array.isArray(rows) ? rows : [];
  return (Array.isArray(list) ? list : []).map((e, i) => ({ ...e, n: i + 1, use: rs.map((r, j) => (Array.isArray(r.src) && r.src.includes(e.id) ? j + 1 : 0)).filter(Boolean) }));
}

/* 학생 상태 → { k, label, n(고칠 곳 수) }. rows: sentenceRows 결과. none: 글이 없을 때 쓸 말(행특 「메모 없음」 등) */
export function recState({ text, done, run, wait, err, rows, none } = {}) {
  if (run) return { k: 'run', label: STATE_LABEL.run, n: 0 };
  if (wait) return { k: 'wait', label: STATE_LABEL.wait, n: 0 };
  if (err) return { k: 'err', label: STATE_LABEL.err, n: 0 };
  if (!one(text)) return { k: 'none', label: none || STATE_LABEL.none, n: 0 };
  const n = (rows && rows.bad) || 0;
  if (n) {
    let label = `고칠 곳 ${n}`;
    if (n === 1) {
      const r = rows.rows.find(x => x.bad);
      const kind = r ? (r.issues[0] ? r.issues[0].kind : 'none') : 'len';
      label = ISSUE_NOTE[kind] || label;
    }
    return { k: 'fix', label, n };
  }
  return done ? { k: 'done', label: STATE_LABEL.done, n: 0 } : { k: 'draft', label: STATE_LABEL.draft, n: 0 };
}

/* ---------- 문장 빼기·바꾸기·더하기 → { t, ev } ----------
   근거가 맞는 글이면 근거 문장도 함께 바꿈(목록은 그대로). 근거를 모르는 글(옛 글·고친 글)은 글만 바꾸고 ev는 그대로 */
function rebuild(text, ev, edit) {
  const r = sentenceRows(text, ev);
  const rows = edit(r.rows.map(x => ({ t: x.t, src: x.src })));
  const t = joinSentences(rows);
  if (!r.known || !ev) return { t, ev: ev || null };
  return { t, ev: { ...ev, sentences: rows.map(x => ({ t: one(x.t), src: Array.isArray(x.src) ? x.src : [] })) } };
}
export const removeSentence = (text, ev, i) => rebuild(text, ev, rows => rows.filter((_, j) => j !== i));
export const replaceSentence = (text, ev, i, next) => rebuild(text, ev, rows => [...rows.slice(0, i), ...(Array.isArray(next) ? next : [next]).filter(x => x && one(x.t)), ...rows.slice(i + 1)]);
export const appendSentence = (text, ev, s) => rebuild(text, ev, rows => [...rows, s].filter(x => x && one(x.t)));

/* ---------- 평가지 채점 확인(§4) ----------
   학생: 한눈에 「선생님 차례」와 같은 규칙(eval-stage.js grPending) — 알아보기 어려움(직접 정하지 않음) · 점수 두 의견(아직 안 고름) · 평어 검토(trv, 검토를 마치지 않음).
   학생마다 볼 것: read(읽기 어려움 → 수준 정하기) · score(검토 AI 점수) · text(검토 AI가 고친 평어, 아직 안 고름) */
export const grNeeds = s => !!(s && !s.skip && ((s.unreadable && !s.manual) || (s.rv && !s.rv.done) || (s.trv && !s.trv.done)));
export function grReviewItems(students) {
  const out = [];
  const list = (Array.isArray(students) ? students : []).filter(grNeeds).sort((a, b) => (a.no || 0) - (b.no || 0));
  for (const s of list) {
    if (s.unreadable && !s.manual) out.push({ id: s.id, no: s.no, kind: 'read' });
    if (s.rv && !s.rv.done) out.push({ id: s.id, no: s.no, kind: 'score' });
    if (s.trv && !Array.isArray(s.trv) && !s.trv.done) out.push({ id: s.id, no: s.no, kind: 'text' });
  }
  return out;
}

/* ---------- 창체 근거(새로 더함, AI 없이) ----------
   활동마다 학생 한 문장(parts[활동])이라, 그 문장의 근거 = 그 활동(이름 — 내용) + 그 학생 학습지에서 읽은 내용(obs).
   sig(활동): 지금 활동 내용 열쇠(바뀌었으면 「활동 내용이 바뀌었어요」), sheetNew(활동 id): 넣은 학습지를 아직 글에 넣지 않음.
   → { list, sentences, extra(문장마다 까닭), text(동아리 이름을 뺀 글) } */
export function ccEvidence(acts, item, { sig = null, sheetNew = null } = {}) {
  const A = (Array.isArray(acts) ? acts : []).filter(a => a && (one(a.name) || one(a.desc)));
  const items = [], wants = [];
  for (const a of A) {
    const name = one(a.name), desc = one(a.desc);
    const lab = name && desc ? `${name} — ${desc}` : name || desc;
    const o = item && item.obs && item.obs[a.id];
    const mine = [{ kind: 'act', label: lab }];
    if (o && one(o.n)) mine.push({ kind: 'sheet', label: one(o.n) });
    items.push(...mine); wants.push(mine.map(x => x.label));
  }
  const list = evidenceList(items, 24);
  const idOf = lab => { const e = list.find(x => x.label === one(lab).slice(0, 300).trim()); return e ? e.id : null; };
  const sentences = [], extra = [];
  A.forEach((a, i) => {
    const p = item && item.parts && item.parts[a.id];
    if (!p || !one(p.t)) return;
    sentences.push({ t: one(p.t), src: [...new Set(wants[i].map(idOf).filter(Boolean))] });
    const why = [];
    if (sig && p.sig !== sig(a)) why.push({ kind: 'stale', why: '활동 내용이 바뀌었어요. 다시 쓰면 새 활동으로 고쳐요' });
    if (sheetNew && sheetNew(a.id)) why.push({ kind: 'sheet', why: '넣은 학습지를 아직 글에 넣지 않았어요' });
    extra.push(why);
  });
  return { list, sentences, extra, text: joinSentences(sentences) };
}

/* ---------- 교과 평어 모으기 ----------
   unit: 단원평가 교과 평어(unit:pyeongeo:<교과> — students[no]{ level, text, manual, ev }), grs: 그 교과 평가지 채점 기록 [{ id, title, students }].
   → Map(번호 → [{ src: 'unit'|'gr', key, title, text, ev, level, gid, sid }]) 번호 차례. 채점 기록은 글이 있는 학생만(뺀 학생은 빼고) */
export function pySources(unit, grs) {
  const m = new Map();
  const put = (no, x) => { if (!(no > 0)) return; if (!m.has(no)) m.set(no, []); m.get(no).push(x); };
  for (const [k, v] of Object.entries((unit && unit.students) || {})) {
    if (!v || typeof v !== 'object') continue;
    put(Number(k), { src: 'unit', key: 'unit', title: '', text: String(v.text || ''), ev: v.ev || null, level: v.level || '' });
  }
  for (const g of Array.isArray(grs) ? grs : []) {
    for (const s of (g && g.students) || []) {
      if (!s || s.skip || !one(s.text)) continue;
      put(Number(s.no), { src: 'gr', key: `gr:${g.id}:${s.id}`, title: String(g.title || ''), text: String(s.text), ev: s.ev || null, level: s.level || '', gid: g.id, sid: s.id });
    }
  }
  return new Map([...m.entries()].sort((a, b) => a[0] - b[0]));
}
