// 행사계획 참고 자료: 붙여넣기·연간계획·파일로 넣기, 구성안·문서 프롬프트에 들어감, 「참고 자료에서 반영한 것」, 확정 풀림, AI가 도는 동안 행사 바꾸기
import { join } from 'node:path';
import { open, run, assert, mockClaude, ROOT } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
let slow = 0;
const prompts = [];
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  if (slow) await new Promise(r => setTimeout(r, slow));
  if (prompt.startsWith('[행사 구성안]')) return JSON.stringify({ options: [{ label: '새로운 안', summary: '요약', timetable: [{ time: '09:00', activity: '개회식', place: '운동장' }], pros: ['a'], staffNeed: '2명', budget: [] }], refNotes: ['안전요원 2명 배치'] });
  if (prompt.startsWith('[행사 문서]')) return JSON.stringify({ plan: '계획', roles: [], safety: '- 안전', letter: '날짜 준비물 복장 문의', rain: '강당', refNotes: ['참가 대상 3~6학년'] });
  return '{}';
});
const V = 'section[data-menu="plan"]';
const go = async () => { await page.click('nav.app-side [data-menu-go="plan"]'); await page.click('#menuTabs [data-tab="event"]'); };
const seed = (evs, cur) => page.evaluate(async ([evs, cur]) => {
  (await import('./core/store.js')).flushAll(); // 화면이 미뤄 둔 저장이 나중에 덮지 않게
  localStorage.removeItem('ssam:events');
  const m = await import('./menus/plan/event-model.js');
  const ids = evs.map(e => m.saveEvent({ ...m.newEvent(), ...e }).id);
  m.setCurrentEvent(ids[cur]);
  return ids;
}, [evs, cur]);
const getEv = id => page.evaluate(async id => (await import('./menus/plan/event-model.js')).getEvent(id), id);
const base = (name, extra = {}) => ({ name, grades: '3~6학년', date: '2027-05-06', place: '운동장', outdoor: false, ...extra });
await page.goto(url);
await page.waitForTimeout(400);

let A, B;
await run('event-refs', [
  ['붙여넣기로 교육청 공문 넣기', async () => {
    [A, B] = await seed([base('가을 운동회'), base('봄 소풍')], 0);
    await page.evaluate(async () => { const y = await import('./menus/plan/year-model.js'); y.savePlan({ ...y.newPlan(), name: '체육 교육', goal: '체력 기르기' }); });
    await page.reload(); await page.waitForTimeout(400); await go();
    await page.click(`${V} [data-e="refPaste"]`);
    await page.selectOption('#sheetRoot #evRefKind', 'official');
    await page.fill('#sheetRoot #evRefName', '도교육청 체육행사 안내');
    await page.fill('#sheetRoot #evRefText', '참가 대상: 3~6학년\n안전요원 2명 이상 배치');
    await page.click('#sheetRoot #evRefOk');
    await page.waitForSelector(`${V} [data-ref]`);
    const e = await getEv(A);
    assert(e.refs.length === 1 && e.refs[0].kind === 'official' && e.refs[0].name === '도교육청 체육행사 안내', JSON.stringify(e.refs));
  }],
  ['연간계획에서 불러오기 → 상위 계획', async () => {
    await page.click(`${V} [data-e="refPlan"]`);
    await page.click(`${V} [data-refplan]`);
    await page.waitForFunction(() => document.querySelectorAll('[data-ref]').length === 2);
    const e = await getEv(A);
    assert(e.refs[1].kind === 'upper' && e.refs[1].text.includes('체육 교육'), JSON.stringify(e.refs[1]).slice(0, 100));
  }],
  ['파일 넣기 → 이름·종류 짐작', async () => {
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${V} [data-e="refFile"]`)]);
    await fc.setFiles(join(ROOT, 'samples', '품의-예시.hwpx'));
    await page.waitForFunction(() => document.querySelectorAll('[data-ref]').length === 3);
    const e = await getEv(A);
    assert(e.refs[2].name === '품의-예시.hwpx' && e.refs[2].kind === 'other' && e.refs[2].text.length > 20, JSON.stringify(e.refs[2]).slice(0, 100));
  }],
  ['종류 바꾸기·보기·고치기', async () => {
    const id = (await getEv(A)).refs[2].id;
    await page.selectOption(`${V} select[data-refkind="${id}"]`, 'upper');
    assert((await getEv(A)).refs[2].kind === 'upper', '종류');
    await page.click(`${V} [data-e="refView"][data-id="${id}"]`);
    await page.fill('#sheetRoot #evRefName', '학교 예산 안내');
    await page.click('#sheetRoot #evRefOk');
    await page.waitForTimeout(100);
    assert((await getEv(A)).refs[2].name === '학교 예산 안내', '이름');
  }],
  ['구성안 프롬프트에 참고 자료, 반영한 것이 보임', async () => {
    await page.click(`${V} [data-e="next"]`);
    await page.waitForSelector(`${V} .ev-refnotes`);
    const pr = prompts.filter(p => p.startsWith('[행사 구성안]')).at(-1);
    assert(pr.includes('[교육청 공문] 도교육청 체육행사 안내') && pr.includes('안전요원 2명 이상') && /\[상위 계획\] \d{4}학년도 체육 교육/.test(pr) && pr.includes('refNotes'), pr.slice(0, 200));
    assert((await page.textContent(`${V} .ev-refnotes`)).includes('안전요원 2명 배치'), '반영한 것');
  }],
  ['문서 프롬프트에도, 3단계에 반영한 것', async () => {
    await page.click(`${V} [data-pick="0"]`);
    await page.click(`${V} [data-e="next"]`);
    await page.click(`${V} [data-e="docs"]`);
    await page.waitForFunction(() => document.querySelector('.ev-refnotes') && document.querySelector('.ev-refnotes').textContent.includes('참가 대상 3~6학년'));
    const pr = prompts.filter(p => p.startsWith('[행사 문서]')).at(-1);
    assert(pr.includes('안전요원 2명 이상'), '문서 프롬프트');
    assert((await getEv(A)).refNotes.docs[0] === '참가 대상 3~6학년', '저장');
  }],
  ['확정한 행사에서 참고 자료를 빼면 「작성 중」', async () => {
    const [x] = await seed([base('학예회', { status: 'final', refs: [{ id: 'r1', kind: 'official', name: '공문', text: '내용' }] })], 0);
    await page.reload(); await page.waitForTimeout(400); await go();
    await page.click(`${V} [data-e="refDel"][data-id="r1"]`);
    await page.waitForTimeout(100);
    const e = await getEv(x);
    assert(e.refs.length === 0 && e.status === 'draft', JSON.stringify({ n: e.refs.length, s: e.status }));
  }],
  ['AI가 도는 동안 다른 행사로 가도 반영한 것은 시작한 행사에', async () => {
    [A, B] = await seed([base('가을 운동회', { refs: [{ id: 'r', kind: 'official', name: '공문', text: '안전요원' }] }), base('봄 소풍')], 0);
    await page.reload(); await page.waitForTimeout(400); await go();
    slow = 1000;
    await page.click(`${V} [data-e="next"]`);
    await page.click(`${V} #evList [data-ev="${B}"]`);
    await page.waitForTimeout(1500); slow = 0;
    assert((await getEv(A)).refNotes.options[0] === '안전요원 2명 배치', 'A에 없음');
    assert((await getEv(B)).refNotes.options.length === 0, 'B에 섞임');
  }],
  ['다듬기: 참고 자료를 바꾸면 「반영한 것」에 다시 만들라는 안내', async () => {
    const [x] = await seed([base('학예회', { maxStep: 2, refs: [{ id: 'r1', kind: 'official', name: '공문', text: '안전요원 배치' }], refNotes: { options: ['안전요원 2명 배치'], docs: [] },
      options: [{ label: '안', summary: '요약', timetable: [{ time: '09:00', activity: '개회', place: '강당' }], pros: ['a'], staffNeed: '1명', budget: [] }] })], 0);
    await page.reload(); await page.waitForTimeout(400); await go();
    await page.click(`${V} [data-e="refDel"][data-id="r1"]`);
    await page.click(`${V} .steps [data-step="2"]`);
    await page.waitForSelector(`${V} .ev-refnotes`);
    assert((await page.textContent(`${V} .ev-refnotes`)).includes('참고 자료를 바꿨어요'), await page.textContent(`${V} .ev-refnotes`));
    assert((await getEv(x)).refNotes.stale === true, '저장');
  }],
  ['다듬기: 글이 없는 파일은 넣지 않고 알려 줌, 고칠 때 6만 자를 넘으면 알려 줌', async () => {
    await page.click(`${V} .steps [data-step="1"]`);
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${V} [data-e="refFile"]`)]);
    await fc.setFiles({ name: '빈.txt', mimeType: 'text/plain', buffer: Buffer.from('   ') });
    await page.waitForTimeout(300);
    assert((await page.textContent('#toast')).includes('글이 없'), await page.textContent('#toast'));
    await page.click(`${V} [data-e="refPaste"]`);
    await page.fill('#sheetRoot #evRefText', '가'.repeat(100));
    await page.click('#sheetRoot #evRefOk');
    await page.waitForSelector(`${V} [data-e="refView"]`);
    await page.click(`${V} [data-e="refView"]`);
    await page.fill('#sheetRoot #evRefText', '나'.repeat(70000));
    await page.click('#sheetRoot #evRefOk');
    await page.waitForTimeout(150);
    assert((await page.textContent('#toast')).includes('6만 자'), await page.textContent('#toast'));
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
