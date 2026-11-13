/* 문서·소통 › 가정통신문 (스펙 2026-11-03 가정통신문): 학교 양식 + 상위기관 공문·계획 + 넣을 내용 → AI 한 번 →
   학교 양식에 맞춘 가정통신문(.hwpx 양식은 모양 그대로, .hwp·기본 양식은 글 짜임만), 알림 앱용 짧은 글, 발송 기안.
   양식은 IndexedDB(form-store.js), 글은 학년도 자료(letter-model.js). 원본 공문 파일은 저장하지 않음(글만).
   번역본(스펙 2026-11-06 K, letter-translate.js): 다문화 가정용 원문과 나란히 문서, 언어마다 저장. 다른 메뉴는 openLetterTranslate(lang)로 엶 */
import { onEnter, go } from '../../core/shell.js';
import { introHTML, aiNoteHTML } from '../../core/ui-parts.js';
import { parseTableLines } from '../../core/body-table.js';
import * as ai from '../../core/ai.js';
import { toast, copyText, saveFile } from '../../core/ui.js';
import { readText, fileMessage } from '../../core/files.js';
import { aiRowHTML } from '../../core/ai-roles.js';
import { exportButton, exportDoc } from '../../core/doc-export.js';
import { getSchool } from '../../core/settings.js';
import { schoolYearOf } from '../../core/calendar.js';
import { canQueue, openQueue } from '../../core/queue-paste.js';
import { keepFiles } from '../../core/keep-files.js';
import { readForm, findRoles, fillForm, rolesValid, isSign } from '../../core/hwpx-form.js';
import { forms, newFormId, MAX_FORM } from '../../core/form-store.js';
import { cleanSheet } from '../evaluate/activity/activity-read.js';
import { letterQueueItems } from '../plan/report-ai.js';
import { plainFromText, defaultPlain, plainLetterDoc, letterPrompt, normLetter, composeBody, composeSend, formSample, cleanSample } from './letter-ai.js';
import { rosterAllowed } from '../../core/student-no.js';
import { replyOptions, replyPrompt, normReply, flagRows, tally, missingNos, collectTSV, collectDoc, fitAnswers } from './reply-collect.js';
import { getCurrent, saveCurrent, clearCurrent, listLetters, pushLetter, newLetterId, getFormId, setFormId } from './letter-model.js';
import { LANGS, LANG_IDS, langInfo, langOf, planTr, pruneUnits, mergeTr, batches, trPrompt, normAnswers, trPairs, missingCount, bilingualLetter } from './letter-translate.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
const baseName = n => String(n || '').replace(/\.[^.]+$/, '').trim() || '양식';
const ROLE_NAMES = [['title', '제목'], ['bodyStart', '본문 시작'], ['bodyEnd', '본문 끝'], ['date', '날짜'], ['reply', '회신서 시작']];
/* 화면에만: list(양식 목록), form(고른 양식 { rec, parsed }), busy, adding, mapOpen, mapSel, trLang(번역본 언어), trBusy(번역 중인 언어),
   trEdits(번역하는 동안 선생님이 친 번역 칸 { x, lang, keys }) */
export const F = { list: [], form: null, busy: false, adding: 0, mapOpen: false, mapSel: -1, store: null, trLang: '', trBusy: '', trEdits: null };
const formsSig = () => JSON.stringify([F.list.map(f => [f.id, f.name, f.kind]), F.form ? [F.form.rec.id, F.form.rec.kind, !!F.form.parsed, !!F.form.temp] : null]);
let box = null, cur = null;
const blank = () => ({ id: newLetterId(), sources: [], memo: '', related: [], target: '', out: null, send: { title: '', body: '' }, sendEdited: false, collect: { mask: [], rows: [] }, tr: {} });
const SS = () => window.SSAM || {};
/* 회신서 스캔(화면에만): pages, busy, tok(읽는 중 다른 가정통신문·새 스캔이면 버림) */
const RC = { pages: [], busy: false, tok: 0, adding: false, batch: '', checked: '' }; // batch: 이번 스캔 묶음 id, checked: 가린 모습을 모든 장에서 본 묶음
/* 예전 판이 「참가 /」처럼 저장한 회신서 표 답은 지금 선택지(「참가」)로 맞춰 엶 */
const fitOld = x => { if (x && x.out && x.out.replyOn) fitAnswers(x.collect.rows, replyOptions(x.out.reply.fields)); return x; };
const c = () => (cur || (cur = fitOld(getCurrent()) || blank()));
function save(x = c(), { push = false } = {}) { if (x === c()) saveCurrent(x); if (push && x.out) pushLetter(x); }
function resend(force = false, x = c()) {
  if (!x.out || (x.sendEdited && !force)) return;
  x.send = composeSend({ title: x.out.title, related: x.related, target: x.target, date: x.out.date }); x.sendEdited = false;
}

/* ---------- 양식 ---------- */
const QUOTA = '양식을 저장하지 못했어요(저장 공간이 꽉 찼을 수 있어요).';
async function loadForms() {
  F.store = await forms();
  // 저장소를 잠깐 읽지 못하면(또는 IndexedDB를 못 열어 메모리로 쓰는 중이면) 고른 양식은 그대로 둠 — 진짜로 읽은 목록에 없을 때만 지움
  let read = F.store.persistent !== false;
  try { F.list = await F.store.list(); } catch (e) { read = false; }
  // 이번에만 쓰는 양식(저장하지 못한 것)을 고른 채면 그대로 둠
  if (F.form && F.form.temp) return;
  const id = getFormId();
  if (id && (!F.form || F.form.rec.id !== id) && (read || F.list.some(x => x.id === id))) await selectForm(id, { quiet: true });
}
let selTok = 0;
async function selectForm(id, { quiet = false } = {}) {
  const tok = ++selTok; // 양식을 빨리 바꿔 고르면 마지막 것만
  setFormId(id);
  F.form = null; F.mapOpen = false; F.mapSel = -1;
  if (!id) { live(); return; }
  let rec = null, failed = F.store.persistent === false;
  try { rec = await F.store.get(id); } catch (e) { rec = null; failed = true; }
  if (tok !== selTok) return;
  // 읽지 못한 것(저장소 탈)은 고른 것을 남겨 두고 다음에 다시 읽음, 정말 없는 양식만 기본 양식으로
  if (!rec && failed) { if (!quiet) toast('양식을 읽지 못했어요. 잠시 뒤 다시 골라 주세요.', 5000); live(); return; }
  if (!rec) { setFormId(''); if (!quiet) toast('양식을 찾지 못했어요. 기본 양식으로 써요.'); live(); return; }
  let parsed = null;
  if (rec.kind === 'hwpx') { try { parsed = await readForm(rec.bytes); } catch (e) { toast('양식 파일을 읽지 못했어요. 다시 넣어 주세요.', 5000); } }
  if (tok !== selTok) return;
  F.form = { rec, parsed };
  live(); // 탭을 연 바로 그때 읽기도 함 — 그사이 치던 칸은 그대로
}
/* 저장하지 못한(크거나 저장소가 꽉 찬) 양식은 이번에만 */
async function useTemp(rec, msg) {
  ++selTok;
  F.form = { rec, parsed: rec.kind === 'hwpx' ? await readForm(rec.bytes) : null, temp: true };
  F.mapOpen = false; F.mapSel = -1;
  toast(msg, 7000);
}
const rolesOk = r => rolesValid(r);
/* 양식 넣기: .hwpx는 모양 그대로 채울 양식, .hwp는 글 짜임만 */
async function addForm(file) {
  F.adding++; render();
  try {
    if (!F.store) F.store = await forms(); // 탭을 연 바로 그때 넣어도
    const u8 = new Uint8Array(await file.arrayBuffer());
    const isZip = u8[0] === 0x50 && u8[1] === 0x4B;
    let rec;
    if (/\.hwpx$/i.test(file.name) || isZip) {
      const parsed = await readForm(u8);
      rec = { id: newFormId(), name: baseName(file.name), kind: 'hwpx', bytes: u8, roles: findRoles(parsed.lines), savedAt: Date.now() };
    } else {
      rec = { id: newFormId(), name: baseName(file.name), kind: 'plain', plain: plainFromText(await readText(file)), savedAt: Date.now() };
    }
    if (rec.bytes && rec.bytes.length > MAX_FORM) { await useTemp(rec, '양식 파일이 5MB보다 커서 저장하지 않고 이번에만 써요.'); F.adding--; render(); return; }
    try { await F.store.put(rec); F.list = await F.store.list(); }
    catch (e) { await useTemp(rec, `${QUOTA} 이번에만 써요.`); F.adding--; render(); return; }
    F.adding--;
    await selectForm(rec.id, { quiet: true });
    if (rec.kind === 'plain') toast('.hwp 양식은 글 짜임만 따라 만들어요(로고·표 모양은 빠져요). 한글에서 .hwpx로 저장해 넣으면 모양까지 살아요.', 8000);
    else if (!rolesOk(rec.roles)) { F.mapOpen = true; render(); toast('제목·본문·날짜 자리를 다 찾지 못했어요. 줄을 눌러 정해 주세요.', 6000); }
    else toast(`「${rec.name}」 양식을 저장했어요. 자리가 맞는지 [양식 맞추기]에서 볼 수 있어요.`, 5000);
    if (!F.store.persistent) toast('이 브라우저는 양식을 저장할 수 없어 이번에만 써요.', 6000);
  } catch (e) {
    F.adding = Math.max(0, F.adding - 1); render();
    toast(e && e.code ? fileMessage(e.code) : '양식 파일을 읽지 못했어요. 한글(.hwpx·.hwp) 파일을 넣어 주세요.', 6000);
  }
}
/* 양식 맞추기: 줄마다 자리 */
function roleOf(r, i) {
  if (!r) return '';
  if (i === r.date) return '날짜';
  if (i === r.sign) return '학교장';
  if (i === r.title) return '제목';
  if (r.bodyStart >= 0 && i >= r.bodyStart && i <= r.bodyEnd) return '본문';
  if (r.reply >= 0 && i >= r.reply) return '회신서';
  if (r.title >= 0 && i < r.title) return '머리';
  return '';
}
function mapHTML() {
  const f = F.form;
  if (!F.mapOpen || !f || !f.parsed) return '';
  const r = f.rec.roles, lines = f.parsed.lines.slice(0, 200);
  return `<div class="lf-map" id="lfMap"><div class="row"><b class="grow">양식 맞추기${rolesOk(r) ? '' : ' <span class="muted warn">· 제목 → 본문 → 날짜 → 학교장 → 회신서 차례로 정해 주세요</span>'}</b><button class="btn primary" type="button" data-lf="mapSave">저장</button><button class="btn text" type="button" data-lf="mapClose">닫기</button></div>
    <p class="muted" style="margin:0">줄을 누르고 자리를 고르세요. 머리·학교장 줄은 그대로 두고, 제목·본문·날짜만 바꿔 넣어요. 양식에 {제목}·{본문}·{날짜}를 적어 두어도 돼요.</p>
    <ol class="lf-lines">${lines.map((l, i) => { const ro = roleOf(r, i); return `<li class="lf-r-${{ 제목: 'title', 본문: 'body', 날짜: 'date', 학교장: 'sign', 회신서: 'reply', 머리: 'head' }[ro] || 'none'}${F.mapSel === i ? ' sel' : ''}">
      <button type="button" data-lf-line="${i}"><span class="lf-badge">${ro || '·'}</span><span class="lf-text">${esc(l.text.trim() ? l.text : l.obj ? '(그림·개체)' : '(빈 줄)')}</span></button>
      ${F.mapSel === i ? `<span class="row lf-pick">${ROLE_NAMES.map(([k, n]) => `<button class="btn tiny" type="button" data-lf-role="${k}">${n}</button>`).join('')}<button class="btn text tiny" type="button" data-lf-role="noreply">회신서 없음</button><button class="btn text tiny" type="button" data-lf-role="nodate">날짜 없음</button></span>` : ''}</li>`; }).join('')}</ol></div>`;
}

/* ---------- 넣기 ---------- */
async function addSources(files) {
  const x = c(), fails = [];
  let cut = 0;
  for (const f of files) {
    try { const cl = cleanSheet(await readText(f)); cut += cl.cut || 0; x.sources.push({ name: f.name, text: cl.text }); }
    catch (e) { fails.push(`${f.name}(${fileMessage(e && e.code)})`); }
  }
  save(); render();
  if (fails.length) toast(`읽지 못한 파일: ${fails.join(', ')}`, 7000);
  else if (cut) toast(`명단·전화번호가 적힌 줄 ${cut}곳은 빼고 넣었어요(AI로 보내지 않아요)`, 5000);
}
/* 문체 참고: 양식의 옛 제목·본문(머리·학교장·회신서는 빼고) */
function sampleOf() {
  const f = F.form;
  if (!f) return '';
  if (f.rec.kind === 'plain') return cleanSample(f.rec.plain.sample || '');
  return f.parsed ? formSample(f.parsed.lines, f.rec.roles) : '';
}
/* [가정통신문 쓰기]: 바로 상태를 돌려주고(쌤 채팅이 맞는 말을 하게) 쓰기는 이어서 → 'started' | 'busy'(쓰는 중) | 'empty'(넣을 것 없음) | 'no-ai' */
export function write() {
  if (F.busy) return 'busy';
  const x = c();
  if (!cleanSheet(x.memo).text.trim() && !x.sources.some(s => s.text.trim())) { toast('넣을 내용을 적거나 공문·계획 파일을 넣어 주세요.', 5000); return 'empty'; }
  if (!ai.ready()) { toast('설정 › AI에서 키를 넣어 주세요', 5000); return 'no-ai'; }
  F.busy = true; render();
  writeJob(x);
  return 'started';
}
async function writeJob(x) {
  try {
    // 학년도: 오늘이 든 학년도(1·2월은 앞 해, 쪽지·공문 처리와 같게). 설정의 계획 학년도는 1월부터 다음 해라 쓰지 않음
    const year = schoolYearOf(today());
    const v = await ai.generateJSON(letterPrompt({ sources: x.sources, memo: cleanSheet(x.memo).text, sample: sampleOf(), today: today(), year }),
      { task: 'letter', valid: o => !!o && typeof o === 'object' && !Array.isArray(o) });
    const n = normLetter(v, { year, today: today() });
    x.related = n.related; x.target = n.target;
    x.out = { title: n.title, date: (x.out && x.out.date) || today(), body: composeBody(n), replyOn: n.reply.need,
      reply: { title: n.reply.title || '회신서', fields: n.reply.fields, due: n.reply.due }, short: n.short };
    // 기다리는 동안 다른 가정통신문을 열었으면 그 글은 건드리지 않고, 쓴 글은 최근에 넣음
    resend(true, x);
    save(x, { push: true });
    toast(c() === x ? '가정통신문을 썼어요. 날짜·장소·금액은 꼭 확인해 주세요.' : `「${x.out.title}」을 다 써서 최근 가정통신문에 넣었어요.`, 5000);
  } catch (e) {
    toast(e && e.code === 'bad_json' ? 'AI 답을 읽지 못했어요. 다시 눌러 주세요.' : ai.errorMessage(e && e.code, e), 6000);
  }
  F.busy = false;
  live();
}
const letterOf = x => ({ title: x.out.title, date: x.out.date || today(), body: x.out.body, reply: x.out.replyOn ? x.out.reply : null });
const fileBase = s => String(s || '가정통신문').replace(/[\\/:*?"<>|]/g, '_');
/* 글(letterOf·번역본) → 학교 양식(.hwpx)이면 그 양식 그대로, 아니면 글 짜임 양식(.hwp·기본)으로 한글·워드·PDF. more: 알림 끝에 붙일 말 */
async function saveLetter(letter, name, more = '') {
  const f = F.form;
  if (f && f.rec.kind === 'hwpx' && f.parsed) {
    const r = f.rec.roles;
    if (!rolesOk(r)) { F.mapOpen = true; render(); toast('양식의 제목·본문·날짜 자리를 먼저 정해 주세요.', 5000); return; }
    let bytes, warn, where;
    try {
      ({ bytes, warn } = await fillForm(f.parsed, r, letter));
      where = await saveFile(`${name}.hwpx`, bytes, 'application/hwp+zip');
    } catch (e) { toast(`한글 파일을 만들지 못했어요: ${String((e && e.message) || e || '').slice(0, 80)}`, 7000); return; }
    const m = window.__TAURI__ ? `다운로드 폴더에 저장했어요: ${String(where).split(/[\\/]/).pop()}` : '한글 파일을 내려받았어요';
    toast(m + (warn.includes('reply-in-box') ? ' · 양식의 회신서가 본문과 같은 표 안에 있어 회신서는 바꾸지 않았어요' : '')
      + (warn.includes('overlap') ? ' · 겹치는 자리가 있어 일부를 바꾸지 못했어요. [양식 맞추기]를 확인해 주세요' : '')
      + (warn.includes('no-border') ? ' · 이 양식에는 표 테두리를 더할 수 없어 표는 글로 넣고 회신서는 넣지 못했어요' : '') + more, 8000);
    return;
  }
  const plain = f && f.rec.kind === 'plain' ? f.rec.plain : defaultPlain(getSchool().name);
  toast(await exportDoc(plainLetterDoc(plain, letter), name) + more, 6000);
}
async function download() {
  const x = c();
  if (!x.out) return;
  await saveLetter(letterOf(x), fileBase(x.out.title));
}

/* ---------- 번역본 (스펙 2026-11-06 K) ---------- */
const TR_NOTE = 'AI 번역이에요. 보내기 전에 확인해 주세요.';
const trLangOf = x => F.trLang || LANG_IDS.find(k => x.tr && x.tr[k]) || LANG_IDS[0];
/* 그 언어 번역: 저장해 둔 번역(원문 글이 같은 줄)은 다시 부르지 않고, 없는 줄만 AI로. all: 처음부터 다시.
   바로 상태를 돌려주고 AI 번역은 이어서 → 'started' | 'saved'(저장해 둔 번역으로 다 됨) | 'busy'(번역 중) | 'writing'(글을 쓰는 중) | 'empty'(쓴 글 없음) | 'no-ai' */
function translate(lang, { all = false } = {}) {
  const x = c();
  if (!x.out && F.busy) { toast('가정통신문을 쓰는 중이에요. 다 쓰면 번역본을 만들 수 있어요.', 5000); return 'writing'; }
  if (!x.out) { toast('먼저 가정통신문을 써 주세요. 다 쓰면 번역본을 만들 수 있어요.', 5000); return 'empty'; }
  if (F.trBusy) { toast('번역하는 중이에요. 잠시만 기다려 주세요.'); return 'busy'; }
  F.trLang = lang;
  if (!x.tr) x.tr = {};
  const old = x.tr[lang], base = all || !old ? {} : old.units, plan = planTr(x.out, base);
  // 번역하는 동안 선생님이 친 번역 칸(이 글·이 언어)은 새 번역으로 덮지 않음, 처음부터 다시가 중간에 멈추면(partial) 못 한 줄은 전 번역을 남김
  const edits = (F.trEdits = { x, lang, keys: new Set() });
  const done = (r, partial = false) => { x.tr[lang] = { units: pruneUnits(mergeTr((x.tr[lang] || {}).units, r.units, { all, partial, edited: [...edits.keys] }), x.out), at: Date.now() }; save(x, { push: true }); };
  if (!plan.jobs.length) {
    done(plan.finish({})); render();
    toast(old && !all ? `저장해 둔 번역본을 열었어요. ${TR_NOTE}` : TR_NOTE, 5000);
    return 'saved';
  }
  if (!ai.ready()) { render(); toast('설정 › AI에서 키를 넣어 주세요', 5000); return 'no-ai'; }
  F.trBusy = lang; render();
  trJob(lang, plan, done, all);
  return 'started';
}
async function trJob(lang, plan, done, all = false) {
  const ans = {};
  let err = null;
  for (const b of batches(plan.jobs)) {
    try { Object.assign(ans, normAnswers(await ai.generateJSON(trPrompt(b, lang), { task: 'letter', valid: o => !!o && typeof o === 'object' }), b)); }
    catch (e) { err = e; break; }
  }
  const r = plan.finish(ans), got = Object.keys(r.units).length;
  if (got || !err) done(r, !!err || r.miss > 0);
  F.trBusy = ''; F.trEdits = null;
  if (err) toast(`${err.code === 'bad_json' ? 'AI 답을 읽지 못했어요. 다시 눌러 주세요.' : ai.errorMessage(err.code, err)}${all ? ' 다시 번역하지 못한 줄은 전 번역을 남겨 두었어요.' : got ? ' 번역한 줄은 남겨 두었어요.' : ''}`, 7000);
  else toast(r.miss ? `${r.miss}줄은 ${all ? '다시 번역하지 못했어요(전 번역이 있던 줄은 남겨 두었어요).' : '번역하지 못했어요.'} [번역본 만들기]를 다시 눌러 주세요.` : `${TR_NOTE}${plan.personal ? ` 개인정보가 있는 ${plan.personal}곳은 AI로 보내지 않았어요.` : ''}`, 6000);
  live();
}
async function trDownload() {
  const x = c(), lang = trLangOf(x), e = x.tr && x.tr[lang], L = langInfo(lang);
  if (!x.out || !e) return;
  const bi = bilingualLetter(x.out, e.units, lang, { date: x.out.date || today() });
  const more = [bi.missing ? `번역이 없는 ${bi.missing}줄은 한국어만 넣었어요` : '', bi.held ? `개인정보가 있어 번역하지 않은 ${bi.held}줄은 한국어만 넣었어요(필요하면 직접 번역해 주세요)` : ''];
  await saveLetter(bi, fileBase(`${x.out.title || '가정통신문'} (${L.name})`), more.filter(Boolean).map(m => ` · ${m}`).join(''));
}
/* 다른 메뉴(쌤 채팅 등)에서: 가정통신문 탭으로 가서 그 언어(vi·zh·ru·en, '베트남어'도) 번역을 시작. 쓴 글이 없으면 먼저 쓰라고 알림.
   → 'started'(AI 번역 시작) | 'saved'(저장해 둔 번역본을 엶) | 'busy'(번역 중) | 'writing'(글을 쓰는 중) | 'empty'(쓴 글 없음) | 'no-ai' | 'no-lang'(모르는 언어) */
export function openLetterTranslate(lang) {
  go('etc', 'letter');
  const x = c(), id = langOf(lang);
  if (!x.out) { render(); return translate(id || LANG_IDS[0]); }
  if (id && !F.trBusy) F.trLang = id; // 다른 말로 번역하는 중이면 보던 언어 그대로(translate가 'busy')
  render();
  const card = box && box.querySelector('#lfTrCard');
  if (card && card.scrollIntoView) card.scrollIntoView({ block: 'start' });
  if (!id) { toast('베트남어·중국어(간체)·러시아어·영어 중에서 골라 주세요.', 5000); return 'no-lang'; }
  return translate(id);
}

/* ---------- 그리기 ---------- */
const formsHTML = () => {
  const id = F.form ? F.form.rec.id : '';
  return `<div class="row lf-forms"><label class="yp-f grow"><span class="lab">학교 양식</span><select class="field" id="lfForm">
      <option value="">기본 양식(쌤비서 · ${esc(getSchool().name || '학교 이름은 설정 › 학교 정보')})</option>
      ${F.list.map(f => `<option value="${esc(f.id)}"${f.id === id ? ' selected' : ''}>${esc(f.name)}${f.kind === 'plain' ? ' (.hwp · 짜임만)' : ''}</option>`).join('')}
      ${F.form && !F.list.some(f => f.id === id) ? `<option value="${esc(id)}" selected>${esc(F.form.rec.name)} (이번에만)</option>` : ''}</select></label>
    <span class="row"><button class="btn" type="button" data-lf="pickForm" data-drop-pick>${F.adding ? '<span class="spin"></span>읽는 중…' : '양식 넣기'}</button>
      ${F.form && F.form.rec.kind === 'hwpx' ? '<button class="btn text" type="button" data-lf="map">양식 맞추기</button>' : ''}
      ${F.form ? '<button class="btn text" type="button" data-lf="delForm">양식 지우기</button>' : ''}
      <input type="file" id="lfFormFile" hidden accept=".hwpx,.hwp"></span></div>
    <p class="muted" style="margin:0">${F.form && F.form.rec.kind === 'hwpx' ? '이 양식의 머리·로고·학교장 줄은 그대로 두고 제목·본문·날짜만 바꿔 넣어요.' : F.form ? '.hwp 양식은 글 짜임만 따라요. 한글에서 .hwpx로 저장해 넣으면 모양까지 살아요.' : '학교 가정통신문 양식(.hwpx·.hwp)을 한 번 넣으면 저장해 두고 다음부터 바로 써요.'}</p>`;
};
const srcHTML = x => (x.sources.length ? `<ul class="rp-src" id="lfSrc">${x.sources.map((s, i) => `<li><span class="rp-name" title="${esc(s.name)}">${esc(s.name)}</span><span class="muted">${s.text.length.toLocaleString('ko-KR')}자</span>
    <button class="icon-btn tiny" type="button" data-lf-del="${i}" aria-label="${esc(s.name)} 빼기" title="빼기">✕</button></li>`).join('')}</ul>` : '<p class="muted" id="lfSrc" style="margin:0">상위기관 공문·계획 파일을 넣으면 그 내용을 따라 써요(선택).</p>');
/* 본문 표 미리보기(「|」 줄이 있을 때만) */
function tablesHTML(body) {
  const ts = parseTableLines(body).filter(p => p.type === 'table');
  return ts.length ? `<p class="muted" style="margin:0">표 미리보기</p>${ts.map(t => `<table class="yp-tbl lf-tbl"><tbody>${t.rows.map((r, ri) => `<tr>${r.map(c => ri ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`).join('')}</tr>`).join('')}</tbody></table>`).join('')}` : '';
}
function outHTML(x) {
  const o = x.out;
  if (!o) return '<p class="muted">[가정통신문 쓰기]를 누르면 제목·인사·본문·회신서를 학교 양식에 맞춰 써요.</p>';
  const hwpx = F.form && F.form.rec.kind === 'hwpx';
  return `<label class="yp-f"><span class="lab">제목</span><input class="field" data-lo="title" value="${esc(o.title)}" autocomplete="off"></label>
    <label class="yp-f"><span class="lab">발행일</span><input class="field" type="date" data-lo="date" value="${esc(o.date)}"></label>
    <label class="yp-f"><span class="lab">본문 <span class="muted">(한 줄에 한 문단 · 「1.」「  가.」「    1)」로 단계 · 「| 시간 | 내용 |」 줄은 표)</span></span><textarea class="field" data-lo="body" rows="14">${esc(o.body.join('\n'))}</textarea></label>
    <div id="lfTbl">${tablesHTML(o.body)}</div>
    <label class="switch"><input type="checkbox" id="lfReplyOn"${o.replyOn ? ' checked' : ''}>회신서(자르는 선 아래) 붙이기</label>
    ${o.replyOn ? `<div class="lf-reply"><label class="yp-f"><span class="lab">회신서 제목</span><input class="field" data-lr="title" value="${esc(o.reply.title)}" autocomplete="off"></label>
      <label class="yp-f"><span class="lab">칸 <span class="muted">(한 줄에 하나 · 「이름: 내용」, 학년 반 번호·학생 이름 칸은 늘 있어요)</span></span><textarea class="field" data-lr="fields" rows="3">${esc(o.reply.fields.join('\n'))}</textarea></label>
      <label class="yp-f"><span class="lab">제출 안내</span><input class="field" data-lr="due" value="${esc(o.reply.due)}" autocomplete="off"></label></div>` : ''}
    <div class="row">${hwpx ? '<button class="btn primary" type="button" data-lf="download">한글로 내려받기</button>' : exportButton('data-lf="download"', { cls: 'primary' })}</div>`;
}
/* ---------- 회신서 모으기 (스펙 2026-11-04 6장) ---------- */
const rcOpts = x => (x.out && x.out.replyOn ? replyOptions(x.out.reply.fields) : []);
function collectHTML(x) {
  const opts = rcOpts(x);
  if (!opts.length) return '';
  const col = x.collect, rows = flagRows(col.rows), allowed = rosterAllowed(), t = tally(col.rows, opts), miss = missingNos(col.rows, allowed);
  const order = rows.map((r, i) => ({ r, i })).sort((a, b) => (a.r.no == null) - (b.r.no == null) || (a.r.no || 0) - (b.r.no || 0));
  return `<section class="pc-card" id="lfCollect"><h3>회신서 모으기</h3>
    <p class="muted" style="margin:0">걷은 회신서를 스캔(PDF·사진)해 넣고 이름 칸을 한 번 가려 주세요.</p>
    ${aiNoteHTML('이름 칸을 가린 그림만 보내요. AI는 번호와 ☑만 읽고, 이름은 읽지도 저장하지도 않아요.')}
    <p style="margin:0">읽을 칸: ${opts.map(o => `<b>${esc(o.name)}</b>(${o.options.map(esc).join(' / ')})`).join(', ')}</p>
    <div class="row"><button class="btn" type="button" data-lf="rcPick" data-drop-pick>${RC.adding ? '<span class="spin"></span>읽는 중…' : '스캔 넣기'}</button><input type="file" id="lfRcFile" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.webp">
      <span class="muted">${RC.pages.length}장</span>
      <button class="btn text" type="button" data-lf="rcMask"${RC.pages.length ? '' : ' disabled'}>이름 칸 가리기${col.mask.length ? ' (가림)' : ''}</button>
      <button class="btn primary" type="button" data-lf="rcRead"${RC.pages.length && !RC.busy ? '' : ' disabled'}>${RC.busy ? '<span class="spin"></span>읽는 중…' : '읽기'}</button></div>
    ${rows.length ? `<div class="yp-tbl-wrap"><table class="yp-tbl lf-rc"><thead><tr><th>번호</th>${opts.map(o => `<th>${esc(o.name)}</th>`).join('')}<th></th></tr></thead><tbody>
      ${order.map(({ r, i }) => `<tr data-rc-row="${i}" class="${r.warn ? 'warn' : ''}"><td><input class="field" type="number" min="1" max="99" data-rc-no="${i}" value="${r.no == null ? '' : r.no}" aria-label="번호" title="${r.warn === 'dup' ? '같은 번호가 또 있어요' : r.warn === 'none' ? '번호를 못 읽었어요' : ''}"></td>
        ${opts.map(o => `<td><select class="field${r.unsure.includes(o.name) ? ' unsure' : ''}" data-rc-a="${i}" data-rc-f="${esc(o.name)}" aria-label="${esc(o.name)}${r.unsure.includes(o.name) ? ' (확인 필요)' : ''}"${r.unsure.includes(o.name) ? ' aria-invalid="true" title="AI가 확실히 읽지 못했어요. 확인해 주세요"' : ''}><option value="">(표시 없음)</option>${o.options.map(v => `<option${r.answers[o.name] === v ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></td>`).join('')}
        <td>${r.b && r.b === RC.batch && RC.pages[r.pg] ? `<button class="btn text tiny" type="button" data-rc-view="${i}" title="이 줄의 스캔 보기">${r.pg + 1}장</button>` : ''}<button class="icon-btn tiny" type="button" data-rc-del="${i}" aria-label="이 줄 빼기">✕</button></td></tr>`).join('')}</tbody></table></div>
      <p style="margin:0">${t.map(z => `<b>${esc(z.name)}</b> ${z.counts.map(([o, n]) => `${esc(o)} ${n}명`).join(' · ')}${z.blank ? ` · 표시 없음 ${z.blank}명` : ''}`).join('<br>')}</p>
      <p style="margin:0">${miss.length ? `미제출: ${miss.join(', ')}번` : '모두 냈어요'} <span class="muted">(낸 회신서 ${rows.length}장${allowed ? '' : ' · 설정 › 학급 명단에 학생 수를 넣으면 미제출이 정확해요'})</span></p>
      <div class="row"><button class="btn" type="button" data-lf="rcCopy">표 복사</button>${exportButton('data-lf="rcExport"')}<button class="btn text" type="button" data-lf="rcClear">표 비우기</button></div>` : ''}
  </section>`;
}
function rcReset() { if (SS().files && SS().files.freePages) SS().files.freePages(RC.pages); RC.pages = []; RC.tok++; RC.busy = false; }
async function rcAdd(files) {
  if (!SS().files || !SS().files.readPages) { toast('스캔을 읽는 도구를 아직 불러오지 못했어요. 잠시 뒤 다시 넣어 주세요.'); return; }
  RC.adding = true; render();
  try {
    const r = await SS().files.readPages(files), pages = Array.isArray(r) ? r : (r && r.pages) || [];
    if (SS().files.freePages) SS().files.freePages(RC.pages);
    RC.pages = pages; RC.tok++; RC.busy = false; RC.batch = Math.random().toString(36).slice(2, 10); RC.checked = '';
    if (r && r.skipped && r.skipped.length) toast(`읽지 못한 파일: ${r.skipped.map(s => s.name || s).join(', ')}`, 6000);
  } catch (e) { toast(e && e.code ? fileMessage(e.code) : '스캔을 읽지 못했어요. PDF·사진을 넣어 주세요.', 6000); }
  RC.adding = false; live();
}
/* 가리기: 모든 장을 넘겨 보며 이름이 가려졌는지 확인(잘라 낸 회신서는 장마다 자리가 달라요). 새 스캔마다 다시 */
function rcMask(then) {
  const x = c(), batch = RC.batch;
  if (!RC.pages.length || !SS().openMaskEditor) return;
  SS().openMaskEditor({ shots: RC.pages.slice(0, 80).map((p, i) => ({ url: p.url, label: `${i + 1}장 / ${RC.pages.length}장` })), mask: x.collect.mask, all: true, what: '회신서',
    save: mask => { const y = c(); if (y !== x) return; y.collect.mask = mask || []; if (RC.batch === batch && y.collect.mask.length) RC.checked = batch; save(y); render(); if (then && RC.checked === RC.batch) then(); } });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function rcRead() {
  const x = c(), opts = rcOpts(x);
  if (!RC.pages.length || !opts.length || RC.busy) return;
  if (!x.collect.mask.length || RC.checked !== RC.batch) {
    toast('모든 장을 넘겨 보며 학생 이름이 가려졌는지 확인해 주세요(가린 그림만 AI로 보내요).', 6000);
    rcMask(rcRead); return;
  }
  if (!ai.ready()) { toast('설정 › AI에서 키를 넣어 주세요', 5000); return; }
  const tok = ++RC.tok, batch = RC.batch, pages = RC.pages, mask = x.collect.mask, shared = replyPrompt(opts), out = new Array(pages.length);
  RC.busy = true; render();
  let next = 0, fails = 0, fatal = null;
  const one = async i => {
    for (let tryN = 0; ; tryN++) {
      try {
        const img = await SS().files.pageImage(pages[i], mask);
        const v = await ai.generateJSON(`${i + 1}번째 회신서 그림입니다. 위 꼴의 JSON 하나로만 답하세요.`, { shared: { text: shared }, images: [img], task: 'reply', valid: o => !!o && typeof o === 'object' && !Array.isArray(o) });
        out[i] = { ...normReply(v, opts), b: batch, pg: i };
        return;
      } catch (e) {
        const code = e && e.code;
        if (code === 'rate_limited' && tryN < 3 && !fatal) { await sleep(Math.min(30000, (e.retryAfter > 0 ? e.retryAfter * 1000 : 3000))); continue; } // AI 한도: 쉬었다 다시
        if (code === 'auth' || code === 'quota' || code === 'NO_AI') { fatal = fatal || e; return; } // 키·한도 오류: 모두 멈춤
        fails++; out[i] = { ...normReply(null, opts), b: batch, pg: i }; return;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, pages.length) }, async () => { while (next < pages.length && tok === RC.tok && !fatal) await one(next++); }));
  if (tok !== RC.tok) return; // 그새 스캔을 바꾸거나 다른 가정통신문을 열었으면 버림
  RC.busy = false;
  if (fatal) { live(); toast(`${ai.errorMessage(fatal.code, fatal)} 읽은 표는 그대로 두었어요.`, 7000); return; }
  if (c() !== x) { live(); return; }
  // 이번 스캔 묶음의 줄만 바꾸고 앞서 읽은(고친) 줄은 그대로 — 늦게 낸 회신서는 더해짐
  x.collect.rows = [...x.collect.rows.filter(r => r.b !== batch), ...out.filter(Boolean)];
  save(x, { push: true }); live();
  toast(fails ? `${fails}장은 읽지 못했어요. 노란 줄의 [장]을 눌러 스캔을 보고 고쳐 주세요.` : '회신서를 읽었어요. 노란 칸은 꼭 확인해 주세요.', 5000);
}
function sideHTML(x) {
  if (!x.out) return '';
  return `<section class="pc-card"><h3>알림 앱용 짧은 글</h3>
      <textarea class="field" id="lfShort" rows="5">${esc(x.out.short)}</textarea>
      <div class="row"><button class="btn" type="button" data-lf="copyShort">복사</button></div>
      <p class="muted" style="margin:0">e알리미 같은 학부모 알림 앱에 붙여 넣고, 내려받은 가정통신문을 붙임으로 올려 주세요.</p></section>
    <section class="pc-card"><h3>발송 기안</h3>
      <div class="pc-out"><div class="pc-out-h"><label class="lab" for="lfSendTitle">제목</label><button class="btn text pc-copy" type="button" data-lf="copySendTitle">복사</button></div>
        <input class="field" id="lfSendTitle" value="${esc(x.send.title)}" autocomplete="off"></div>
      <div class="pc-out"><div class="pc-out-h"><label class="lab" for="lfSendBody">본문</label><button class="btn text pc-copy" type="button" data-lf="copySendBody">복사</button></div>
        <textarea class="field" id="lfSendBody" rows="9">${esc(x.send.body)}</textarea></div>
      <div id="lfResync">${x.sendEdited ? '<p class="muted pc-resync">기안을 고쳤어요 <button class="btn text tiny" type="button" data-lf="resync">칸으로 다시 맞추기</button></p>' : ''}</div>
      <div class="row"><button class="btn" type="button" data-lf="copySend">모두 복사</button>${canQueue() ? '<button class="btn primary" type="button" data-lf="queue">에듀파인 기안에 차례로 붙여넣기</button>' : ''}</div></section>`;
}
/* 번역본: 언어 고르기 → [번역본 만들기] → 원문 줄마다 번역(고칠 수 있음) → 내려받기 */
const trRows = (ko, tr) => (ko.includes('\n') ? Math.max(3, String(tr || '').split('\n').length + 1) : Math.min(5, Math.max(1, Math.ceil(Math.max(String(tr || '').length, ko.length * 1.5) / 56))));
function pairHTML(q, lab = '') {
  if (!q.ko.trim()) return '';
  const ko = `<p class="lf-ko">${lab ? `<b>${esc(lab)}</b> ` : ''}${esc(q.ko)}</p>`;
  if (q.fixed) return `<div class="lf-tr-pair fixed">${ko}<span class="muted">그대로 둬요</span></div>`;
  return `<div class="lf-tr-pair${q.tr == null ? ' miss' : ''}">${ko}
    <textarea class="field" rows="${trRows(q.ko, q.tr)}" data-lt-ko="${esc(q.ko)}" aria-label="${esc(lab || q.ko.slice(0, 30))} 번역"${q.tr == null ? ' placeholder="번역이 없어요. [번역본 만들기]를 눌러 주세요"' : ''}>${esc(q.tr == null ? '' : q.tr)}</textarea>
    ${q.tr != null && q.tr === q.ko ? '<span class="muted">개인정보가 있어 AI로 보내지 않았어요. 직접 번역해 주세요.</span>' : ''}</div>`;
}
function trHTML(x) {
  if (!x.out) return '';
  const lang = trLangOf(x), L = langInfo(lang), e = x.tr && x.tr[lang], busy = F.trBusy === lang;
  const p = e ? trPairs(x.out, e.units) : null, miss = p ? missingCount(p) : 0;
  const hwpx = F.form && F.form.rec.kind === 'hwpx';
  const make = !e || miss || busy ? `<button class="btn primary" type="button" data-lf="trMake"${F.trBusy ? ' disabled' : ''}>${busy ? '<span class="spin"></span>번역하는 중…' : '번역본 만들기'}</button>` : '';
  return `<section class="pc-card lf-tr" id="lfTrCard"><h3>번역본 <span class="muted">다문화 가정</span></h3>
    <p class="muted" style="margin:0">문단마다 한국어 아래에 번역을 넣은 가정통신문을 만들어요.</p>
    ${aiNoteHTML('문단 글만 보내요. 전화번호·날짜·숫자만 있는 줄과 개인정보가 있는 줄은 보내지 않고 그대로 둬요.')}
    <div class="seg" role="group" aria-label="번역할 언어">${LANGS.map(l => `<button type="button" data-lf-lang="${l.id}" aria-pressed="${l.id === lang}">${esc(l.name)}${x.tr && x.tr[l.id] ? ' ✓' : ''}</button>`).join('')}</div>
    ${make ? `<div class="row">${make}</div>` : ''}
    ${e ? `<p class="banner warn lf-tr-note" role="note">${TR_NOTE}</p>
      ${miss ? `<p class="muted warn" style="margin:0">번역이 없는 줄이 ${miss}개 있어요(원문을 고쳤거나 번역하지 못한 줄). [번역본 만들기]를 누르면 그 줄만 번역해요.</p>` : ''}
      <div class="lf-tr-list" lang="${lang}">${pairHTML(p.title, '제목')}${p.body.map(q => pairHTML(q)).join('')}</div>
      ${p.reply ? `<h4 class="lf-tr-sub">회신서</h4><div class="lf-tr-list" lang="${lang}">${pairHTML(p.reply.title, '제목')}${p.reply.fields.map(q => pairHTML(q)).join('')}${pairHTML(p.reply.due, '제출 안내')}</div>` : ''}
      ${p.short.ko.trim() ? `<h4 class="lf-tr-sub">알림 앱용 짧은 글</h4><div class="lf-tr-list" lang="${lang}">${pairHTML(p.short)}</div>
        ${p.short.tr != null ? '<div class="row"><button class="btn" type="button" data-lf="trCopyShort">번역 복사</button></div>' : ''}` : ''}
      <div class="row">${hwpx ? `<button class="btn primary" type="button" data-lf="trDownload">${esc(L.name)} 번역본 한글로 내려받기</button>` : exportButton('data-lf="trDownload"', { cls: 'primary', prefix: `${L.name} 번역본 · ` })}
        <button class="btn text" type="button" data-lf="trRedo"${F.trBusy ? ' disabled' : ''}>처음부터 다시 번역</button></div>` : ''}
  </section>`;
}
/* 원문을 고칠 때: 번역본 칸만 다시(번역 칸에서 쓰는 중이면 그대로) */
function refreshTr() {
  const el = box && box.querySelector('#lfTrCard'), a = document.activeElement;
  if (!el || (a && el.contains(a))) return;
  const t = document.createElement('div');
  t.innerHTML = trHTML(c());
  if (t.firstElementChild) el.replaceWith(t.firstElementChild);
}
const recentHTML = () => {
  const l = listLetters();
  return l.length ? `<ul class="pc-lib-list" id="lfRecent">${l.map(r => `<li class="pc-lib-row"><div class="grow"><b>${esc(r.out.title || '가정통신문')}</b><span class="muted">${new Date(r.at).toLocaleDateString('ko-KR')}</span></div>
    <button class="btn text" type="button" data-lf-open="${esc(r.id)}">열기</button></li>`).join('')}</ul>` : '<p class="muted" id="lfRecent" style="margin:0">쓴 가정통신문이 최근 20개까지 남아요.</p>';
};
// 다시 그리는 중에 지워지는 칸의 blur→change가 또 그리기를 부르면 건너뜀(이미 같은 값을 그리는 중)
let drawing = false;
export function render() {
  if (!box || box.hidden || drawing) return;
  drawing = true;
  const keys = focusKeys(document.activeElement);
  try { draw(); } finally { drawing = false; }
  focusBack(keys);
}
/* 다시 그려도 키보드 초점은 쓰던 칸·단추(id·data- 속성이 같은 것)에 — <body>로 가지 않게. 없어졌으면 가까운 곳:
   양식 맞추기 자리 단추 → 그 줄, 맞추기 닫기·저장 → [양식 맞추기], 양식 칸의 단추(지우기 등) → 양식 고르기.
   글 칸(치는 칸)은 live()가 맡음(칸을 떠나며 change로 다시 그릴 때 초점을 도로 끌어오지 않게) */
function focusKeys(a) {
  if (!a || !box.contains(a) || a.matches('input:not([type=checkbox]):not([type=radio]), textarea')) return [];
  const lf = (a.dataset && a.dataset.lf) || '', role = a.dataset && a.dataset.lfRole != null;
  const own = a.id ? `#${CSS.escape(a.id)}` : [...a.attributes].filter(x => x.name.startsWith('data-')).map(x => `[${x.name}="${CSS.escape(x.value)}"]`).join('');
  const ln = role && a.closest('li') && a.closest('li').querySelector('[data-lf-line]');
  return [own, ln ? `[data-lf-line="${ln.dataset.lfLine}"]` : '', role || /^map(Save|Close)?$/.test(lf) ? '[data-lf="map"]' : '',
    a.closest('#lfMap') || /^(map|mapSave|mapClose|delForm|pickForm)$/.test(lf) ? '#lfForm' : ''].filter(Boolean);
}
function focusBack(keys) {
  if (!keys.length || box.contains(document.activeElement)) return;
  for (const k of keys) { const n = box.querySelector(k); if (n && !n.disabled) { n.focus({ preventScroll: true }); return; } }
}
function draw() { keepFiles(box, () => { box.innerHTML = pageHTML(); }); } // 파일 고르기 창이 열린 채 다시 그려도 고른 파일이 들어가게
function pageHTML() {
  const x = c();
  return `<div class="m-page lf-page">
    <div class="m-head m-head-row"><div><h2>가정통신문</h2>${introHTML('letter', '공문·계획과 넣을 내용으로 학교 양식에 맞춘 가정통신문을 써요.')}</div>
      <div class="m-head-act">${aiRowHTML('letter')}<button class="btn text" type="button" data-lf="new">새 가정통신문</button></div></div>
    <div class="msg-grid">
      <section class="pc-card"><h3>양식</h3>${formsHTML()}${mapHTML()}
        <h3>넣기</h3>
        <div class="msg-drop" data-lf-drop><p class="muted" style="margin:0">상위기관 공문·계획(한글·PDF·워드·글)을 끌어 놓아도 돼요.</p>
          <div class="row"><button class="btn text" type="button" data-lf="pick">파일 고르기</button><input type="file" id="lfFile" multiple hidden accept=".hwp,.hwpx,.pdf,.docx,.txt"></div></div>
        ${srcHTML(x)}
        <label class="yp-f"><span class="lab">넣을 내용</span><textarea class="field" id="lfMemo" rows="7" placeholder="예) 11월 12일(목) 3학년 국립중앙과학관 현장체험학습. 9시 출발 15시 도착. 도시락·물·편한 옷. 참가 동의서 11월 7일까지.">${esc(x.memo)}</textarea></label>
        <div class="row"><button class="btn primary" type="button" data-lf="write"${F.busy ? ' disabled' : ''}>${F.busy ? '<span class="spin"></span>쓰는 중…' : x.out ? '가정통신문 다시 쓰기' : '가정통신문 쓰기'}</button></div>
        ${aiNoteHTML('공문·계획 글과 넣을 내용을 보내요. 명단·전화번호가 적힌 줄과 양식의 머리·학교장 줄은 보내지 않아요.')}
      </section>
      <section class="pc-card"><h3>가정통신문</h3>${outHTML(x)}</section>
    </div>
    <div class="msg-grid">${sideHTML(x)}</div>
    ${trHTML(x)}
    ${collectHTML(x)}
    <section class="pc-card"><h3>최근 가정통신문</h3>${recentHTML()}</section></div>`;
}
/* AI 쓰기·스캔 넣기·회신서 읽기가 끝날 때: 글 칸에 초점이 있으면 화면을 통째로 다시 그리지 않음.
   그 칸의 글이 그대로면 그 칸만 두고 둘레를 새로 그림(쓰던 글·한글 조합이 끊기지 않게),
   AI가 그 칸 글을 바꿨으면(다시 쓰기 중 고치던 기안 등) 다시 그리고 같은 칸에 초점을 돌려 둠(이어 친 글자가 버려지지 않게) */
const TYPING = 'input:not([type=checkbox]):not([type=file]), textarea';
const keyOf = el => (el.id ? `#${el.id}` : el.dataset.lo ? `[data-lo="${el.dataset.lo}"]` : el.dataset.lr ? `[data-lr="${el.dataset.lr}"]`
  : el.dataset.ltKo != null ? `[data-lt-ko="${CSS.escape(el.dataset.ltKo)}"]` : '');
function live() {
  if (!box || box.hidden || drawing) return;
  const a = document.activeElement, k = a && box.contains(a) && a.matches(TYPING) ? keyOf(a) : '';
  if (!k) { render(); return; }
  const tmp = document.createElement('div');
  tmp.innerHTML = pageHTML();
  const na = tmp.querySelector(k);
  if (na && na.value === a.value && keepFiles(box, () => keepAround(a, na, tmp))) return;
  render();
  const b = box.querySelector(k);
  if (b) { b.focus(); try { b.setSelectionRange(b.value.length, b.value.length); } catch (e) {} }
}
/* 칸 a는 그 자리에 두고, a에서 box까지 올라가며 둘레(앞뒤 형제)만 새 그림(na의 둘레)으로 바꿈. 짜임이 다르면 false */
function keepAround(a, na, top) {
  const up = (e, stop) => { const p = []; for (; e && e !== stop; e = e.parentElement) p.push(e); return e === stop ? p : null; };
  const po = up(a, box), pn = up(na, top);
  if (!po || !pn || po.length !== pn.length || po.some((e, i) => e.tagName !== pn[i].tagName)) return false;
  po.forEach((o, i) => {
    const sib = [...pn[i].parentNode.childNodes], j = sib.indexOf(pn[i]);
    [...o.parentNode.childNodes].forEach(n => { if (n !== o) n.remove(); });
    o.before(...sib.slice(0, j)); o.after(...sib.slice(j + 1));
  });
  return true;
}
function refreshSend() {
  const x = c(), t = box && box.querySelector('#lfSendTitle'), b = box && box.querySelector('#lfSendBody'), rs = box && box.querySelector('#lfResync');
  if (t && document.activeElement !== t) t.value = x.send.title;
  if (b && document.activeElement !== b) b.value = x.send.body;
  if (rs) rs.innerHTML = x.sendEdited ? '<p class="muted pc-resync">기안을 고쳤어요 <button class="btn text tiny" type="button" data-lf="resync">칸으로 다시 맞추기</button></p>' : '';
}

/* ---------- 다른 메뉴에서 넣기 ---------- */
/* 행사계획 등: 이미 쓴 가정통신문 글을 학교 양식에 바로(AI 안 부름). 발행일 오늘, 회신서 끔 */
export function putLetterDraft({ title = '', body = [], memo = '' } = {}) {
  go('etc', 'letter');
  const lines = (Array.isArray(body) ? body : String(body || '').split('\n')).map(l => String(l).replace(/\s+$/, ''));
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  // 아직 쓰지 않은(결과가 없는) 가정통신문이면 그 메모·공문은 남김
  const x0 = c(), keep = !x0.out ? { sources: x0.sources, memo: x0.memo } : {};
  cur = { ...blank(), ...keep, ...(memo ? { memo: String(memo) } : {}), out: { title: String(title || ''), date: today(), body: lines, replyOn: false, reply: { title: '회신서', fields: [], due: '' }, short: '' } };
  rcReset(); resend(true); save(cur, { push: true }); render();
}
/* 공문 처리·쌤 채팅 등: 넣기 칸에 공문·넣을 내용을 넣음(쓰기는 부르는 쪽이나 선생님이) → 'new'(새 가정통신문) | 'put'(빈 글에 넣음) | 'added'(쓰던 글에 덧붙임).
   - 이미 쓴 가정통신문이거나 쓰는 중이면(다 쓰면 최근에 들어감) 새 가정통신문
   - 아직 쓰지 않은 가정통신문: 공문은 더하고 쓰던 메모는 그대로. 넣을 내용(memo)이 왔는데 쓰던 메모·공문이 있으면 바꾸지 않고 메모 끝에 덧붙임
     (가정통신문은 쓰던 글을 하나만 두므로, 새로 시작하면 쓰던 내용이 없어지고, 바꾸면 남은 공문과 섞여 써짐 — 'added'면 부르는 쪽이 바로 쓰지 않음) */
export function putLetterSources({ sources = [], memo = '' } = {}) {
  go('etc', 'letter');
  const add = sources.filter(s => s && String(s.text || '').trim()).map(s => ({ name: String(s.name || '공문'), text: cleanSheet(s.text).text }));
  const x0 = c(), m = String(memo || '').trim(), had = !!(x0.memo.trim() || x0.sources.length);
  const srcs = [...x0.sources, ...add].slice(-10);
  let how;
  if (x0.out || F.busy) { cur = { ...blank(), memo: m, sources: add.slice(0, 10) }; how = 'new'; }
  else if (!m) { cur = { ...x0, sources: srcs }; how = had ? 'added' : 'put'; }
  else if (!had || x0.memo.trim() === m) { cur = { ...x0, memo: m, sources: srcs }; how = 'put'; }
  else { cur = { ...x0, memo: x0.memo.trim() ? `${x0.memo.replace(/\s+$/, '')}\n\n(쌤 채팅에서 더한 내용)\n${m}` : m, sources: srcs }; how = 'added'; }
  rcReset(); save(); render();
  if (how === 'added' && m) toast('쓰던 가정통신문이 있어서 넣을 내용 끝에 덧붙였어요. 확인한 뒤 [가정통신문 쓰기]를 눌러 주세요.', 6000);
  return how;
}

/* ---------- 누르기·입력 ---------- */
const mine = e => box && !box.hidden && box.contains(e.target);
document.addEventListener('click', async e => {
  if (!mine(e)) return;
  const x = c();
  const ln = e.target.closest('[data-lf-line]');
  if (ln) { F.mapSel = F.mapSel === +ln.dataset.lfLine ? -1 : +ln.dataset.lfLine; render(); return; }
  const ro = e.target.closest('[data-lf-role]');
  if (ro && F.form && F.mapSel >= 0) {
    const L = F.form.parsed.lines, r = { ...F.form.rec.roles }, i = F.mapSel, k = ro.dataset.lfRole;
    const filled = j => !!(L[j] && (L[j].text.trim() || L[j].obj));
    const replyAfter = () => { r.reply = -1; for (let j = Math.max(r.date, r.sign) + 1; j < L.length; j++) if (filled(j)) { r.reply = j; break; } };
    F.mapSel = -1;
    if (k === 'noreply') r.reply = -1;
    else if (k === 'nodate') r.date = -1; // 결과 보고서 같은 날짜 없는 양식
    else if (k === 'reply' && i <= Math.max(r.date, r.sign)) { toast('회신서는 날짜·학교장 줄 아래에서 골라 주세요.', 4000); render(); return; }
    else {
      r[k] = i;
      if (k === 'bodyStart' && r.bodyEnd < i) r.bodyEnd = i;
      if (k === 'bodyEnd' && (r.bodyStart < 0 || r.bodyStart > i)) r.bodyStart = i;
      if (k === 'date') {
        // 본문 끝은 날짜 위의 글 있는 줄까지, 학교장은 날짜 줄부터 처음 나오는 학교장 줄, 회신서는 그 아래
        if (r.bodyEnd >= i) { let e = i - 1; while (e > r.bodyStart && !filled(e)) e--; r.bodyEnd = e; }
        r.sign = L.findIndex((l, j) => j >= i && isSign(l.text));
        if (r.reply >= 0 && r.reply <= Math.max(r.date, r.sign)) replyAfter();
      }
    }
    F.form.rec.roles = r; render(); return;
  }
  const rv = e.target.closest('[data-rc-view]');
  if (rv) { const r = x.collect.rows[+rv.dataset.rcView], pg = r && RC.pages[r.pg]; if (pg && SS().openSheet) SS().openSheet(`<h3>${r.pg + 1}장</h3><img src="${pg.url}" alt="회신서 ${r.pg + 1}장" style="max-width:100%"><div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>닫기</button></div>`); return; }
  const rd = e.target.closest('[data-rc-del]');
  if (rd) { x.collect.rows.splice(+rd.dataset.rcDel, 1); save(x, { push: true }); render(); return; }
  const del = e.target.closest('[data-lf-del]');
  if (del) { x.sources.splice(+del.dataset.lfDel, 1); save(); render(); return; }
  const op = e.target.closest('[data-lf-open]');
  if (op) { const r = listLetters().find(y => y.id === op.dataset.lfOpen); if (r) { cur = fitOld({ ...r }); delete cur.at; saveCurrent(cur); rcReset(); render(); } return; }
  const lg = e.target.closest('[data-lf-lang]');
  if (lg) { F.trLang = lg.dataset.lfLang; render(); return; }
  const b = e.target.closest('[data-lf]');
  if (!b) return;
  const a = b.dataset.lf;
  if (a === 'pickForm') box.querySelector('#lfFormFile').click();
  else if (a === 'pick') box.querySelector('#lfFile').click();
  else if (a === 'map') { F.mapOpen = !F.mapOpen; F.mapSel = -1; render(); }
  else if (a === 'mapClose') { F.mapOpen = false; render(); }
  else if (a === 'mapSave' && F.form) {
    if (F.list.some(f => f.id === F.form.rec.id)) { try { await F.store.put(F.form.rec); } catch (e) { toast(QUOTA, 6000); return; } }
    F.mapOpen = false; render(); toast(rolesOk(F.form.rec.roles) ? '양식 자리를 저장했어요.' : '제목·본문·날짜 자리가 아직 비어 있어요.', 4000);
  } else if (a === 'delForm' && F.form) {
    try { await F.store.del(F.form.rec.id); F.list = await F.store.list(); } catch (e) { toast(e && e.code === 'DEMO' ? e.message : '양식을 지우지 못했어요. 다시 눌러 주세요.', 5000); return; }
    await selectForm('');
    toast('양식을 지웠어요.');
  } else if (a === 'write') write();
  else if (a === 'new') { cur = blank(); clearCurrent(); rcReset(); render(); }
  else if (a === 'download') download();
  else if (a === 'resync') { resend(true); save(); refreshSend(); }
  else if (a === 'copyShort') copyText(x.out ? x.out.short : '').then(ok => toast(ok ? '복사했어요. 알림 앱에 붙여 넣으세요' : '복사하지 못했어요'));
  else if (a === 'copySendTitle' || a === 'copySendBody' || a === 'copySend') {
    const t = a === 'copySendTitle' ? x.send.title : a === 'copySendBody' ? x.send.body : `${x.send.title}\n\n${x.send.body}`;
    copyText(t).then(ok => toast(ok ? '복사했어요. 에듀파인 기안에 붙여 넣으세요' : '복사하지 못했어요'));
  } else if (a === 'queue') openQueue({ title: x.send.title, items: letterQueueItems(x.send) });
  else if (a === 'rcPick') box.querySelector('#lfRcFile').click();
  else if (a === 'rcMask') rcMask();
  else if (a === 'rcRead') rcRead();
  else if (a === 'rcCopy') copyText(collectTSV(x.collect.rows, rcOpts(x))).then(ok => toast(ok ? '표를 복사했어요. 엑셀·한글 표에 붙여 넣으세요' : '복사하지 못했어요'));
  else if (a === 'rcExport') exportDoc(collectDoc(x.collect.rows, rcOpts(x), { title: x.out.reply.title || x.out.title, allowed: rosterAllowed() }), `${x.out.reply.title || '회신서'} 회신 결과`).then(m => toast(m, 6000));
  else if (a === 'rcClear') { if (confirm('읽은 회신서 표를 비울까요?')) { x.collect.rows = []; save(x, { push: true }); render(); } }
  else if (a === 'trMake') translate(trLangOf(x));
  else if (a === 'trRedo') { const l = trLangOf(x); if (confirm(`${langInfo(l).name} 번역을 처음부터 다시 할까요? 고친 번역은 없어져요.`)) translate(l, { all: true }); }
  else if (a === 'trDownload') trDownload();
  else if (a === 'trCopyShort') {
    const e2 = x.tr && x.tr[trLangOf(x)], s = e2 && x.out ? trPairs(x.out, e2.units).short.tr : '';
    copyText(s || '').then(ok => toast(ok ? '번역을 복사했어요. 알림 앱에 붙여 넣으세요' : '복사하지 못했어요'));
  }
});
document.addEventListener('change', e => {
  if (!mine(e)) return;
  const el = e.target, x = c();
  if (el.id === 'lfFormFile') { const f = el.files[0]; el.value = ''; if (f) addForm(f); return; }
  if (el.id === 'lfFile') { const fs = [...el.files]; el.value = ''; if (fs.length) addSources(fs); return; }
  if (el.id === 'lfForm') { selectForm(el.value); return; }
  if (el.id === 'lfReplyOn' && x.out) { x.out.replyOn = el.checked; save(x, { push: true }); render(); return; }
  if (el.id === 'lfRcFile') { const fs = [...el.files]; el.value = ''; if (fs.length) rcAdd(fs); return; }
  if (el.dataset.rcA != null) { const r = x.collect.rows[+el.dataset.rcA], f = el.dataset.rcF; if (r) { r.answers[f] = el.value; r.unsure = r.unsure.filter(u => u !== f); save(x, { push: true }); render(); } return; }
  if (el.dataset.rcNo != null) { const r = x.collect.rows[+el.dataset.rcNo], n = +el.value; if (r) { r.no = Number.isInteger(n) && n >= 1 && n <= 99 ? n : null; save(x, { push: true }); render(); } return; }
});
document.addEventListener('input', e => {
  if (!mine(e)) return;
  const el = e.target, x = c();
  if (el.id === 'lfMemo') { x.memo = el.value; save(x, { push: !!x.out }); return; }
  if (!x.out) return;
  if (el.dataset.ltKo != null) {
    // 번역 고치기: 그 원문 글의 번역(같은 글이 또 있으면 그 칸도), 비우면 번역 없음(다시 번역할 수 있게)
    const ent = x.tr && x.tr[trLangOf(x)], ko = el.dataset.ltKo, ed = F.trEdits;
    if (!ent) return;
    if (el.value.trim()) ent.units[ko] = el.value; else delete ent.units[ko];
    if (ed && ed.x === x && ed.lang === trLangOf(x)) ed.keys.add(ko); // 번역하는 동안 친 칸은 새 번역으로 덮지 않음
    box.querySelectorAll('[data-lt-ko]').forEach(t => { if (t !== el && t.dataset.ltKo === ko) t.value = el.value; });
    save(x, { push: true }); return;
  }
  if (el.dataset.lo) {
    const k = el.dataset.lo;
    x.out[k] = k === 'body' ? el.value.split('\n') : el.value;
    if (k === 'body') { const tb = box.querySelector('#lfTbl'); if (tb) tb.innerHTML = tablesHTML(x.out.body); }
    if (k === 'title' || k === 'date') { resend(); refreshSend(); }
    save(x, { push: true }); refreshTr(); return;
  }
  if (el.dataset.lr) { const k = el.dataset.lr; x.out.reply[k] = k === 'fields' ? el.value.split('\n').map(s => s.trim()).filter(Boolean) : el.value; save(x, { push: true }); refreshTr(); return; }
  if (el.id === 'lfShort') { x.out.short = el.value; save(x, { push: true }); refreshTr(); return; }
  if (el.id === 'lfSendTitle' || el.id === 'lfSendBody') { x.send = { ...x.send, [el.id === 'lfSendTitle' ? 'title' : 'body']: el.value }; x.sendEdited = true; save(x, { push: true }); refreshSend(); }
});
document.addEventListener('dragover', e => { const z = box && e.target.closest && e.target.closest('[data-lf-drop]'); if (z && box.contains(z)) { e.preventDefault(); z.classList.add('over'); } });
document.addEventListener('dragleave', e => { const z = e.target.closest && e.target.closest('[data-lf-drop]'); if (z) z.classList.remove('over'); });
document.addEventListener('drop', e => {
  const z = box && e.target.closest && e.target.closest('[data-lf-drop]');
  if (!z || !box.contains(z)) return;
  e.preventDefault(); z.classList.remove('over');
  const fs = [...((e.dataTransfer && e.dataTransfer.files) || [])];
  if (fs.length) addSources(fs);
});

onEnter('etc', (tab, section) => {
  if (!box || !section.contains(box)) { box = document.createElement('div'); box.className = 'lf-box'; section.append(box); }
  box.hidden = tab !== 'letter';
  // 양식 목록은 들어올 때마다 다시 읽음: 바뀐 것이 있을 때만, 치던 칸·고른 파일은 그대로 두고 다시 그림
  if (!box.hidden) { render(); const sig = formsSig(); loadForms().then(() => { if (formsSig() !== sig) live(); }).catch(() => {}); }
});
