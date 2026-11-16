// 계획서 「새 서식으로 바꾸기」 + 작년 계획서 서식 함께 저장 (스펙 2026-11-15 1B): 연간·행사·학급운영계획.
// 작년 계획서를 .hwpx로 넣으면 학교 양식 「작년 계획서 서식 · 파일 이름」으로 저장(고른 양식이 없으면 골라 둠), .hwp·PDF면 .hwpx 안내.
// 내려받기 줄 [새 서식으로 바꾸기] → 새 서식 큰 제목에 초안 칸을 맞춘 미리 보기(옛 칸 이름·AI가 새로 씀·옮길 곳 없음 [이 칸에 붙이기] — 기본은 가까운 칸에 붙여 둠) → [이대로 바꾸기]·[되돌리기]
import { join } from 'node:path';
import { open, run, assert, mockClaude, ROOT } from './helpers.mjs';
import { makeHwpx } from '../../web/core/hwpx.js';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2027-01-12T09:00:00'));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const prompts = [];
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  if (prompt.startsWith('[새 서식 맞추기]')) {
    if (prompt.includes('(연간계획)')) return JSON.stringify({ map: [{ to: 'n4', from: ['o1'] }], write: [{ to: 'n7', text: '가. 학교 누리집에 〔이름1〕 선생님이 독서 소식을 올린다.' }] });
    if (prompt.includes('(행사계획)')) return JSON.stringify({ map: [{ to: 'n4', from: ['o4'] }, { to: 'n2', from: ['zz'] }], write: [{ to: 'n1', text: '가. 협동심을 기른다.' }] });
    if (prompt.includes('(학급운영계획)')) return JSON.stringify({ map: [], write: [{ to: 'n5', text: '학부모 상담 주간을 운영한다.' }] });
  }
  if (prompt.startsWith('[연간계획 초안]')) return JSON.stringify({ purpose: '다시 쓴 목적', policy: '다시 쓴 방침', details: '다시 쓴 세부', evaluation: '다시 쓴 평가', x1: '다시 쓴 홍보',
    schedule: [{ title: '계획 수립', date: '2027-03-10' }], budget: [{ name: '도서 구입', amount: 500000, note: '' }] });
  return '{}';
});
const P = 'section[data-menu="plan"]';
const hwpx = (title, heads, extra = []) => Buffer.from(makeHwpx({ title, blocks: [
  { type: 'table', rows: [['결재', '담당', '부장', '교감']] }, ...heads.flatMap(h => [{ type: 'h', text: h }, { type: 'p', text: '(내용을 적어요)' }]), ...extra,
  { type: 'p', text: '2027. 3. 2.' }, { type: 'p', text: '새싹초등학교장' }] }));
const file = (name, buffer) => ({ name, mimeType: 'application/octet-stream', buffer });
const LAST_YEAR = hwpx('2026학년도 독서교육 운영 계획', ['Ⅰ. 추진 근거', 'Ⅱ. 목적', 'Ⅲ. 운영 방침', 'Ⅳ. 세부 추진 내용']);
const NEW_YEAR = hwpx('새싹초등학교 업무 계획서', ['Ⅰ. 목적', 'Ⅱ. 추진 방침', 'Ⅲ. 세부 추진 계획', 'Ⅳ. 월별 추진 일정', 'Ⅴ. 소요 예산', 'Ⅵ. 평가', 'Ⅶ. 홍보 계획']);
const FEW = Buffer.from(makeHwpx({ title: '새싹초 안내 양식', blocks: [{ type: 'p', text: '옛 본문' }, { type: 'p', text: '2027. 3. 2.' }, { type: 'p', text: '새싹초등학교장' }] }));
const NEW_EVENT = hwpx('새싹초등학교 행사 계획서', ['1. 추진 목적', '2. 운영 개요', '3. 세부 운영 계획', '4. 안전 관리', '5. 평가 및 환류']);
const NEW_CLASS = hwpx('새싹초등학교 학급 교육과정 운영 계획', ['Ⅰ. 학급 교육 목표', 'Ⅱ. 학급 현황 및 조직', 'Ⅲ. 평가 계획', 'Ⅳ. 월별 운영 계획', 'Ⅴ. 학부모 소통']);

const toastHas = s => page.waitForFunction(x => (document.querySelector('#toast') || {}).textContent?.includes(x), s, { timeout: 8000 });
const formsList = () => page.evaluate(async () => (await (await import('./core/form-store.js')).forms()).list());
const picked = key => page.evaluate(k => JSON.parse(localStorage.getItem('ssam:form:' + k) || '""'), key);
const formId = async name => ((await formsList()).find(f => f.name === name) || {}).id;
const upload = async (sel, f) => { const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(sel)]); await fc.setFiles(f); };
const goTab = async tab => { await page.evaluate(x => import('./core/shell.js').then(s => s.go('plan', x)), tab); await page.waitForTimeout(150); };
const clickStep = n => page.evaluate(n => { const b = [...document.querySelectorAll('section[data-menu="plan"] ol.steps [data-step="' + n + '"]')].find(x => x.checkVisibility()); if (b) b.click(); }, String(n));
const visibleSel = sel => page.evaluate(s => [...document.querySelectorAll(s)].filter(x => x.checkVisibility()).length, sel);
const clickVisible = sel => page.evaluate(s => { const b = [...document.querySelectorAll(s)].find(x => x.checkVisibility()); if (!b) throw new Error('없음: ' + s); b.click(); }, sel);
const uploadVisible = async (sel, f) => { const [fc] = await Promise.all([page.waitForEvent('filechooser'), clickVisible(sel)]); await fc.setFiles(f); };
const mapTexts = () => page.$$eval('#rfMap li', ls => ls.map(l => l.textContent.replace(/\s+/g, ' ').trim()));

await page.goto(url);
await page.waitForTimeout(400);

let YP, EV, CP, lastYearId;
await run('plan-reform', [
  ['연간계획 1단계: 작년 계획서 .hwpx → 학교 양식 「작년 계획서 서식 · 파일 이름」으로 저장해 골라 둠(같은 이름은 바꿈), 알림 한 줄', async () => {
    await goTab('year');
    await page.waitForSelector(`${P} #ypName`);
    await page.fill(`${P} #ypName`, '독서교육');
    await page.fill(`${P} #ypGoal`, '스스로 책을 고르고 즐기는 독서 습관을 기른다.');
    await upload(`${P} [data-file="lastPlan"]`, file('2026 독서교육 계획.hwpx', LAST_YEAR));
    await toastHas('작년 계획서 서식');
    const tx = await page.textContent('#toast');
    assert(tx.includes('골라 두었어요') && tx.includes('「작년 계획서 서식 · 2026 독서교육 계획」'), tx);
    lastYearId = await formId('작년 계획서 서식 · 2026 독서교육 계획');
    assert(lastYearId && (await picked('year')) === lastYearId, '골라 둠');
    assert((await page.inputValue(`${P} textarea[data-src="lastPlan"]`)).includes('Ⅱ. 목적'), '글도 넣음');
    await upload(`${P} [data-file="lastPlan"]`, file('2026 독서교육 계획.hwpx', LAST_YEAR));
    await page.waitForFunction(() => (document.querySelector('section[data-menu="plan"] .yp-files[data-for="lastPlan"]') || {}).textContent?.split('2026 독서교육 계획.hwpx').length === 3);
    await page.waitForTimeout(200);
    assert((await formsList()).filter(f => f.name === '작년 계획서 서식 · 2026 독서교육 계획').length === 1, '같은 이름은 하나');
  }],
  ['작년 계획서가 PDF면 「한글에서 .hwpx로 저장해 넣으면 모양까지 따라가요」', async () => {
    await upload(`${P} [data-file="lastPlan"]`, join(ROOT, 'samples', '단원평가-답안-예시.pdf'));
    await toastHas('한글에서 .hwpx로 저장해 넣으면 모양까지 따라가요');
    assert((await formsList()).length === 1, 'PDF는 양식으로 저장하지 않음');
  }],
  ['연간계획 5단계: 내려받기 줄에 [새 서식으로 바꾸기] → 미리 보기(옛 칸 이름·AI가 새로 씀·옮길 곳 없음), AI에는 이름·전화번호를 가려 보냄', async () => {
    YP = await page.evaluate(async () => {
      (await import('./core/store.js')).flushAll();
      const y = await import('./menus/plan/year-model.js');
      const LAST = 'Ⅰ. 추진 근거\nⅡ. 목적\nⅢ. 운영 방침\nⅣ. 세부 추진 내용\nⅤ. 추진 일정\nⅥ. 소요 예산\nⅦ. 기대 효과';
      const o = y.yearOutline(LAST);
      const p = y.savePlan({ ...y.newPlan(), year: 2027, name: '독서 교육', goal: '독서 습관', step: 5, maxStep: 5, sources: { lastPlan: LAST, lastResult: '', guide: '지침' },
        guide: [{ item: '누리집 홍보', keywords: ['누리집'], sentence: '학교 누리집에 올린다.', section: 'details' }],
        draft: y.normDraft({ x1: '1. 2027 독서교육 기본계획\n문의: 교무부 이바다 선생님 041-123-4567', purpose: '책을 즐겨 읽는 습관을 기른다.', policy: '가. 전교생이 참여한다.', details: '1. 아침 독서', evaluation: '독서량이 는다.',
          schedule: [{ title: '계획 수립', date: '2027-03-10' }], budget: [{ name: '도서 구입', amount: 500000, note: '' }], outline: o.items, roman: o.roman }) });
      y.setCurrent(p.id);
      return p.id;
    });
    await page.reload(); await page.waitForTimeout(400);
    await goTab('year');
    await page.click(`${P} [data-yp="${YP}"]`);
    await clickStep(5);
    await page.waitForSelector(`${P} .yp-out [data-rf="year"]`);
    assert(await page.locator(`${P} .yp-out [data-rf-undo="year"]`).count() === 0, '바꾸기 전에는 되돌리기 없음');
    await upload(`${P} [data-rf="year"]`, file('새싹초 새 서식.hwpx', NEW_YEAR));
    await page.waitForSelector('#rfSheet #rfMap');
    const m = await mapTexts();
    assert(m.length === 7, m.join(' / '));
    assert(m[0].startsWith('Ⅰ. 목적') && m[0].includes('← 추진 근거 · 목적'), '옮길 곳 없는 추진 근거는 바로 뒤 목적이 간 칸에 붙여 둠: ' + m[0]);
    assert(m[1].includes('← 운영 방침') && m[3].includes('← 추진 일정') && m[5].includes('← 기대 효과'), m.join(' / '));
    assert(m[6].includes('Ⅶ. 홍보 계획') && m[6].includes('AI가 새로 씀') && m[6].includes('이바다 선생님이 독서 소식'), m[6]);
    const orph = await page.$$eval('#rfOrphans li b', bs => bs.map(b => b.textContent));
    assert(orph.join('|') === '추진 근거', '일정 표 칸으로 옮기라는 AI 답은 버려 옮길 곳 없음: ' + orph.join('|'));
    const opts = await page.$$eval('#rfOrphans select[data-rf-attach] option', os => os.map(o => o.textContent));
    assert(opts[0] === '붙이지 않음' && !opts.some(o => o.includes('일정') || o.includes('예산')) && opts.length === 6, '표 칸에는 글 칸을 붙이지 않음: ' + opts.join('|'));
    assert(await page.$eval('#rfOrphans select[data-rf-attach="o1"]', s => s.value) === '0', '기본은 붙여 둠(붙이지 않음이 아님)');
    const pr = prompts.filter(p => p.startsWith('[새 서식 맞추기]')).at(-1);
    assert(pr && pr.includes('[o1] 추진 근거') && pr.includes('[n7] 홍보 계획') && pr.includes('〔이름1〕') && pr.includes('{{1}}'), pr && pr.slice(0, 600));
    assert(!pr.includes('이바다') && !pr.includes('041-123-4567'), '이름·전화번호가 AI로 감');
    assert(await page.isVisible('#rfSheet .ai-note'), 'AI로 가는 것 안내');
  }],
  ['[이 칸에 붙이기] → [이대로 바꾸기]: 초안이 새 차례(글·덧붙임 칸), 그 서식을 학교 양식으로 저장해 골라 둠, [되돌리기]가 생김', async () => {
    await page.selectOption('#rfOrphans select[data-rf-attach="o1"]', '-1');
    assert(!(await mapTexts())[0].includes('추진 근거'), '「붙이지 않음」');
    await page.selectOption('#rfOrphans select[data-rf-attach="o1"]', '0');
    assert((await mapTexts())[0].includes('추진 근거'), '붙인 칸 표시');
    await page.click('#rfSheet [data-rf-ok]');
    await page.waitForSelector('#rfSheet', { state: 'detached' });
    await toastHas('새 서식 차례로 바꿨어요');
    const p = await page.evaluate(async id => (await import('./menus/plan/year-model.js')).getPlan(id), YP);
    assert(p.draft.outline.map(o => o.title).join('|') === '목적|추진 방침|세부 추진 계획|월별 추진 일정|소요 예산|평가|홍보 계획', p.draft.outline.map(o => o.title).join('|'));
    assert(p.draft.fromForm === true && p.draft.purpose.startsWith('1. 2027 독서교육 기본계획') && p.draft.purpose.includes('책을 즐겨 읽는') && p.draft.purpose.includes('이바다 선생님 041-123-4567'), '옛 차례대로: ' + p.draft.purpose);
    assert(p.draft.x1 === '가. 학교 누리집에 이바다 선생님이 독서 소식을 올린다.', p.draft.x1);
    const nf = await formId('새싹초 새 서식');
    assert(nf && (await picked('year')) === nf, '새 서식을 골라 둠');
    await page.waitForSelector(`${P} .yp-out [data-rf-undo="year"]`);
    assert(await page.$eval(`${P} select[data-sf-pick="year"]`, s => s.options[s.selectedIndex].textContent) === '새싹초 새 서식', '내려받기 양식');
  }],
  ['새 차례로 지침 점검(반영됨)·4단계 칸 제목, 학교 양식 내려받기에 새 제목·새로 쓴 글(서식의 안내 글은 없음)', async () => {
    await clickStep(3);
    await page.waitForSelector(`${P} #ypGuide li`);
    assert(await page.$eval(`${P} #ypGuide li`, li => li.className) === 'in', '누리집 항목 반영됨');
    await clickStep(4);
    await page.waitForSelector(`${P} #ypDraft`);
    const heads = await page.$$eval(`${P} #ypDraft .yp-sec-h h3`, hs => hs.map(h => h.textContent.trim()));
    assert(heads.join('|') === 'Ⅰ. 목적|Ⅱ. 추진 방침|Ⅲ. 세부 추진 계획|Ⅳ. 월별 추진 일정|Ⅴ. 소요 예산|Ⅵ. 평가|Ⅶ. 홍보 계획', heads.join('|'));
    assert((await page.textContent(`${P} #ypOutlineUsed`)).includes('새 서식'), '새 서식 차례 안내');
    await clickStep(5);
    await page.waitForSelector(`${P} [data-sf-export="year"]`);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${P} [data-sf-export="year"]`)]);
    const buf = await (async () => { const s = await dl.createReadStream(); const parts = []; for await (const c of s) parts.push(c); return Buffer.concat(parts); })();
    const lines = await page.evaluate(async b64 => (await (await import('./core/hwpx-form.js')).readForm(Uint8Array.from(atob(b64), c => c.charCodeAt(0)))).lines.map(l => l.text), buf.toString('base64'));
    const all = lines.join('\n');
    assert(all.includes('Ⅶ. 홍보 계획') && all.includes('이바다 선생님이 독서 소식') && all.includes('결재') && all.includes('새싹초등학교장'), all.slice(0, 500));
    assert(!all.includes('(내용을 적어요)'), '서식의 안내 글이 남음');
  }],
  ['4단계 [다시 만들기]도 새 서식 차례 그대로(AI에 학교 새 서식 목차를 보냄)', async () => {
    await clickStep(4);
    await page.click(`${P} [data-y="draft"]`);
    await page.waitForFunction(() => (document.querySelector('section[data-menu="plan"] textarea[data-sec="x1"]') || {}).value === '다시 쓴 홍보');
    const heads = await page.$$eval(`${P} #ypDraft .yp-sec-h h3`, hs => hs.map(h => h.textContent.trim()));
    assert(heads.join('|') === 'Ⅰ. 목적|Ⅱ. 추진 방침|Ⅲ. 세부 추진 계획|Ⅳ. 월별 추진 일정|Ⅴ. 소요 예산|Ⅵ. 평가|Ⅶ. 홍보 계획', heads.join('|'));
    const pr = prompts.filter(p => p.startsWith('[연간계획 초안]')).at(-1);
    assert(pr.includes('학교 새 서식 목차') && pr.includes('7. 홍보 계획 → x1') && pr.includes('"x1":"…"'), pr.slice(pr.indexOf('목차'), pr.indexOf('목차') + 300));
    await clickStep(5);
    await page.waitForSelector(`${P} [data-rf-undo="year"]`);
  }],
  ['[되돌리기]: 바꾸기 전 초안(옛 차례)과 그 전에 고른 양식으로, 되돌리기는 한 단계 — 바꾼 뒤 고친 일정 날짜는 그대로', async () => {
    // 바꾼 뒤 같은 화면 일정 표에서 날짜를 고침(바꾸기와 상관없는 표)
    await page.fill(`${P} #ypDays input[data-date="0"]`, '2027-03-17');
    await page.dispatchEvent(`${P} #ypDays input[data-date="0"]`, 'change');
    await page.click(`${P} [data-rf-undo="year"]`);
    await toastHas('되돌렸어요');
    const p = await page.evaluate(async id => (await import('./menus/plan/year-model.js')).getPlan(id), YP);
    assert(p.draft.schedule[0].date === '2027-03-17', '고친 일정 날짜가 바꾸기 전으로 돌아감: ' + JSON.stringify(p.draft.schedule));
    assert(await page.inputValue(`${P} #ypDays input[data-date="0"]`) === '2027-03-17', '화면 일정 날짜');
    assert(p.draft.outline.map(o => o.title).join('|') === '추진 근거|목적|운영 방침|세부 추진 내용|추진 일정|소요 예산|기대 효과', p.draft.outline.map(o => o.title).join('|'));
    assert(!p.draft.fromForm && p.draft.x1.includes('기본계획'), JSON.stringify(p.draft).slice(0, 200));
    assert((await picked('year')) === lastYearId, '그 전에 고른 양식');
    assert(await page.locator(`${P} [data-rf-undo="year"]`).count() === 0, '한 단계');
  }],
  ['큰 제목이 셋보다 적은 서식: 「큰 제목을 찾지 못해 양식으로만 저장했어요」, 초안은 그대로', async () => {
    await upload(`${P} [data-rf="year"]`, file('새싹초 안내 양식.hwpx', FEW));
    await toastHas('큰 제목을 찾지 못해 양식으로만 저장했어요');
    assert(await page.locator('#rfSheet').count() === 0, '미리 보기 없음');
    assert((await picked('year')) === (await formId('새싹초 안내 양식')), '양식으로 골라 둠');
    const p = await page.evaluate(async id => (await import('./menus/plan/year-model.js')).getPlan(id), YP);
    assert(p.draft.outline.length === 7 && p.draft.outline[0].title === '추진 근거', '초안 그대로');
  }],
  ['행사계획 참고 자료: 「작년·기존 계획서」 .hwpx → 서식 저장·골라 둠, 종류를 나중에 「작년·기존 계획서」로 바꿔도 저장', async () => {
    EV = await page.evaluate(async () => {
      (await import('./core/store.js')).flushAll();
      const m = await import('./menus/plan/event-model.js');
      const plan = '2027 가을 운동회 운영 계획\nⅠ. 개요\n가. 일시: 2027. 5. 6.\nⅡ. 운영 방침\n가. 모두가 즐기는 운동회\nⅢ. 세부 운영\n1. 경기 종목\nⅣ. 안전 대책\n가. 보건실 운영\nⅤ. 평가\n가. 만족도 조사';
      const e = m.saveEvent({ ...m.newEvent(), name: '가을 운동회', grades: '3~6학년', date: '2027-05-06', place: '운동장', step: 1, maxStep: 3, docs: { plan, safety: '- 안전', letter: '날짜 준비물 복장 문의', rain: '', done: false },
        rv: [{ section: 'plan', problem: '목적이 흐려요', fix: '고친 계획서' }, { section: 'letter', problem: '문의처가 없어요', fix: '옛 글로 쓴 가정통신문 수정안' }] });
      m.setCurrentEvent(e.id);
      return e.id;
    });
    await page.reload(); await page.waitForTimeout(400);
    await goTab('event');
    await page.click(`${P} [data-ev="${EV}"]`);
    await page.waitForSelector(`${P} [data-e="refFile"]`);
    await upload(`${P} [data-e="refFile"]`, file('2026 작년 운동회 계획서.hwpx', hwpx('2026 가을 운동회 운영 계획', ['Ⅰ. 개요', 'Ⅱ. 운영 방침', 'Ⅲ. 세부 운영'])));
    await toastHas('작년 계획서 서식');
    assert((await picked('event')) === (await formId('작년 계획서 서식 · 2026 작년 운동회 계획서')), '행사계획에 골라 둠');
    await upload(`${P} [data-e="refFile"]`, file('운동회 계획 참고.hwpx', hwpx('참고', ['Ⅰ. 가', 'Ⅱ. 나', 'Ⅲ. 다'])));
    await page.waitForFunction(() => document.querySelectorAll('section[data-menu="plan"] select[data-refkind]').length === 2);
    const sel = `${P} .ev-refs li:nth-child(2) select[data-refkind]`;
    assert(await page.$eval(sel, s => s.value) !== 'last', '이름으로는 작년 계획서가 아님');
    assert(!(await formId('작년 계획서 서식 · 운동회 계획 참고')), '아직 저장하지 않음');
    await page.selectOption(sel, 'last');
    await toastHas('작년 계획서 서식 · 운동회 계획 참고');
    assert((await picked('event')) === (await formId('작년 계획서 서식 · 2026 작년 운동회 계획서')), '이미 고른 양식이 있으면 그대로');
  }],
  ['행사계획 3단계 계획서 탭에 [새 서식으로 바꾸기] → 계획서 글이 새 제목 줄로, 한글 파일도 그 차례(작년 계획서 목차보다 앞섬)', async () => {
    await clickStep(3);
    await page.waitForSelector(`${P} [data-rf="event"]`);
    await page.click(`${P} [data-doc="safety"]`);
    assert(await page.locator(`${P} [data-rf="event"]`).count() === 0, '안전 점검표 탭에는 없음');
    await page.click(`${P} [data-doc="plan"]`);
    await upload(`${P} [data-rf="event"]`, file('운동회 새 서식.hwpx', NEW_EVENT));
    await page.waitForSelector('#rfSheet #rfMap');
    const m = await mapTexts();
    assert(m[0].startsWith('1. 추진 목적') && m[0].includes('AI가 새로 씀') && m[1].includes('← 개요') && m[3].includes('← 안전 대책'), m.join(' / '));
    assert((await page.$$eval('#rfOrphans li b', bs => bs.map(b => b.textContent))).join('|') === '운영 방침', '옮길 곳 없음');
    await page.click('#rfSheet [data-rf-ok]');
    await toastHas('새 서식 차례로 바꿨어요');
    const v = await page.inputValue(`${P} textarea[data-docf="plan"]`);
    assert(v === '2027 가을 운동회 운영 계획\n1. 추진 목적\n가. 협동심을 기른다.\n2. 운영 개요\n가. 일시: 2027. 5. 6.\n가. 모두가 즐기는 운동회\n3. 세부 운영 계획\n1. 경기 종목\n4. 안전 관리\n가. 보건실 운영\n5. 평가 및 환류\n가. 만족도 조사', '옮길 곳 없는 운영 방침도 앞 칸에: ' + v);
    const heads = await page.evaluate(async id => { const m = await import('./menus/plan/event-model.js'); return m.docDoc(m.getEvent(id), 'plan').blocks.filter(b => b.type === 'h').map(b => b.text); }, EV);
    assert(heads.join('|') === '1. 추진 목적|2. 운영 개요|3. 세부 운영 계획|4. 안전 관리|5. 평가 및 환류', heads.join('|'));
    assert((await picked('event')) === (await formId('운동회 새 서식')), '새 서식을 골라 둠');
    // 계획서 서식은 계획서 탭에만: 안전 점검표·가정통신문 탭은 따로 고름(기본 문서로 내려받음)
    for (const doc of ['letter', 'safety']) {
      await page.click(`${P} [data-doc="${doc}"]`);
      await page.waitForSelector(`${P} textarea[data-docf="${doc}"]`);
      await page.waitForSelector(`${P} .sf-slot select[data-sf-pick]`);
      assert(await page.$eval(`${P} .sf-slot select[data-sf-pick]`, s => s.value) === '', `${doc} 탭에 계획서 서식이 골라짐`);
      assert(await page.locator(`${P} .sf-slot [data-e="hwpx"]`).count() === 1 && await page.locator(`${P} [data-sf-export]`).count() === 0, `${doc} 탭은 기본 내려받기`);
      assert(await page.locator(`${P} .sf-slot[data-sf="event-${doc}"]`).count() === 1, `${doc} 탭은 따로 고름`);
      // 바꾼 뒤 가정통신문을 손으로 고침 → 그 칸의 열린 의견이 지워짐
      if (doc === 'letter') await page.fill(`${P} textarea[data-docf="letter"]`, '날짜 준비물 복장 문의 — 김하늘 선생님이 고침');
    }
    await page.click(`${P} [data-doc="plan"]`);
    await page.waitForSelector(`${P} [data-sf-export="event"]`);
    assert(await page.$eval(`${P} select[data-sf-pick="event"]`, s => s.options[s.selectedIndex].textContent) === '운동회 새 서식', '계획서 탭은 새 서식');
    // 같은 종류 다른 계획(행사 B)을 다른 서식으로 바꿈 → 고른 양식은 계획 종류마다 하나라 B의 서식이 골라짐
    const EV2 = await page.evaluate(async () => {
      const m = await import('./menus/plan/event-model.js');
      const plan = '2027 봄 운동회 운영 계획\nⅠ. 개요\n가. 일시: 2027. 4. 20.\nⅡ. 운영 방침\n가. 안전한 운동회\nⅢ. 세부 운영\n1. 경기 종목';
      return m.saveEvent({ ...m.newEvent(), name: '봄 운동회', date: '2027-04-20', step: 3, maxStep: 3, docs: { plan, safety: '- 안전', letter: '날짜 준비물 복장 문의', rain: '', done: false } }).id;
    });
    await goTab('year'); await goTab('event');
    await page.click(`${P} [data-ev="${EV2}"]`);
    await page.waitForSelector(`${P} [data-rf="event"]`);
    await upload(`${P} [data-rf="event"]`, file('봄 운동회 서식.hwpx', NEW_EVENT));
    await page.waitForSelector('#rfSheet #rfMap');
    await page.click('#rfSheet [data-rf-ok]');
    await toastHas('봄 운동회 서식');
    const bForm = await formId('봄 운동회 서식');
    assert(bForm && (await picked('event')) === bForm, '행사 B 서식을 골라 둠');
    await page.click(`${P} [data-ev="${EV}"]`);
    await page.waitForSelector(`${P} [data-rf-undo="event"]`);
    await page.click(`${P} [data-rf-undo="event"]`);
    await toastHas('되돌렸어요');
    assert((await picked('event')) === bForm, '행사 A를 되돌려도 행사 B를 위해 고른 양식은 그대로');
    assert((await page.inputValue(`${P} textarea[data-docf="plan"]`)).includes('Ⅱ. 운영 방침'), '되돌림');
    // 되돌리기는 계획서 글·계획서 의견만: 손으로 고친 가정통신문과 지워진 그 의견은 그대로(옛 수정안으로 덮을 의견이 되살아나지 않음)
    const ue = await page.evaluate(async id => (await import('./menus/plan/event-model.js')).getEvent(id), EV);
    assert(ue.docs.letter === '날짜 준비물 복장 문의 — 김하늘 선생님이 고침', ue.docs.letter);
    assert(ue.rv.map(x => x.section).join('|') === 'plan', '의견: ' + JSON.stringify(ue.rv));
    // 행사 C를 행사 B와 같은 서식 파일로 바꿈 → 같은 이름·같은 곳이라 같은 양식(id)이 골라짐
    const first = await formId('작년 계획서 서식 · 2026 작년 운동회 계획서');
    const EV3 = await page.evaluate(async () => {
      const m = await import('./menus/plan/event-model.js');
      const plan = '2027 여름 물놀이 운영 계획\nⅠ. 개요\n가. 일시: 2027. 7. 9.\nⅡ. 운영 방침\n가. 안전한 물놀이\nⅢ. 세부 운영\n1. 물총 놀이';
      return m.saveEvent({ ...m.newEvent(), name: '여름 물놀이', date: '2027-07-09', step: 3, maxStep: 3, docs: { plan, safety: '- 안전', letter: '날짜 준비물 복장 문의', rain: '', done: false } }).id;
    });
    await goTab('year'); await goTab('event');
    await page.click(`${P} [data-ev="${EV3}"]`);
    await page.waitForSelector(`${P} [data-rf="event"]`);
    await upload(`${P} [data-rf="event"]`, file('봄 운동회 서식.hwpx', NEW_EVENT));
    await page.waitForSelector('#rfSheet #rfMap');
    await page.click('#rfSheet [data-rf-ok]');
    await toastHas('새 서식 차례로 바꿨어요');
    assert((await formsList()).filter(f => f.name === '봄 운동회 서식').length === 1 && (await picked('event')) === bForm, '같은 서식 파일은 같은 양식');
    // 행사 B를 되돌려도 같은 양식으로 바꾼 행사 C의 양식은 그대로
    await page.click(`${P} [data-ev="${EV2}"]`);
    await page.waitForSelector(`${P} [data-rf-undo="event"]`);
    await page.click(`${P} [data-rf-undo="event"]`);
    await toastHas('되돌렸어요');
    assert((await picked('event')) === bForm, '행사 B를 되돌리자 행사 C를 위해 고른 양식이 바뀜: ' + (await picked('event')));
    assert((await page.inputValue(`${P} textarea[data-docf="plan"]`)).includes('Ⅱ. 운영 방침'), '행사 B 되돌림');
    // 행사 C까지 되돌리면 모든 바꾸기 전에 고른 양식으로
    await page.click(`${P} [data-ev="${EV3}"]`);
    await page.waitForSelector(`${P} [data-rf-undo="event"]`);
    await page.click(`${P} [data-rf-undo="event"]`);
    await page.waitForFunction(() => document.querySelector('section[data-menu="plan"] textarea[data-docf="plan"]')?.value.includes('Ⅱ. 운영 방침'));
    assert(first && (await picked('event')) === first, '모두 되돌리면 바꾸기 전 양식: ' + (await picked('event')));
  }],
  ['행사계획: 같은 서식 파일로 바꾼 다른 행사를 지운 뒤 [되돌리기] → 바꾸기 전 양식으로(지운 행사의 되돌리기가 고른 양식을 붙잡지 않음)', async () => {
    const first = await formId('작년 계획서 서식 · 2026 작년 운동회 계획서'), bForm = await formId('봄 운동회 서식');
    assert(first && bForm && (await picked('event')) === first, '앞 단계 끝: 바꾸기 전 양식');
    const make = (name, date) => page.evaluate(async ([name, date]) => {
      const m = await import('./menus/plan/event-model.js');
      const plan = `2027 ${name} 운영 계획\nⅠ. 개요\n가. 일시: ${date}\nⅡ. 운영 방침\n가. 안전한 행사\nⅢ. 세부 운영\n1. 학년별 발표`;
      return m.saveEvent({ ...m.newEvent(), name, date, step: 3, maxStep: 3, docs: { plan, safety: '- 안전', letter: '날짜 준비물 복장 문의', rain: '', done: false } }).id;
    }, [name, date]);
    const D = await make('가을 학예회', '2027-10-15'), E = await make('가을 학예회(겹침)', '2027-10-15');
    await goTab('year'); await goTab('event');
    // 두 행사를 같은 서식 파일로 바꿈 → 같은 양식(id)
    for (const id of [D, E]) {
      await page.click(`${P} [data-ev="${id}"]`);
      await page.waitForSelector(`${P} [data-rf="event"]`);
      await upload(`${P} [data-rf="event"]`, file('봄 운동회 서식.hwpx', NEW_EVENT));
      await page.waitForSelector('#rfSheet #rfMap');
      await page.click('#rfSheet [data-rf-ok]');
      await page.waitForSelector('#rfSheet', { state: 'detached' });
      await page.waitForSelector(`${P} [data-rf-undo="event"]`);
    }
    assert((await formsList()).filter(f => f.name === '봄 운동회 서식').length === 1 && (await picked('event')) === bForm, '같은 서식 파일은 같은 양식');
    // 겹쳐 만든 행사 E를 지움 — 지우기만으로 고른 양식은 바뀌지 않음
    await page.click(`${P} [data-e="delete"]`);
    await page.click('[data-e="deleteYes"]');
    await toastHas('지웠어요');
    assert(!(await page.evaluate(async id => (await import('./menus/plan/event-model.js')).getEvent(id), E)), '행사 E 지움');
    assert((await picked('event')) === bForm, '지우자 고른 양식이 바뀜');
    // 남은 행사 D를 되돌리면 바꾸기 전 양식으로(같은 양식을 쓰는 행사가 더는 없음)
    await page.click(`${P} [data-ev="${D}"]`);
    await page.waitForSelector(`${P} [data-rf-undo="event"]`);
    await page.click(`${P} [data-rf-undo="event"]`);
    await toastHas('되돌렸어요');
    assert((await page.inputValue(`${P} textarea[data-docf="plan"]`)).includes('Ⅱ. 운영 방침'), '행사 D 되돌림');
    assert((await picked('event')) === first, '지운 행사 E가 고른 양식을 붙잡음: ' + (await picked('event')));
  }],
  ['학급운영계획 1단계: 작년 계획서 .hwpx → 서식 저장·골라 둠', async () => {
    CP = await page.evaluate(async () => {
      (await import('./core/store.js')).flushAll();
      const c = await import('./menus/plan/classplan-model.js');
      const p = c.newPlan();
      Object.assign(p, { grade: 3, room: 2, step: 1, maxStep: 4,
        outline: [{ id: 's1', title: '학급 현황', level: 1 }, { id: 's2', title: '학급 실태', level: 2 }, { id: 's3', title: '학급 조직', level: 2 }, { id: 's4', title: '학급 교육 목표', level: 1 },
          { id: 's5', title: '평가 계획', level: 1 }, { id: 's6', title: '교과 평가 계획', level: 2 }, { id: 's7', title: '월별 운영 계획', level: 1 }],
        draft: { s2: '남 12명 여 13명', s3: '1인 1역', s4: '서로 돕는 반', s6: '수행평가 중심', s7: '3월 학급 세우기' } });
      const sp = c.savePlan(p); c.setCurrent(sp.id);
      return sp.id;
    });
    await page.reload(); await page.waitForTimeout(400);
    await goTab('class');
    await page.waitForSelector(`${P} [data-cp="${CP}"]`, { state: 'attached' });
    await page.$eval(`${P} [data-cp="${CP}"]`, b => b.click());
    await page.waitForFunction(() => [...document.querySelectorAll('section[data-menu="plan"] [data-file="lastPlan"]')].some(x => x.checkVisibility()));
    await uploadVisible(`${P} [data-file="lastPlan"]`, join(ROOT, 'samples', '학급운영계획-작년-예시.hwpx'));
    await toastHas('작년 계획서 서식');
    assert((await picked('classplan')) === (await formId('작년 계획서 서식 · 학급운영계획-작년-예시')), '학급운영계획에 골라 둠');
  }],
  ['학급운영계획 4단계: [새 서식으로 바꾸기] → 목차(작은 칸은 따라감)·칸 글, 3단계 초안도 새 차례, [되돌리기]', async () => {
    await clickStep(4);
    await page.waitForFunction(() => [...document.querySelectorAll('section[data-menu="plan"] [data-rf="classplan"]')].some(x => x.checkVisibility()));
    await uploadVisible(`${P} [data-rf="classplan"]`, file('학급 새 서식.hwpx', NEW_CLASS));
    await page.waitForSelector('#rfSheet #rfMap');
    const m = await mapTexts();
    assert(m[0].includes('← 학급 교육 목표') && m[1].includes('← 학급 현황') && m[4].includes('AI가 새로 씀'), m.join(' / '));
    assert(await page.locator('#rfOrphans').count() === 0, '옮길 곳 없는 칸 없음');
    await page.click('#rfSheet [data-rf-ok]');
    await toastHas('새 서식 차례로 바꿨어요');
    const p = await page.evaluate(async id => (await import('./menus/plan/classplan-model.js')).getPlan(id), CP);
    assert(p.outline.map(x => `${x.level}${x.title}`).join('|') === '1학급 교육 목표|1학급 현황 및 조직|2학급 실태|2학급 조직|1평가 계획|2교과 평가 계획|1월별 운영 계획|1학부모 소통', p.outline.map(x => `${x.level}${x.title}`).join('|'));
    assert(p.draft.s4 === '서로 돕는 반' && p.draft.s2 === '남 12명 여 13명' && Object.values(p.draft).includes('학부모 상담 주간을 운영한다.'), JSON.stringify(p.draft));
    assert((await picked('classplan')) === (await formId('학급 새 서식')), '새 서식을 골라 둠');
    await clickStep(3);
    await page.waitForFunction(() => [...document.querySelectorAll('section[data-menu="plan"] #cpDraft h3')].some(x => x.checkVisibility()));
    const hs = await page.$$eval(`${P} #cpDraft h3, ${P} #cpDraft h4`, hs => hs.filter(h => h.checkVisibility()).map(h => h.textContent.trim()));
    assert(hs[0] === 'Ⅰ. 학급 교육 목표' && hs.includes('Ⅴ. 학부모 소통'), hs.join('|'));
    await clickStep(4);
    await page.waitForFunction(() => [...document.querySelectorAll('section[data-menu="plan"] [data-rf-undo="classplan"]')].some(x => x.checkVisibility()));
    await clickVisible(`${P} [data-rf-undo="classplan"]`);
    await toastHas('되돌렸어요');
    const q = await page.evaluate(async id => (await import('./menus/plan/classplan-model.js')).getPlan(id), CP);
    assert(q.outline[0].title === '학급 현황' && q.outline.length === 7, q.outline.map(x => x.title).join('|'));
    assert((await picked('classplan')) === (await formId('작년 계획서 서식 · 학급운영계획-작년-예시')), '그 전 양식');
  }],
  ['휴대폰 390·360px: 내려받기 줄·미리 보기 창이 넘치거나 겹치지 않음', async () => {
    for (const w of [390, 360]) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.waitForTimeout(250);
      const row = await page.evaluate(() => {
        const r = [...document.querySelectorAll('section[data-menu="plan"] .yp-out')].find(x => x.checkVisibility());
        const kids = [...r.querySelectorAll('button, select')].filter(x => x.checkVisibility()).map(x => x.getBoundingClientRect());
        const hit = kids.some((a, i) => kids.some((b, j) => j > i && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
        return { over: document.documentElement.scrollWidth - innerWidth, rowOver: r.scrollWidth - r.clientWidth, hit };
      });
      assert(row.over <= 0 && row.rowOver <= 1 && !row.hit, `${w}px 내려받기 줄: ${JSON.stringify(row)}`);
      await uploadVisible(`${P} [data-rf="classplan"]`, file('학급 새 서식 긴 이름 새싹초등학교 학급 교육과정 운영 계획 서식.hwpx', NEW_CLASS));
      await page.waitForSelector('#rfSheet #rfMap');
      const s = await page.evaluate(() => {
        const sh = document.querySelector('#rfSheet').closest('.sheet'), b = sh.getBoundingClientRect();
        const btns = [...sh.querySelectorAll('.rf-btns button')].map(x => x.getBoundingClientRect());
        return { left: b.left, right: b.right, over: sh.scrollWidth - sh.clientWidth, page: document.documentElement.scrollWidth - innerWidth, btnHit: btns.length === 2 && btns[0].right > btns[1].left && btns[0].top === btns[1].top };
      });
      assert(s.left >= 0 && s.right <= w && s.over <= 1 && s.page <= 0 && !s.btnHit, `${w}px 미리 보기: ${JSON.stringify(s)}`);
      await page.click('#rfSheet [data-close]');
      await page.waitForSelector('#rfSheet', { state: 'detached' });
    }
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['학급운영계획: 같은 서식 파일로 바꾼 다른 계획을 지운 뒤 [되돌리기] → 바꾸기 전 양식으로', async () => {
    const before = await picked('classplan');
    assert(before === (await formId('작년 계획서 서식 · 학급운영계획-작년-예시')), '앞 단계 끝: 바꾸기 전 양식');
    const reformHere = async () => {
      await clickStep(4);
      await page.waitForFunction(() => [...document.querySelectorAll('section[data-menu="plan"] [data-rf="classplan"]')].some(x => x.checkVisibility()));
      await uploadVisible(`${P} [data-rf="classplan"]`, file('학급 새 서식.hwpx', NEW_CLASS));
      await page.waitForSelector('#rfSheet #rfMap');
      await page.click('#rfSheet [data-rf-ok]');
      await page.waitForSelector('#rfSheet', { state: 'detached' });
      await page.waitForFunction(() => [...document.querySelectorAll('section[data-menu="plan"] [data-rf-undo="classplan"]')].some(x => x.checkVisibility()));
    };
    const open = async id => { await page.$eval(`${P} [data-cp="${id}"]`, b => b.click()); await page.waitForTimeout(150); };
    // 계획 A(지금 계획)를 바꾸고, 겹쳐 만든 계획 B도 같은 서식 파일로 바꿈 → 같은 양식(id)
    await reformHere();
    const nf = await formId('학급 새 서식');
    assert(nf && (await picked('classplan')) === nf, '새 서식을 골라 둠');
    const CP2 = await page.evaluate(async () => {
      (await import('./core/store.js')).flushAll();
      const c = await import('./menus/plan/classplan-model.js');
      const p = c.newPlan();
      Object.assign(p, { grade: 3, room: 2, step: 4, maxStep: 4, outline: [{ id: 's1', title: '학급 현황', level: 1 }, { id: 's4', title: '학급 교육 목표', level: 1 }, { id: 's7', title: '월별 운영 계획', level: 1 }],
        draft: { s1: '남 12명 여 13명', s4: '서로 돕는 반', s7: '3월 학급 세우기' } });
      return c.savePlan(p).id;
    });
    await goTab('year'); await goTab('class');
    await page.waitForSelector(`${P} [data-cp="${CP2}"]`, { state: 'attached' });
    await open(CP2);
    await reformHere();
    assert((await formsList()).filter(f => f.name === '학급 새 서식').length === 1 && (await picked('classplan')) === nf, '같은 서식 파일은 같은 양식');
    // 계획 B를 지움 → 계획 A를 되돌리면 바꾸기 전 양식으로
    await clickVisible(`${P} [data-c="delete"]`);
    await page.click('#sheetRoot [data-c="deleteYes"]');
    await toastHas('지웠어요');
    assert(!(await page.evaluate(async id => (await import('./menus/plan/classplan-model.js')).getPlan(id), CP2)), '계획 B 지움');
    await open(CP);
    await clickStep(4);
    await page.waitForFunction(() => [...document.querySelectorAll('section[data-menu="plan"] [data-rf-undo="classplan"]')].some(x => x.checkVisibility()));
    await clickVisible(`${P} [data-rf-undo="classplan"]`);
    await toastHas('되돌렸어요');
    assert((await picked('classplan')) === before, '지운 계획 B가 고른 양식을 붙잡음: ' + (await picked('classplan')));
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join('\n')); }]
]);
await t.close();
