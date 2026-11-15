/* 학교 양식(.hwpx)으로 내려받기 — 계획서(연간·행사·학급운영계획)가 함께 씀.
   내려받기 단추 자리에 「양식 [쌤비서 기본 문서 ▾]」와 [양식 넣기]: 학교 계획서 양식을 고르면 [학교 양식으로 한글 내려받기]가
   그 양식(머리·결재란·글꼴 그대로)의 제목·본문 자리에 문서를 채워 내려받음. 양식은 문서·소통 › 가정통신문·결과 보고와 같은 저장소.
   화면은 formSlotHTML(이름, 기본 단추 HTML)로 그리고 registerFormDoc(이름, () => ({ doc, name, date? }))로 내려받을 문서를 알려 줌(date: 날짜 자리에 넣을 날 — 없으면 오늘) */
import { forms, newFormId, MAX_FORM } from './form-store.js';
import { readForm, findRoles, fillForm, rolesValid } from './hwpx-form.js';
import { docToLetter } from './body-table.js';
import { saveFile, toast } from './ui.js';
import { get, set } from './store.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = k => 'form:' + k;
const C = { list: null, loading: false, adding: 0 };
const docs = new Map();
export const registerFormDoc = (key, fn) => { docs.set(key, fn); };
const chosen = key => { const id = String(get(KEY(key), '') || ''); return (C.list || []).some(f => f.id === id) ? id : ''; };

function inner(key, fallback) {
  if (!C.list) { load(); return fallback; } // 읽는 동안은 기본 단추
  const id = chosen(key);
  const pick = C.list.length ? `<label class="yp-f sf-pick"><span class="lab">양식</span><select class="field" data-sf-pick="${esc(key)}" aria-label="내려받을 양식">
      <option value="">쌤비서 기본 문서</option>${C.list.map(f => `<option value="${esc(f.id)}"${f.id === id ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>` : '';
  const add = `<button class="btn text" type="button" data-sf-add="${esc(key)}"${C.adding ? ' disabled' : ''}>${C.adding ? '<span class="spin"></span>양식 읽는 중' : '학교 양식 넣기'}</button>`;
  return pick + (id ? `<button class="btn primary" type="button" data-sf-export="${esc(key)}">학교 양식으로 한글 내려받기</button>` : fallback) + add;
}
export function formSlotHTML(key, fallbackHTML) {
  return `<span class="sf-slot" data-sf="${esc(key)}" data-sf-fb="${esc(fallbackHTML)}">${inner(key, fallbackHTML)}</span>`;
}
function paint() {
  if (typeof document === 'undefined') return;
  // 「양식」 고르기를 키보드(화살표)로 바꾸는 중이면 다시 그린 뒤에도 그 칸에 초점(이어서 고를 수 있게)
  const a = document.activeElement, k = a && a.matches && a.matches('select[data-sf-pick]') ? a.dataset.sfPick : null;
  document.querySelectorAll('.sf-slot').forEach(el => { el.innerHTML = inner(el.dataset.sf, el.dataset.sfFb || ''); });
  if (k) { const s = [...document.querySelectorAll('select[data-sf-pick]')].find(x => x.dataset.sfPick === k); if (s) s.focus(); }
}
async function load() {
  if (C.loading) return;
  C.loading = true;
  try { C.list = (await (await forms()).list()).filter(f => f.kind === 'hwpx'); } catch (e) { C.list = []; }
  C.loading = false;
  paint();
}

/* 양식 넣기에서 못 넣은 까닭 → 알림 글 */
const FORM_ERR = {
  NOT_HWPX: '학교 양식은 한글에서 「.hwpx」로 저장한 파일을 넣어 주세요.',
  TOO_BIG: '양식 파일이 5MB보다 커요. 그림을 줄여 다시 저장해 주세요.',
  READ: '양식 파일을 읽지 못했어요. 한글(.hwpx) 파일을 넣어 주세요.'
};
export const formError = code => FORM_ERR[code] || FORM_ERR.READ;
/* 이 문서 종류(key)에 골라 둔 양식 id('' = 쌤비서 기본 문서), 고르기 */
export const pickedForm = key => String(get(KEY(key), '') || '');
export function pickForm(key, id) { set(KEY(key), String(id || '')); paint(); }

/* .hwpx 양식(바이트)을 학교 양식 저장소에 넣음 → { rec, ok(제목·본문 자리를 찾음), picked(이 종류에 골라 둠) }.
   replace: 같은 이름 양식이 있으면 그 자리에 바꿔 넣음. pick: true(늘 골라 둠) · 'empty'(이 종류에 고른 양식이 없고 제목·본문 자리를 찾았을 때만 — 저절로 고른 양식 때문에 내려받기가 막히지 않게) · false.
   .hwpx가 아니면 { code: 'NOT_HWPX' }, 5MB가 넘으면 { code: 'TOO_BIG' }, 못 읽으면 { code: 'READ' }를 던짐 */
export async function saveForm(key, u8, name, { pick = true, replace = false } = {}) {
  if (!(u8 && u8[0] === 0x50 && u8[1] === 0x4B)) throw { code: 'NOT_HWPX' };
  if (u8.length > MAX_FORM) throw { code: 'TOO_BIG' };
  let parsed;
  try { parsed = await readForm(u8); } catch (e) { throw { code: 'READ' }; }
  const st = await forms(), list = (await st.list()).filter(f => f.kind === 'hwpx');
  const nm = String(name || '').trim() || '학교 양식';
  const same = replace ? list.find(f => f.name === nm) : null;
  const rec = { id: same ? same.id : newFormId(), name: nm, kind: 'hwpx', bytes: u8, roles: findRoles(parsed.lines), savedAt: Date.now() };
  await st.put(rec);
  const cur = pickedForm(key), ok = rolesValid(rec.roles, { date: false });
  const picked = pick === true || (pick === 'empty' && ok && !list.some(f => f.id === cur));
  if (picked) set(KEY(key), rec.id);
  try { C.list = (await st.list()).filter(f => f.kind === 'hwpx'); } catch (e) { C.list = null; }
  paint();
  return { rec, ok, picked };
}

/* 양식 넣기: .hwpx만(모양 그대로 채움). 제목·본문 자리를 못 찾으면 문서·소통 › 가정통신문 › [양식 맞추기]에서 */
async function addForm(key, file) {
  C.adding++; paint();
  try {
    const u8 = new Uint8Array(await file.arrayBuffer());
    const { rec, ok } = await saveForm(key, u8, String(file.name || '학교 양식').replace(/\.[^.]+$/, ''));
    toast(ok ? `「${rec.name}」 양식을 넣었어요. 이 양식으로 내려받아요.` : `「${rec.name}」 양식을 넣었어요. 제목·본문 자리를 문서·소통 › 가정통신문 › [양식 맞추기]에서 정해 주세요.`, 7000);
  } catch (e) { toast(formError(e && e.code), 6000); }
  finally { C.adding = Math.max(0, C.adding - 1); if (C.list) paint(); else load(); }
}

/* 고른 양식에 문서를 채워 내려받기 → 알림 글. date('YYYY-MM-DD'): 날짜 자리에 넣을 날(회의록은 회의 날), 없으면 오늘 */
export async function exportToForm(id, doc, name, date = '') {
  const rec = await (await forms()).get(id);
  if (!rec || rec.kind !== 'hwpx') { C.list = null; load(); return '양식을 찾지 못했어요. 기본 문서로 내려받아 주세요.'; }
  if (!rolesValid(rec.roles, { date: false })) return '이 양식의 제목·본문 자리를 문서·소통 › 가정통신문 › [양식 맞추기]에서 정해 주세요.';
  const parsed = await readForm(rec.bytes);
  const t = new Date(), iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  const { bytes, warn } = await fillForm(parsed, rec.roles, { ...docToLetter(doc), date: /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : iso, reply: null });
  const where = await saveFile(`${String(name || doc.title || '계획서').replace(/[\\/:*?"<>|]/g, '_')}.hwpx`, bytes, 'application/hwp+zip');
  return (globalThis.window && window.__TAURI__ ? `다운로드 폴더에 저장했어요: ${String(where).split(/[\\/]/).pop()}` : `「${rec.name}」 양식으로 한글 파일을 내려받았어요`)
    + (warn.includes('no-border') ? ' · 이 양식에는 표 테두리를 더할 수 없어 표는 글로 넣었어요' : '');
}

if (typeof document !== 'undefined' && !globalThis.__ssamSchoolForm) {
  globalThis.__ssamSchoolForm = 1;
  let input = null;
  document.addEventListener('change', e => {
    const s = e.target && e.target.closest && e.target.closest('select[data-sf-pick]');
    if (!s) return;
    set(KEY(s.dataset.sfPick), s.value);
    paint();
  });
  document.addEventListener('click', async e => {
    const add = e.target && e.target.closest && e.target.closest('[data-sf-add]');
    if (add) {
      if (!input) { input = Object.assign(document.createElement('input'), { type: 'file', accept: '.hwpx', hidden: true, id: 'sfFile' }); document.body.append(input); }
      input.dataset.key = add.dataset.sfAdd;
      input.onchange = () => { const f = input.files && input.files[0]; input.value = ''; if (f) addForm(input.dataset.key, f); };
      input.click();
      return;
    }
    const b = e.target && e.target.closest && e.target.closest('[data-sf-export]');
    if (!b) return;
    const key = b.dataset.sfExport, fn = docs.get(key), id = chosen(key);
    const x = fn && fn();
    if (!x || !x.doc || !id) { toast('내려받을 문서가 없어요.', 4000); return; }
    b.disabled = true;
    try { toast(await exportToForm(id, x.doc, x.name, x.date), 7000); }
    catch (err) { toast(`한글 파일을 만들지 못했어요: ${String((err && err.message) || err || '').slice(0, 80)}`, 7000); }
    finally { b.disabled = false; }
  });
  // 다른 메뉴(가정통신문 등)에서 양식을 넣거나 지웠을 수 있어 메뉴를 옮기면 목록을 다시 읽음
  document.addEventListener('menu:go', () => { C.list = null; });
}
