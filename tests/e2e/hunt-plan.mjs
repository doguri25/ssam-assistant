// 계획 메뉴 버그 잡기(2026-11-10): 설문 서술형 답의 이름·전화번호, 연간계획 담당자 이름이 AI로, 확정 뒤 고친 연간계획의 옛 학사일정,
// [넣기]·설문 링크 넣기 뒤 [검토 안 쓰기]가 넣은 글을 지움, 결과 보고로 두 번 넘기면 자료가 겹침, 작년 학년도 날짜를 그대로 쓴 초안 일정,
// 지침을 더 넣어도 옛 지침 항목만 점검, 결과 보고서·설문 QR 저장 실패 알림
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2027-01-12T09:00:00'));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const prompts = [];
let draftOut = null;
await mockClaude(page, ({ prompt }) => {
  prompts.push(prompt);
  if (prompt.startsWith('[설문 결과]')) return JSON.stringify({ textSummary: '요약', report: '보고서', nextMemo: '- 그늘막 늘리기' });
  if (prompt.startsWith('[연간계획 초안]')) return JSON.stringify(draftOut || { purpose: '목적', policy: '방침', details: '세부', evaluation: '평가', schedule: [{ title: '모집', date: '2027-03-15' }], budget: [] });
  if (prompt.startsWith('[행사 문서]')) return JSON.stringify({ plan: '가. 개요\n새로 쓴 계획', roles: [], safety: '- 구급함', letter: '일시: 5월 6일\n준비물: 물\n복장: 체육복\n문의: 교무실', rain: '강당' });
  if (prompt.startsWith('[지침 점검]')) return JSON.stringify(prompt.includes('학부모 상담 주간') ? [{ item: '학부모 상담', keywords: ['상담 주간'], sentence: '학부모 상담 주간을 운영한다.', section: 'details' }]
    : [{ item: '아침 독서', keywords: ['아침 독서'], sentence: '아침 독서를 한다.', section: 'details' }]);
  return '{}';
});
const P = 'section[data-menu="plan"]';
const tab = async id => { await page.click('nav.app-side [data-menu-go="plan"]'); await page.click(`#menuTabs [data-tab="${id}"]`); };
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('시간 초과'); await new Promise(r => setTimeout(r, 50)); } };
const flush = () => page.evaluate(async () => (await import('./core/store.js')).flushAll());
const seedYear = p => page.evaluate(async p => {
  (await import('./core/store.js')).flushAll();
  localStorage.removeItem('ssam:yearplans'); localStorage.removeItem('ssam:calendar');
  const y = await import('./menus/plan/year-model.js');
  const s = y.savePlan({ ...y.newPlan(), ...p }); y.setCurrent(s.id);
  return s.id;
}, p);
const getYear = id => page.evaluate(async id => (await import('./menus/plan/year-model.js')).getPlan(id), id);
const seedEv = e => page.evaluate(async e => {
  (await import('./core/store.js')).flushAll();
  localStorage.removeItem('ssam:events'); localStorage.removeItem('ssam:calendar');
  const m = await import('./menus/plan/event-model.js');
  const s = m.saveEvent({ ...m.newEvent(), ...e, options: m.normOptions(e.options || []) }); m.setCurrentEvent(s.id);
  return s.id;
}, e);
const getEv = id => page.evaluate(async id => (await import('./menus/plan/event-model.js')).getEvent(id), id);
const cal = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:calendar') || '[]'));
const DRAFT = { purpose: '목적', policy: '방침', details: '가. 학급별 독서 동아리를 운영한다.', evaluation: '평가', schedule: [{ title: '모집', date: '2027-03-15', month: 3 }, { title: '골든벨', date: '2027-10-14', month: 10 }], budget: [] };
const OPT = [{ label: '새로운 안', timetable: [{ time: '09:00', activity: '개회식' }], budget: [] }];
const DOCS = { plan: '가. 개요\n운동회를 한다.', safety: '- 구급함', letter: '일시: 5월 6일\n준비물: 물\n복장: 체육복\n문의: 교무실', rain: '강당', roles: [], done: true };
const evBase = extra => ({ name: '가을 운동회', grades: '전교생', date: '2027-05-06', place: '운동장', outdoor: true, options: OPT, picked: 0, docs: DOCS, step: 4, maxStep: 4, ...extra });

await page.goto(url);
await page.waitForTimeout(400);

await run('hunt-plan', [
  ['[ev-survey-names] 설문 CSV 서술형 답의 학생 이름·전화번호는 ○○○로 저장하고 결과 보고서 AI에도 보내지 않음', async () => {
    const id = await seedEv(evBase());
    await page.reload(); await page.waitForTimeout(400); await tab('event');
    const csv = ['타임스탬프,즐거웠나요?,좋았던 점', '2027/05/06,5,김민수랑 같이 달리기 해서 좋았어요', '2027/05/06,4,010-1234-5678로 연락 주세요. 이서연 엄마예요',
      '2027/05/06,4,줄다리기가 재밌었어요', '2027/05/06,5,박지훈 학생이 다쳤는데 빨리 도와주셔서 감사해요'].join('\n');
    await page.setInputFiles(`${P} #evCsv`, { name: '설문.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await until(async () => prompts.some(p => p.startsWith('[설문 결과]')));
    const pr = prompts.filter(p => p.startsWith('[설문 결과]')).at(-1);
    for (const w of ['김민수', '이서연', '박지훈', '010-1234-5678']) assert(!pr.includes(w), `프롬프트에 「${w}」: ` + pr.slice(pr.indexOf('좋았던 점'), pr.indexOf('좋았던 점') + 300));
    assert(pr.includes('줄다리기가 재밌었어요') && pr.includes('같이 달리기 해서 좋았어요'), '다른 답이 빠짐');
    await until(async () => String(((await getEv(id)).survey || {}).report).endsWith('보고서'));
    const st = JSON.stringify((await getEv(id)).survey.result);
    for (const w of ['김민수', '이서연', '박지훈', '010-1234-5678']) assert(!st.includes(w), `저장에 「${w}」: ` + st);
    const shown = await page.textContent(`${P} #evResult`);
    assert(!shown.includes('김민수') && shown.includes('서술형 4개'), shown);
  }],
  ['[yp-owner-ai] 연간계획 초안 AI에 담당자 이름·전화번호는 보내지 않음(부서는 그대로)', async () => {
    await seedYear({ name: '독서교육', year: 2027, goal: '책 읽는 학교. 문의 010-2222-3333', owner: '독서교육부 박하늘', budget: '120만 원', step: 4, maxStep: 4 });
    await page.reload(); await page.waitForTimeout(400); await tab('year');
    const n = prompts.length;
    await page.click(`${P} [data-y="draft"]`);
    await until(async () => prompts.slice(n).some(p => p.startsWith('[연간계획 초안]')));
    const pr = prompts.slice(n).find(p => p.startsWith('[연간계획 초안]'));
    assert(!pr.includes('박하늘') && !pr.includes('010-2222-3333'), pr.slice(0, 400));
    assert(pr.includes('독서교육부') && pr.includes('120만 원') && pr.includes('책 읽는 학교'), pr.slice(0, 400));
    await until(async () => !!(await page.locator(`${P} #ypDraft`).count()));
  }],
  ['[yp-unconfirm-cal] 확정한 연간계획의 일정 날짜를 바꾸면 「작성 중」, 학사일정의 옛 날짜는 빠짐(다시 확정하면 새 날짜)', async () => {
    const id = await seedYear({ name: '독서교육', year: 2027, goal: '목표', draft: DRAFT, step: 5, maxStep: 5 });
    await page.reload(); await page.waitForTimeout(400); await tab('year');
    await page.click(`${P} [data-y="final"]`);
    assert((await cal()).filter(e => e.source === 'year:' + id).length === 2, '확정 뒤 학사일정: ' + JSON.stringify(await cal()));
    await page.fill(`${P} input[data-date="0"]`, '2027-03-16');
    await page.dispatchEvent(`${P} input[data-date="0"]`, 'change');
    await page.waitForTimeout(200);
    assert((await getYear(id)).status === 'draft', '여전히 확정');
    const c = await cal();
    assert(!c.some(e => e.date === '2027-03-15'), '옛 날짜가 남음: ' + JSON.stringify(c));
    await page.click(`${P} [data-y="final"]`);
    assert((await cal()).some(e => e.date === '2027-03-16' && e.source === 'year:' + id), '다시 확정한 새 날짜 없음');
  }],
  ['[yp-unconfirm-cal] 확정한 연간계획의 일정 줄을 빼거나 초안 칸을 고쳐도 학사일정의 그 계획 일정이 빠짐', async () => {
    const id = await seedYear({ name: '독서교육', year: 2027, goal: '목표', draft: DRAFT, step: 5, maxStep: 5 });
    await page.reload(); await page.waitForTimeout(400); await tab('year');
    await page.click(`${P} [data-y="final"]`);
    await page.click(`${P} [data-schdel="1"]`);
    assert(!(await cal()).some(e => e.date === '2027-10-14'), '뺀 일정이 남음: ' + JSON.stringify(await cal()));
    await page.click(`${P} [data-y="final"]`);
    await page.click(`${P} .yp-box ol.steps [data-step="4"]`);
    await page.fill(`${P} textarea[data-sec="purpose"]`, '목적을 고침');
    await page.waitForTimeout(600);
    assert((await getYear(id)).status === 'draft', '여전히 확정');
    assert(!(await cal()).some(e => e.source === 'year:' + id), '작성 중인데 학사일정에 남음: ' + JSON.stringify(await cal()));
  }],
  ['[rv-insert] 지침 [넣기]로 문장을 더한 칸은 검토 의견이 사라져 [검토 안 쓰기]가 넣은 문장을 지우지 않음', async () => {
    const id = await seedYear({ name: '독서교육', year: 2027, goal: '목표', draft: DRAFT, step: 3, maxStep: 4, sources: { lastPlan: '', lastResult: '', guide: '매일 아침 독서 시간을 둔다.' },
      guide: [{ item: '아침 독서', keywords: ['아침 독서'], sentence: '매일 아침 독서 20분을 운영한다.', section: 'details' }],
      rv: [{ section: 'details', problem: '구체성 부족', fix: '가. 학급별 독서 동아리를 주 1회 운영한다.' }] });
    await page.reload(); await page.waitForTimeout(400); await tab('year');
    await page.click(`${P} .yp-box [data-insert="0"]`);
    assert((await getYear(id)).draft.details.includes('매일 아침 독서 20분'), '넣지 못함');
    await page.click(`${P} .yp-box ol.steps [data-step="4"]`);
    const use = await page.locator(`${P} [data-rv-use="details"]`).count();
    if (use) await page.click(`${P} [data-rv-use="details"]`);
    await flush();
    assert((await getYear(id)).draft.details.includes('매일 아침 독서 20분'), '넣은 문장이 사라짐: ' + (await getYear(id)).draft.details);
    assert(!use, '넣은 칸에 옛 검토 의견이 남음');
  }],
  ['[yp-unconfirm-cal] 확정한 행사의 문서를 [다시 만들기]로 새로 쓰면 「작성 중」, 학사일정의 행사 날짜도 빠짐', async () => {
    const id = await seedEv(evBase({ step: 3, maxStep: 4 }));
    await page.reload(); await page.waitForTimeout(400); await tab('event');
    await page.click(`${P} .ev-box ol.steps [data-step="4"]`);
    await page.click(`${P} [data-e="final"]`);
    assert((await getEv(id)).status === 'final' && (await cal()).some(e => e.source === 'event:' + id), '확정이 안 됨');
    await page.click(`${P} .ev-box ol.steps [data-step="3"]`);
    await page.click(`${P} [data-e="docs"]`);
    await until(async () => (await getEv(id)).docs.plan.includes('새로 쓴 계획'));
    assert((await getEv(id)).status === 'draft', '여전히 확정');
    assert(!(await cal()).some(e => e.source === 'event:' + id), '작성 중인데 학사일정에 남음');
  }],
  ['[rv-insert] 학급운영계획 지침 [넣기]로 문장을 더한 칸의 검토 의견도 사라짐', async () => {
    const id = await page.evaluate(async () => {
      (await import('./core/store.js')).flushAll();
      localStorage.removeItem('ssam:classplans');
      const c = await import('./menus/plan/classplan-model.js');
      const outline = c.STANDARD.slice(0, 3);
      const q = c.savePlan({ ...c.newPlan(), year: 2027, grade: 3, room: 1, step: 3, maxStep: 3, outline, sources: { lastPlan: '', guide: '기초학력 지도를 한다.' },
        draft: { [outline[1].id]: '가. 학급 실태를 살핀다.' }, guide: [{ item: '기초학력', keywords: ['기초학력 진단'], sentence: '3월에 기초학력 진단을 한다.', section: outline[1].id }],
        rv: [{ section: outline[1].id, problem: '짧음', fix: '가. 학급 실태를 자세히 살핀다.' }] });
      c.setCurrent(q.id);
      return q.id;
    });
    await page.reload(); await page.waitForTimeout(400); await tab('class');
    await page.click(`${P} .cp-box [data-insert="0"]`);
    await flush();
    const q = await page.evaluate(async id => (await import('./menus/plan/classplan-model.js')).getPlan(id), id);
    assert(Object.values(q.draft).join('').includes('기초학력 진단'), '넣지 못함');
    assert(!q.rv.some(x => !x.done), '옛 의견이 남음: ' + JSON.stringify(q.rv));
    assert(!(await page.locator(`${P} .cp-box [data-rv-use]`).count()), '화면에 옛 의견');
  }],
  ['[rv-insert] 행사 4단계 [가정통신문에 넣기]로 설문 링크를 더하면 가정통신문 검토 의견이 사라짐', async () => {
    const id = await seedEv(evBase({ survey: { target: 'student', items: [], formUrl: 'https://forms.gle/abc123', result: null, report: '', nextMemo: '' },
      rv: [{ section: 'letter', problem: '말이 딱딱함', fix: '일시: 5월 6일\n준비물: 물\n복장: 체육복\n문의: 교무실\n즐겁게 참여해요.' }] }));
    await page.reload(); await page.waitForTimeout(400); await tab('event');
    await page.waitForSelector(`${P} [data-e="qrLetter"]`);
    await page.click(`${P} [data-e="qrLetter"]`);
    await flush();
    const e = await getEv(id);
    assert(e.docs.letter.includes('설문 참여: https://forms.gle/abc123'), '링크 없음');
    assert(!e.rv.some(x => x.section === 'letter' && !x.done), '옛 의견이 남음: ' + JSON.stringify(e.rv));
  }],
  ['[rp-dup] 행사계획 [결과 보고 공문·보고서 쓰기]를 두 번 눌러도 결과 보고 자료가 겹치지 않음', async () => {
    await page.evaluate(() => { localStorage.removeItem('ssam:report:cur'); localStorage.removeItem('ssam:report:list'); });
    await seedEv(evBase({ survey: { target: 'student', items: [], formUrl: '', result: null, report: '설문 결과 보고서 글', nextMemo: '' } }));
    await page.reload(); await page.waitForTimeout(400); await tab('event');
    await page.click(`${P} [data-e="toReport"]`);
    await tab('event');
    await page.click(`${P} [data-e="toReport"]`);
    const cur = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:report:cur')));
    assert(cur.sources.length === 2, '자료 수: ' + cur.sources.map(s => s.name).join(', '));
    assert(await page.locator(`${P} #rpSrc li`).count() === 2, '화면 자료 수');
  }],
  ['[rp-export-fail] 결과 보고서를 파일로 저장하지 못하면 알리고 페이지 오류가 나지 않음', async () => {
    await page.evaluate(async () => {
      const a = await import('./menus/plan/report-ai.js'), m = await import('./menus/plan/report-model.js');
      const r = a.normReport({ name: '2026 과학의 날', period: { start: '2026-04-21' }, place: '강당', summary: '실험', sections: [{ h: '목적', lines: ['흥미'] }] }, { year: 2026 });
      m.saveCurrent({ id: 'rp1', sources: [], memo: '', r, letter: a.composeReportLetter(r), letterEdited: false, captions: [] });
    });
    await page.reload(); await page.waitForTimeout(400); await tab('report');
    const before = errors.length;
    await page.evaluate(() => { URL.createObjectURL = () => { throw new Error('디스크가 꽉 참'); }; });
    await page.click(`${P} [data-rp="export"]`);
    await page.waitForTimeout(400);
    assert(errors.length === before, '페이지 오류: ' + errors.slice(before).join(' | '));
    assert((await page.textContent('body')).includes('저장하지 못했어요'), '알림 없음');
    await page.reload(); await page.waitForTimeout(400);
  }],
  ['[rp-export-fail] 행사 설문 QR 그림을 저장하지 못해도 알리고 페이지 오류가 나지 않음', async () => {
    await seedEv(evBase({ survey: { target: 'student', items: [], formUrl: 'https://forms.gle/abc123', result: null, report: '', nextMemo: '' } }));
    await page.reload(); await page.waitForTimeout(400); await tab('event');
    await page.waitForSelector(`${P} [data-e="qrDown"]`);
    const before = errors.length;
    await page.evaluate(() => { URL.createObjectURL = () => { throw new Error('디스크가 꽉 참'); }; });
    await page.click(`${P} [data-e="qrDown"]`);
    await page.waitForTimeout(400);
    assert(errors.length === before, '페이지 오류: ' + errors.slice(before).join(' | '));
    assert((await page.textContent('body')).includes('저장하지 못했어요'), '알림 없음');
    await page.reload(); await page.waitForTimeout(400);
  }],
  ['[yp-guide-stale] 지침 항목을 뽑은 뒤 올해 지침·공문 파일을 더 넣거나 고치면 3단계에서 바뀐 지침으로 다시 뽑음', async () => {
    const id = await seedYear({ name: '독서교육', year: 2027, goal: '목표', draft: DRAFT, step: 1, maxStep: 4, sources: { lastPlan: '', lastResult: '', guide: '매일 아침 독서 시간을 둔다.' },
      guide: [{ item: '아침 독서', keywords: ['아침 독서'], sentence: '아침 독서를 한다.', section: 'details' }] });
    await page.reload(); await page.waitForTimeout(400); await tab('year');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${P} .yp-box [data-file="guide"]`)]);
    await fc.setFiles({ name: '공문.txt', mimeType: 'text/plain', buffer: Buffer.from('4월에 학부모 상담 주간을 운영한다.') });
    await until(async () => ((await getYear(id)).sources.guide || '').includes('학부모 상담 주간'));
    const n = prompts.length;
    await page.click(`${P} .yp-box ol.steps [data-step="3"]`);
    await until(async () => (await page.textContent(`${P} .yp-box #ypMain`)).includes('학부모 상담'));
    const pr = prompts.slice(n).find(p => p.startsWith('[지침 점검]')) || '';
    assert(pr.includes('학부모 상담 주간') && pr.includes('매일 아침 독서'), '다시 뽑지 않음: ' + pr.slice(0, 200));
    // 붙여 넣은 글을 고쳐도
    await page.click(`${P} .yp-box ol.steps [data-step="1"]`);
    await page.fill(`${P} .yp-box textarea[data-src="guide"]`, '매일 아침 독서 시간을 둔다.');
    await flush();
    assert((await getYear(id)).guide === null, '고친 지침의 항목이 남음');
  }],
  ['[yp-ai-year] AI가 작년 학년도 날짜를 그대로 쓴 일정은 올해 학년도의 같은 달·날로(1·2월은 다음 해)', async () => {
    draftOut = { purpose: '목적', policy: '방침', details: '세부', evaluation: '평가',
      schedule: [{ title: '모집', date: '2026-03-16' }, { title: '골든벨', date: '2026-10-15' }, { title: '겨울 독서', date: '2026-01-14' }, { title: '봄 행사', date: '2027-04-21' }, { title: '윤년', date: '2024-02-29' }], budget: [] };
    const id = await seedYear({ name: '독서교육', year: 2027, goal: '목표', step: 4, maxStep: 4 });
    await page.reload(); await page.waitForTimeout(400); await tab('year');
    await page.click(`${P} [data-y="draft"]`);
    await until(async () => !!((await getYear(id)) || {}).draft);
    const dates = (await getYear(id)).draft.schedule.map(s => s.date);
    draftOut = null;
    assert(JSON.stringify(dates) === JSON.stringify(['2027-03-16', '2027-10-15', '2028-01-14', '2027-04-21', '2028-02-29']), JSON.stringify(dates));
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
