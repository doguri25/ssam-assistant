// 단원평가 평가 하나(스펙 2026-11-14-eval-redesign §3-2)와 채점 확인(§4):
// 3단계 학생 × 문항 지도(칸 모양·확인할 칸 테두리·정답률 줄·점수, 칸을 누르면 칸 확인 창), 오른쪽 「쌤비서가 찾은 것」(같은 실수 묶음 → 5분 보충 활동 칸,
// 선생님 차례 → 확인 화면, 생활기록부로 이어서), 채점 확인 화면(판단을 미룬 칸만 하나씩 — 목록·학생 답·기준·쌤비서 생각, 칸 확인 창과 같은 저장,
// ← →는 화면 안에서만, 다 정하면 「다 확인했어요」), 한눈에가 부를 openReview, 390px. 학생·교과 글은 모두 지어낸 것
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const V = 'section[data-menu="evaluate"] .unit-box', SH = '#sheetRoot .sheet';
const over = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const T = id => page.evaluate(id => JSON.parse(localStorage.getItem('ssam:unit:t:' + id)), id);
const cur = () => page.$eval(`${V} .ev-rv-item[aria-current="true"]`, b => b.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
await page.clock.setFixedTime(new Date('2026-11-14T10:00:00'));
await page.goto(url);
await page.waitForTimeout(400);
// 수학 2단원(채점 중): 6명 중 5명 채점. 2·3번은 2번·4번을 틀림(같은 실수), 1번 5번(서술형) 미룬 칸, 4번 1번 글자가 다른 단답, 5번 5번 검토 의견, 6번 아직
await page.evaluate(async () => {
  const M = await import('./menus/evaluate/unit/unit-model.js');
  const items = [
    { no: 1, content: '나눗셈하기', domain: '계산', type: 'short', answer: '7', points: 20, criteria: '', pages: '' },
    { no: 2, content: '나머지 구하기', domain: '계산', type: 'choice', answer: '②', points: 20, criteria: '', pages: '' },
    { no: 3, content: '나눗셈의 뜻', domain: '이해', type: 'choice', answer: '③', points: 20, criteria: '', pages: '' },
    { no: 4, content: '몫과 나머지 문장제', domain: '적용', type: 'choice', answer: '④', points: 20, criteria: '', pages: '' },
    { no: 5, content: '나눗셈 문장제 풀이 쓰기', domain: '적용', type: 'essay', answer: '28÷4=7, 7명', points: 20, criteria: '식과 답을 모두 쓰면 20점', pages: '' }
  ];
  const cell = (pts, read, more = {}) => ({ read, pts, ai: pts, ai0: pts, flag: '', why: '', ok: true, manual: false, ...more });
  const x = M.newTest({ meta: { subject: '수학', grade: 3, term: 2, unitNo: 2, unitName: '나눗셈', round: 1, date: '2026-11-12' }, key: { domains: ['계산', '이해', '적용'], items }, paper: { text: '' } });
  x.id = 'm2';
  x.students = [1, 2, 3, 4, 5, 6].map(no => {
    if (no === 6) return { no, skip: false, status: 'idle', items: {}, good: '', cheer: '' };
    const its = Object.fromEntries(items.map(it => [it.no, cell(20, it.answer)]));
    if (no === 2 || no === 3) { its[2] = cell(0, '①'); its[4] = cell(0, '②'); }
    if (no === 1) its[5] = cell(10, '28÷4=7', { flag: 'essay', ok: false, why: '답을 쓰지 않음' });
    if (no === 4) its[1] = cell(20, '칠', { flag: 'similar', ok: false, why: '칠을 7로 봄' });
    if (no === 5) its[5] = cell(20, '28÷4=7 답 7명', { rv: { read: '28÷4=7 답 7', points: 10, why: '단위가 빠짐', agree: false } });
    return { no, skip: false, status: 'done', items: its, good: '', cheer: '' };
  });
  M.saveTest(x);
});
await page.evaluate(() => import('./core/shell.js').then(s => s.go('evaluate', 'unit')));
await page.waitForSelector(`${V} .un-list`); // 마친 평가가 없으면 첫 화면은 평가 목록
await page.click(`${V} [data-un-open="m2"]`);
await page.waitForSelector(`${V} .un-heat`);

await run('unit-confirm', [
  ['3단계 학생 × 문항 지도: 맞음·틀림·아직 칸, 확인할 칸 테두리, 문항 머리·정답률(70% 아래 주황), 점수', async () => {
    const cls = (no, it) => page.getAttribute(`${V} [data-cell="${no}-${it}"]`, 'class');
    assert((await cls(1, 1)).includes('hc-ok') && (await cls(2, 2)).includes('hc-no') && (await cls(6, 1)).includes('hc-wait'), `${await cls(1, 1)} | ${await cls(2, 2)} | ${await cls(6, 1)}`);
    assert((await cls(1, 5)).includes('hc-part') && (await cls(1, 5)).includes('hc-chk') && (await cls(1, 5)).includes('chk'), '미룬 칸: ' + await cls(1, 5));
    assert((await cls(5, 5)).includes('hc-chk') && (await cls(5, 5)).includes('rvo'), '검토 의견 칸: ' + await cls(5, 5));
    assert((await page.getAttribute(`${V} [data-cell="2-2"]`, 'aria-label')) === '2번 2번 문항 · 틀림', await page.getAttribute(`${V} [data-cell="2-2"]`, 'aria-label'));
    const head = await page.$$eval(`${V} .un-heat thead [data-item]`, a => a.map(b => b.classList.contains('low')));
    assert(JSON.stringify(head) === '[false,true,false,true,false]', '머리 주황: ' + JSON.stringify(head));
    const rate = await page.$$eval(`${V} .un-heat tfoot .un-rate td .hh`, a => a.map(x => [x.textContent.trim(), x.classList.contains('low')]));
    assert(JSON.stringify(rate) === '[["100%",false],["60%",true],["100%",false],["60%",true],["90%",false]]', JSON.stringify(rate));
    assert((await page.textContent(`${V} tr[data-strow="2"] td.num`)).trim() === '60/100', '점수');
    assert((await page.textContent(`${V} #unPending`)).includes('확인할 칸 2개'), await page.textContent(`${V} #unPending`));
  }],
  ['칸을 누르면 지금처럼 그 칸 확인 창(점수 고치기)', async () => {
    await page.click(`${V} [data-cell="2-1"]`);
    await page.waitForSelector(`${SH} #unCellOk`);
    assert((await page.textContent(SH)).includes('2번 · 1번 문항'), '창');
    await page.click(`${SH} [data-close]`);
  }],
  ['쌤비서가 찾은 것: 같은 실수 묶음(번호 칩) → [5분 보충 활동지]는 4단계 그 묶음 활동 칸, 선생님 차례 수, 생활기록부로 이어서', async () => {
    const g = (await page.textContent(`${V} .un-found .un-fg`)).replace(/\s+/g, ' ');
    assert(/2번 · ①을 고름 2명/.test(g) && g.includes('5분 보충 활동지'), g);
    assert(JSON.stringify(await page.$$eval(`${V} .un-found .un-fg >> nth=0 >> .ev-chip`, a => a.map(x => x.textContent))) === '["2","3"]', '번호 칩');
    assert((await page.textContent(`${V} .un-found [data-un="review"]`)).includes('선생님 차례 · 3개'), '미룬 칸 + 검토 의견 3개');
    assert((await page.textContent(`${V} .un-recard`)).includes('5 / 6'), '채점 막대');
    await page.click(`${V} .un-recard [data-go-record]`);
    await page.waitForFunction(() => /채점 마치기/.test(document.querySelector('#toast').textContent));
    await page.click(`${V} .un-found .un-fg >> nth=0 >> [data-un="miss5"]`);
    assert((await page.textContent(`${V} .steps li.cur`)).includes('피드백'), '4단계');
    assert(await page.evaluate(() => { const a = document.activeElement; return !!(a && a.matches('textarea[data-miss="2-0"]')); }), '그 묶음의 5분 보충 활동 칸에 초점');
    await page.click(`${V} .steps [data-step="3"]`);
  }],
  ['[확인할 것만 보기] → 채점 확인: 확인할 칸 목록(번호 · 문항), 첫 칸의 학생 답·기준·쌤비서 생각', async () => {
    await page.click(`${V} .un-gtool [data-un="review"]`);
    await page.waitForSelector(`${V} #unRv`);
    const list = await page.$$eval(`${V} .ev-rv-item`, a => a.map(b => b.textContent.replace(/\s+/g, ' ').trim()));
    assert(JSON.stringify(list) === '["1번 · 5번 문항","4번 · 1번 문항","5번 · 5번 문항"]', JSON.stringify(list));
    assert(await cur() === '1번 · 5번 문항', await cur());
    assert((await page.textContent(`${V} .ev-rv-answer`)).trim() === '28÷4=7', '학생 답');
    assert((await page.textContent(`${V} .ev-rv-q`)).includes('5번 문항 · 20점 · 서술형'), '문항');
    assert((await page.textContent(`${V} .un-rv-crit`)).includes('28÷4=7, 7명') && (await page.textContent(`${V} .un-rv-crit`)).includes('식과 답을 모두 쓰면 20점'), '기준');
    const opts = await page.$$eval(`${V} .ev-rv-opt`, a => a.map(b => [b.querySelector('.ev-num').textContent, b.classList.contains('ai')]));
    assert(JSON.stringify(opts) === '[["20",false],["10",true],["0",false]]', '점수 단추·쌤비서 생각: ' + JSON.stringify(opts));
    const why = await page.textContent(`${V} .un-rv-why`);
    assert(why.includes('서술형이라 AI가 점수를 제안했어요') && why.includes('답을 쓰지 않음') && why.includes('부분 점수 10점으로 정하기'), why);
    assert((await page.textContent(`${V} .un-rv-sum`)).includes('판단을 미룬 칸 3개'), await page.textContent(`${V} .un-rv-sum`));
  }],
  ['[쌤비서 생각으로 정하기] → 칸 확인 창과 같은 저장(ok, 고치지 않음), 다음 칸으로', async () => {
    await page.click(`${V} [data-rvw="accept"]`);
    const c = (await T('m2')).students[0].items[5];
    assert(c.ok === true && c.pts === 10 && c.manual === false, JSON.stringify(c));
    assert(await cur() === '4번 · 1번 문항', await cur());
    assert(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-rvw="accept"]')), '초점은 다음 칸의 [정하기]');
    assert((await page.getAttribute(`${V} .ev-rv-item >> nth=0`, 'class')).includes('done'), '정한 칸 표시');
  }],
  ['← →: 화면 안에 초점이 있을 때만 앞뒤 칸으로(문서 전체에는 듣지 않음)', async () => {
    await page.keyboard.press('ArrowRight');
    assert(await cur() === '5번 · 5번 문항', '→ ' + await cur());
    await page.keyboard.press('ArrowLeft');
    assert(await cur() === '4번 · 1번 문항', '← ' + await cur());
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('ArrowRight');
    assert(await cur() === '4번 · 1번 문항', '화면 밖에서는 그대로: ' + await cur());
  }],
  ['다른 점수 단추 → 선생님이 고친 칸(manual), 검토 의견 칸은 [검토 AI 안으로], 다 정하면 「다 확인했어요」 → 결과로', async () => {
    await page.click(`${V} .ev-rv-opt[data-rvw-pts="0"]`);
    const c = (await T('m2')).students[3].items[1];
    assert(c.ok && c.pts === 0 && c.manual === true, JSON.stringify(c));
    assert(await cur() === '5번 · 5번 문항', await cur());
    assert((await page.textContent(`${V} .un-rv-why`)).includes('검토 AI는'), '검토 의견');
    await page.click(`${V} [data-rvw="useRv"]`);
    const r = (await T('m2')).students[4].items[5];
    assert(r.pts === 10 && r.ok && r.rv.done === 'review', JSON.stringify(r));
    await page.waitForSelector(`${V} .un-rv-fin`);
    assert((await page.textContent(`${V} .un-rv-fin h3`)).trim() === '다 확인했어요', '끝');
    assert(await page.evaluate(() => document.activeElement && document.activeElement.matches('.un-rv-fin h3')), '초점');
    // 한눈에의 셈과 같음: 남은 확인할 칸 0
    const left = await page.evaluate(async () => (await import('./menus/evaluate/eval-stage.js')).unitPending(JSON.parse(localStorage.getItem('ssam:unit:t:m2'))));
    assert(left === 0, '남은 칸 ' + left);
    await page.click(`${V} .un-rv-fin [data-rvw="map"]`);
    assert((await page.textContent(`${V} .steps li.cur`)).includes('채점·확인'), '3단계 지도로');
    assert(!(await page.locator(`${V} .un-gtool [data-un="review"]`).count()), '확인할 것이 없으면 단추 없음');
  }],
  ['한눈에가 부를 openReview(id): 확인할 칸이 없으면 「확인할 칸이 없어요」, 정한 칸을 다시 열면 지금 점수', async () => {
    await page.evaluate(() => import('./menus/evaluate/unit/unit.js').then(u => u.openReview('m2')));
    await page.waitForSelector(`${V} .un-rv-fin`);
    assert((await page.textContent(`${V} .un-rv-fin h3`)).trim() === '확인할 칸이 없어요', await page.textContent(`${V} .un-rv-fin h3`));
    // 새로 미룬 칸이 생기면 끝에 붙음
    await page.evaluate(async () => {
      const M = await import('./menus/evaluate/unit/unit-model.js'), u = await import('./menus/evaluate/unit/unit.js');
      const x = M.getTest('m2'); x.students[1].items[3] = { ...x.students[1].items[3], flag: 'low', ok: false }; M.saveTest(x);
      u.openReview('m2');
    });
    assert(await cur() === '2번 · 3번 문항', await cur());
    await page.click(`${V} [data-rvw="accept"]`);
    await page.click(`${V} .ev-rv-item >> nth=0`);
    assert(await page.getAttribute(`${V} .ev-rv-opt[data-rvw-pts="20"]`, 'aria-pressed') === 'true', '정한 점수 눌림');
  }],
  ['390px: 지도·확인 화면이 가로로 넘치지 않고(지도는 상자 안에서 밂), 누르는 칸 44px', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await over() <= 0, '확인 화면 ' + await over());
    const h = await page.$$eval(`${V} .ev-rv-item, ${V} .ev-rv-opt, ${V} #unRv .btn`, a => Math.min(...a.filter(x => x.offsetParent).map(x => x.getBoundingClientRect().height)));
    assert(h >= 44, '높이 ' + h);
    await page.click(`${V} [data-rvw="map"] >> nth=0`);
    assert(await over() <= 0, '지도 ' + await over());
    const cell = await page.$eval(`${V} [data-cell="1-1"]`, b => { const r = b.getBoundingClientRect(); return [r.width, r.height]; });
    assert(cell[0] >= 44 && cell[1] >= 44, '칸 ' + cell);
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['교과를 적지 않은 평가만 마쳤으면 [평어 초안 미리 보기]에서 교과를 적으라고 알림(「마친 단원평가가 없어요」가 아님)', async () => {
    await page.evaluate(async () => {
      const M = await import('./menus/evaluate/unit/unit-model.js'), u = await import('./menus/evaluate/unit/unit.js');
      const x = M.getTest('m2'); x.id = 'nosub'; x.done = true; x.meta = { ...x.meta, subject: '' }; M.saveTest(x);
      u.openTest('nosub', 3);
    });
    await page.click(`${V} [data-go-record]`);
    await page.waitForSelector(`${V} .un-pyview`);
    const txt = await page.textContent(`${V} .un-pyview`);
    assert(!txt.includes('마친 단원평가가 없어요') && txt.includes('교과를 적'), txt.replace(/\s+/g, ' ').slice(0, 200));
    await page.click(`${V} [data-rv="table"]`);
    await page.waitForSelector(`${V} .un-one`);
  }],
  ['키보드: 평가 목록에서 Tab으로 평가 카드에 가서 Enter로 그 평가를 엶', async () => {
    await page.click(`${V} [data-unv="list"]`);
    await page.waitForSelector(`${V} .un-list`);
    await page.focus(`${V} [data-un="sample"]`);
    await page.keyboard.press('Tab');
    const at = await page.evaluate(() => { const a = document.activeElement, c = a && a.closest('[data-un-open]'); return c ? `${c.dataset.unOpen}:${a.dataset.un || 'open'}` : a.outerHTML.slice(0, 80); });
    assert(/^(m2|nosub):open$/.test(at), '[예시로 채우기] 다음 초점: ' + at);
    await page.keyboard.press('Enter');
    await page.waitForSelector(`${V} #unFlow`);
    assert(await page.textContent(`${V} .un-title`) === '3학년 수학 2단원 나눗셈 (1회)' || at.startsWith('nosub'), await page.textContent(`${V} .un-title`));
    await page.click(`${V} [data-un="back"]`);
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
