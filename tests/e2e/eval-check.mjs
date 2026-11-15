// 평가 › 기재 점검(스펙 2026-11-13 §4 · 새 모양 2026-11-14-eval-redesign §7): 교과 평어·창체·행특·평가지 채점·단원평가 평어를 규칙으로 훑어
// 「n편을 AI 없이 훑었어요 · 고칠 곳 m곳」, 종류 타일·화면 거르기, 종류별로 묶은 카드에 문제 낱말은 노란 표시 + 번호(색만이 아님), 까닭 칩,
// [AI로 고치기](그 글과 까닭만 — 이름·번호 없음) → 지운 말·더한 말 + 나란히 보기 → [고친 글로 바꾸기]는 그 화면 저장소에(옛 화면 저장이 덮어쓰지 않음, 다시 열어도) ·
// [그대로 두기](세지 않음 · 다시 보기), [그 글로 가기]·쓴 학생 번호 칩, 각 화면의 [기재 점검] 단추, 화면에 올 때마다 다시 점검, AI 키 없으면 안내,
// 390px에서 넘치지 않음. 글·이름은 모두 지어낸 것
import { open, enter, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const S = '앞으로의 성장이 더욱 기대됨.';
const LONG = '모둠 활동에서 친구들의 의견을 귀 기울여 듣고 서로 다른 생각을 하나로 모으며 맡은 역할을 끝까지 책임감 있게 해냄.';
const PLAN = { kind: 'plan', title: '2학기 평가계획', grade: 3, source: '', createdAt: 1, subjects: [{ name: '국어', units: [
  { id: 'u1', subject: '국어', period: '', std: '[4국05-02] 작품을 감상한다.', unit: '1. 이야기', area: '문학', elem: '인물의 마음 짐작하기', focus: '', crit: { top: '', high: '잘 짐작함', mid: '짐작함', low: '도움을 받아 짐작함' } }] }] };
await page.addInitScript(([PLAN, S, LONG]) => {
  if (localStorage.getItem('test:seeded')) return;
  localStorage.setItem('test:seeded', '1');
  localStorage.setItem('ssam:mig:pron', '1'); // 처음 한 번 뜨는 「대명사 줄이기」 안내 창은 이 시험과 상관없음
  localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
  localStorage.setItem('ssam:class', JSON.stringify({ count: 4, except: [] }));
  localStorage.setItem('ssam:plan:P1', JSON.stringify(PLAN)); localStorage.setItem('ssam:plans', JSON.stringify(['P1'])); localStorage.setItem('ssam:prefs', JSON.stringify({ current: 'P1' }));
  localStorage.setItem('ssam:sets:P1', JSON.stringify({ u1_high: { items: [{ t: '토익 공부를 꾸준히 하여 영어 어휘를 넓힘.', d: 0 }, { t: '이야기 속 인물의 마음을 헤아려 자신의 경험과 견주어 말함.', d: 0 }], want: 50 } }));
  localStorage.setItem('ssam:cc', JSON.stringify({ areas: {
    auto: { acts: [{ id: 'a1', name: '1인 1역', desc: '' }], items: { 1: { parts: { a1: { t: '수업 시간에 산만함.', sig: '1인 1역|' } }, d: 0 }, 2: { parts: { a1: { t: '학급에 필요한 역할을 스스로 골라 한 학기 동안 성실하게 해냄.', sig: '1인 1역|' } }, d: 0 } } },
    club: { club: '', acts: [], items: {} }, career: { acts: [], items: {} } }, len: 'mid', grade: 3 }));
  const one = (id, no, text, extra = {}) => ({ id, no, label: '', memo: '메모', done: 0, results: [{ t: text, d: 0, ...extra }] });
  localStorage.setItem('ssam:hk', JSON.stringify({ settings: { unit: 'char', min: 20, max: 60, variants: 2, ending: 'eum', grade: 3 }, students: [
    one('h1', 1, '김하늘은 영어 학원에 다니며 꾸준히 공부함.', { ev: { list: [{ id: 'm1', kind: 'memo', label: '영어 공부' }], sentences: [{ t: '김하늘은 영어 학원에 다니며 꾸준히 공부함.', src: ['m1'] }] } }),
    one('h2', 2, `친구를 먼저 돕는 따뜻한 마음을 지님. ${S}`), one('h3', 3, `맡은 일을 끝까지 해냄. ${S}`), one('h4', 4, LONG)] }));
  localStorage.setItem('ssam:grset', JSON.stringify({ maskOn: false, mask: [] }));
  localStorage.setItem('ssam:grs', JSON.stringify(['g1']));
  localStorage.setItem('ssam:gr:g1', JSON.stringify({ kind: 'gr', title: '수학 3단원 수행평가', unitId: '', criteria: '', critDocs: [], createdAt: 1, settings: { maskOn: false, mask: [], ratio: { top: 10, high: 30, mid: 40, low: 20 } }, students: [
    { id: 's1', no: 1, n: 1, skip: 0, score: 90, level: 'high', text: '교외 수학 경시대회에서 금상을 받을 만큼 계산이 정확함.', d: 0 },
    { id: 's2', no: 2, n: 1, skip: 0, score: 70, level: 'mid', text: '받아올림이 있는 덧셈을 차례대로 바르게 계산함.', d: 0 }] }));
}, [PLAN, S, LONG]);

const calls = [];
await mockClaude(page, ({ prompt }) => {
  if (!prompt.startsWith('[생기부 글 고치기]')) return '[]';
  calls.push(prompt);
  const body = (prompt.split('\n[글]\n')[1] || '').split('\n\n')[0];
  if (body.includes('학원')) return JSON.stringify({ text: '영어 공부를 꾸준히 하며 어휘를 넓혀 감.' });
  if (body.includes('경시대회')) return JSON.stringify({ text: '수학 문제를 끝까지 풀며 계산을 정확하게 해냄.' });
  if (body.includes('토익')) return JSON.stringify({ text: '영어 낱말을 꾸준히 익혀 어휘를 넓힘.' });
  if (body.includes('산만함')) return JSON.stringify({ text: '수업에 집중하는 시간이 점점 늘어남.' });
  if (body.includes('곱셈')) return JSON.stringify({ text: '곱셈을 정확하게 해냄.' });
  return JSON.stringify({ text: '맡은 일을 끝까지 해냄.' });
});
const B = 'section[data-menu="evaluate"] .chk-box';
const ls = k => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
// 머리의 「… n편을 AI 없이 훑었어요」·「기재 점검 · 고칠 곳 m곳」 → 「점검한 글 n개 · 고칠 곳 m곳」
const sum = () => page.evaluate(b => {
  const s = (document.querySelector(b + ' .chk-sum') || {}).textContent || '', h = (document.querySelector(b + ' .chk-head h2') || {}).textContent || '';
  const n = (s.match(/(\d+)편/) || [, 0])[1], m = (h.match(/고칠 곳 (\d+)곳/) || [, 0])[1];
  return `점검한 글 ${n}개 · 고칠 곳 ${m}곳`;
}, B);
// 그 글의 카드(종류를 주면 그 종류 묶음에서)
const row = (label, kind) => page.locator(`${B} ${kind ? `[data-chk-group="${kind}"] ` : ''}.chk-row`, { has: page.locator('.chk-src', { hasText: label }) });
const tabNow = () => page.getAttribute('#menuTabs [aria-current="page"]', 'data-tab');
const goTab = tab => page.evaluate(t => import('./core/shell.js').then(s => s.go('evaluate', t)), tab);
const goCheck = async () => { await goTab('check'); await page.waitForFunction(b => { const s = document.querySelector(b + ' .chk-sum'); return s && /편을 AI 없이|아직 없어요/.test(s.textContent) && !document.querySelector(b).hidden; }, B); };
const noOverflow = () => page.evaluate(b => {
  const W = document.documentElement.clientWidth, bad = [...document.querySelectorAll(b + ' *')].filter(el => el.getBoundingClientRect().right > W + 1);
  return document.documentElement.scrollWidth <= W + 1 && !bad.length;
}, B);

await page.goto(url);
await page.waitForTimeout(400);
// 마친 수학 단원평가(1번 학생) + 그 교과 평어(이름이 든 글)
await page.evaluate(async () => {
  const m = await import('./menus/evaluate/unit/unit-model.js');
  const x = m.newTest({ meta: { subject: '수학', grade: 3, term: 2, unitNo: 3, unitName: '곱셈', round: 1, date: '2026-10-22' }, key: { domains: ['계산'], items: [{ no: 1, content: '곱셈하기', domain: '계산', type: 'short', answer: '345', points: 100, criteria: '', pages: '' }] }, paper: { text: '' } });
  x.done = true;
  x.students = [{ no: 1, skip: false, status: 'done', good: '', cheer: '', items: { 1: { read: '', pts: 100, ai: 100, flag: '', why: '', ok: true, manual: false } } }];
  m.saveTest(x);
  m.savePyeongeo('수학', { off: [], students: { 1: { level: 'top', text: '한가람이 곱셈을 정확하게 해냄.', manual: false } } });
});
await page.reload(); await page.waitForTimeout(500);

await run('eval-check', [
  ['평가 메뉴 끝에 「기재 점검」 탭 → 「점검한 글 11개 · 고칠 곳 9곳」, 종류마다 수(타일)', async () => {
    await page.waitForSelector('nav.app-side [data-menu-go="evaluate"]');
    await page.click('nav.app-side [data-menu-go="evaluate"]');
    const tabs = await page.$$eval('#menuTabs [data-tab]', bs => bs.map(b => b.textContent.trim()));
    // 탭 6칸(스펙 2026-11-14 §1): 한눈에·단원평가·활동지·평가지 채점·생활기록부·기재 점검
    assert(tabs.at(-1) === '기재 점검' && tabs.at(-2) === '생활기록부', tabs.join(','));
    await page.click('#menuTabs [data-tab="check"]');
    await page.waitForFunction(b => /편을 AI 없이/.test((document.querySelector(b + ' .chk-sum') || {}).textContent || ''), B);
    assert(await sum() === '점검한 글 11개 · 고칠 곳 9곳', await sum());
    const kinds = await page.$$eval(`${B} [data-chk-kind]`, bs => bs.map(b => b.textContent.replace(/\s+/g, ' ').trim()));
    assert(JSON.stringify(kinds) === JSON.stringify(['전체 9', '쓰면 안 되는 말 3', '같은 문장 2', '이름·주어 2', '글자 수 1', '부정 표현 1']), JSON.stringify(kinds));
    assert(await page.locator(`${B} .chk-row`).count() === 8, '카드 8개(같은 문장은 한 카드)');
  }],
  ['카드마다 어디·노란 표시 + 번호 기호·까닭 칩, 같은 문장은 쓴 학생 번호, 글자 수는 넘친 곳', async () => {
    const ban = row('행동특성 · 1번', 'ban'), nm = row('행동특성 · 1번', 'name');
    assert(await ban.count() === 1 && await nm.count() === 1, '행특 1번: 쓰면 안 되는 말·이름 카드');
    assert(JSON.stringify(await ban.locator('mark.chk-hit').allTextContents()) === JSON.stringify(['학원']), '학원');
    assert(JSON.stringify(await nm.locator('mark.chk-hit').allTextContents()) === JSON.stringify(['김하늘']), '김하늘');
    const ns = await ban.locator('.chk-text .chk-n [aria-hidden="true"]').allTextContents();
    assert(JSON.stringify(ns) === JSON.stringify(['①']), '번호 기호: ' + JSON.stringify(ns));
    const chip = t => t.replace(/\s+/g, ' ').trim();
    assert(chip(await ban.locator('.chk-why li').first().textContent()).includes('①') && (await ban.locator('.chk-why').textContent()).includes('학원·과외 같은 사교육은 쓰지 않아요'), '사교육 칩');
    assert((await nm.locator('.chk-why').textContent()).includes('학생 이름은 쓰지 않아요'), '이름 칩');
    assert((await ban.locator('.chk-tag').textContent()).trim() === '사교육', '짧은 까닭');
    const bg = await ban.locator('mark.chk-hit').first().evaluate(e => getComputedStyle(e).backgroundColor);
    assert(/rgb\(255, 2[0-9]{2}, 1[0-9]{2}\)/.test(bg), '노란 바탕 ' + bg);
    const dup = page.locator(`${B} [data-chk-group="dup"] .chk-row`);
    assert(await dup.count() === 1, '같은 문장 카드 하나');
    assert((await dup.locator('.chk-src').textContent()).includes('행동특성 · 2명이 똑같이 씀'), await dup.locator('.chk-src').textContent());
    assert((await dup.locator('mark.chk-hit').textContent()) === S, '그 문장');
    assert(JSON.stringify(await dup.locator('[data-chk-who]').allTextContents()) === JSON.stringify(['2', '3']), '쓴 학생 번호');
    const len = row('행동특성 · 4번', 'len');
    assert((await len.locator('.chk-why').textContent()).includes('최대 60자보다'), await len.locator('.chk-why').textContent());
    assert((await len.locator('mark.chk-hit').textContent()).length > 0, '넘친 곳 표시');
    assert((await len.locator('.chk-len .ev-num').textContent()).replace(/\s/g, '') === `${LONG.length}/60자`, await len.locator('.chk-len').textContent());
    for (const l of ['교과 평어 · 국어 · 인물의 마음 짐작하기 · 상', '창의적 체험활동 · 자율·자치활동 · 1번', '평가지 채점 · 수학 3단원 수행평가 · 1번', '단원평가 평어 · 수학 · 1번']) assert(await row(l).count() === 1, l);
  }],
  ['종류·화면으로 거르기', async () => {
    await page.click(`${B} [data-chk-kind="dup"]`);
    assert(await page.locator(`${B} [data-chk-kind="dup"]`).getAttribute('aria-pressed') === 'true', 'pressed');
    assert(await page.locator(`${B} [data-chk-kind=""]`).getAttribute('aria-pressed') === 'false', '전체 안 눌림');
    const groups = await page.$$eval(`${B} [data-chk-group]`, e => e.map(x => x.dataset.chkGroup));
    assert(JSON.stringify(groups) === '["dup"]', JSON.stringify(groups));
    assert(await page.locator(`${B} .chk-row`).count() === 1, '같은 문장 카드만');
    await page.click(`${B} [data-chk-kind=""]`);
    await page.selectOption(`${B} #chkSrc`, 'cc');
    assert(await sum() === '점검한 글 2개 · 고칠 곳 1곳', await sum());
    assert(await page.locator(`${B} .chk-row`).count() === 1, '창체만');
    await page.selectOption(`${B} #chkSrc`, '');
  }],
  ['[AI로 고치기]: 그 글과 까닭만(이름·학생 번호·출처 없음) → 지운 말·더한 말 + 나란히 → [그대로 두기]는 글 그대로, 세지 않음, 다시 보기', async () => {
    const r = row('창의적 체험활동 · 자율·자치활동 · 1번');
    await r.locator('[data-chk-ai]').click();
    await r.locator('.chk-diff').waitFor();
    const p = calls.at(-1);
    assert(p.includes('수업 시간에 산만함.') && p.includes('「산만함」: 성장 중심으로 바꿔 보세요') && p.includes('창의적 체험활동 특기사항'), p.slice(0, 400));
    assert(!/\d+\s*번/.test(p) && !p.includes('자율·자치활동 · 1번'), '번호·출처');
    const cols = await r.locator('.chk-fix .chk-col').allTextContents();
    assert(cols.length === 2 && cols[0].includes('지금 글') && cols[0].includes('수업 시간에 산만함.') && cols[1].includes('고친 안') && cols[1].includes('수업에 집중하는 시간이 점점 늘어남.'), JSON.stringify(cols));
    await r.locator('[data-chk-keep]').click();
    await page.waitForFunction(b => !document.querySelector(b + ' [data-chk-group="neg"]'), B);
    assert(await sum() === '점검한 글 11개 · 고칠 곳 8곳', await sum());
    assert((await ls('ssam:cc')).areas.auto.items[1].parts.a1.t === '수업 시간에 산만함.', '그대로');
    assert((await ls('ssam:check:keep')).length === 1, '그대로 둔 곳 저장');
    await page.click(`${B} [data-chk-unkeep]`);
    await row('창의적 체험활동 · 자율·자치활동 · 1번').waitFor();
    assert(await sum() === '점검한 글 11개 · 고칠 곳 9곳', await sum());
    assert((await ls('ssam:check:keep') || []).length === 0, '다시 보기');
  }],
  ['[고친 글로 바꾸기](행특·근거 있는 글): 화면 상태와 저장소가 바뀌고 다시 점검, 다시 열어도 그대로, 행특 화면에 「고친 글」', async () => {
    const r = row('행동특성 · 1번', 'ban');
    await r.locator('[data-chk-ai]').click();
    await r.locator('.chk-diff').waitFor();
    const p = calls.at(-1);
    assert(!p.includes('김하늘') && p.includes('○○○은 영어 학원에 다니며') && !/\d+\s*번/.test(p) && !p.includes('행동특성 · 1번'), p.slice(0, 500));
    assert(await row('행동특성 · 1번', 'name').locator('.chk-diff').count() === 1, '같은 글의 다른 카드도 고친 글');
    await r.locator('[data-chk-apply]').click();
    await page.waitForFunction(b => document.querySelector(b + ' .chk-head h2').textContent.includes('고칠 곳 7곳'), B);
    assert(await row('행동특성 · 1번').count() === 0, '고칠 곳이 없어 빠짐');
    const hk = await ls('ssam:hk');
    assert(hk.students[0].results[0].t === '영어 공부를 꾸준히 하며 어휘를 넓혀 감.' && hk.students[0].results[0].ev, JSON.stringify(hk.students[0].results[0]));
    await page.reload(); await page.waitForTimeout(500);
    await goCheck();
    assert((await sum()).includes('고칠 곳 7곳'), await sum());
    await goTab('hk');
    await page.click('[data-hkstu="h1"]');
    await page.waitForSelector('#hkEditor .hk-text');
    assert((await page.textContent('#hkEditor .hk-text')).includes('영어 공부를 꾸준히 하며 어휘를 넓혀 감.'), await page.textContent('#hkEditor .hk-text'));
    assert((await page.textContent('#hkEditor')).includes('고친 글'), '「고친 글」');
    await page.waitForTimeout(800); // 옛 화면의 미뤄 둔 저장이 덮어쓰지 않음
    assert((await ls('ssam:hk')).students[0].results[0].t === '영어 공부를 꾸준히 하며 어휘를 넓혀 감.', '덮어씀');
  }],
  ['[고친 글로 바꾸기]: 교과 평어(연 평가계획)·창체·평가지 채점(열지 않은 기록)·단원평가 평어도 저장소에, 다시 열어도', async () => {
    await goCheck();
    for (const l of ['교과 평어 · 국어 · 인물의 마음 짐작하기 · 상', '창의적 체험활동 · 자율·자치활동 · 1번', '평가지 채점 · 수학 3단원 수행평가 · 1번', '단원평가 평어 · 수학 · 1번']) {
      const r = row(l);
      await r.locator('[data-chk-ai]').click();
      await r.locator('[data-chk-apply]').click();
      await page.waitForFunction(([b, l]) => ![...document.querySelectorAll(b + ' .chk-row .chk-src')].some(e => e.textContent.trim().startsWith(l)), [B, l]);
    }
    assert((await sum()).includes('고칠 곳 3곳'), await sum());
    const un = calls.at(-1);
    assert(!un.includes('한가람') && un.includes('교과학습발달상황'), un.slice(0, 300));
    await page.waitForTimeout(700); // 옛 화면의 미뤄 둔 저장이 있다면 지난 뒤
    await page.reload(); await page.waitForTimeout(500);
    assert((await ls('ssam:sets:P1')).u1_high.items[0].t === '영어 낱말을 꾸준히 익혀 어휘를 넓힘.', JSON.stringify(await ls('ssam:sets:P1')));
    assert((await ls('ssam:cc')).areas.auto.items[1].parts.a1.t === '수업에 집중하는 시간이 점점 늘어남.', '창체');
    assert((await ls('ssam:gr:g1')).students[0].text === '수학 문제를 끝까지 풀며 계산을 정확하게 해냄.', '채점');
    assert((await ls('ssam:unit:pyeongeo:수학')).students[1].text === '곱셈을 정확하게 해냄.', '단원평가 평어');
    await goCheck();
    assert(await sum() === '점검한 글 11개 · 고칠 곳 3곳', await sum());
  }],
  ['[그 글로 가기]·쓴 학생 번호: 그 탭 · 그 학생(문장)', async () => {
    // 다시 고칠 곳이 있는 글(창체 1번·채점 2번·교과 평어 2번째 문장)
    await page.evaluate(() => {
      const cc = JSON.parse(localStorage.getItem('ssam:cc')); cc.areas.auto.items[1].parts.a1.t = '수업 시간에 산만함.'; localStorage.setItem('ssam:cc', JSON.stringify(cc));
      const g = JSON.parse(localStorage.getItem('ssam:gr:g1')); g.students[1].text = '영어 학원에서 배운 덧셈 방법을 설명함.'; localStorage.setItem('ssam:gr:g1', JSON.stringify(g));
      const p = JSON.parse(localStorage.getItem('ssam:sets:P1')); p.u1_high.items[1].t = '학원에서 읽은 이야기를 친구에게 들려줌.'; localStorage.setItem('ssam:sets:P1', JSON.stringify(p));
    });
    await page.reload(); await page.waitForTimeout(500);
    await goCheck();
    await row('평가지 채점 · 수학 3단원 수행평가 · 2번').locator('[data-chk-go]').click();
    await page.waitForFunction(() => document.activeElement && document.activeElement.matches('#grResults [data-grcopy="s2"]'));
    assert(await tabNow() === 'gr', await tabNow());
    await goCheck();
    await row('교과 평어 · 국어 · 인물의 마음 짐작하기 · 상').locator('[data-chk-go]').click();
    await page.waitForFunction(() => document.activeElement && document.activeElement.matches('#listBox [data-i="1"]'));
    assert(await tabNow() === 'pyeongeo' && await page.getAttribute('#lvTabs [aria-selected="true"]', 'data-lv') === 'high', await tabNow());
    await goCheck();
    await page.click(`${B} [data-chk-group="dup"] [data-chk-who]:text-is("2")`);
    await page.waitForFunction(() => document.activeElement && document.activeElement.closest && !!document.activeElement.closest('#hkEditor'));
    assert(await tabNow() === 'hk', await tabNow());
    assert((await page.textContent('#hkEditor .hk-top .badge')).trim() === '2', '2번');
    await goCheck();
    await row('창의적 체험활동 · 자율·자치활동 · 1번').locator('[data-chk-go]').click();
    await page.waitForFunction(() => document.activeElement && document.activeElement.matches('[data-cccopy="1"]'));
    assert(await tabNow() === 'cc', await tabNow());
    // 평가지 채점 화면의 [기재 점검] 단추로 오면 그 화면 글만
    await enter(page, 'evaluate', 'gr');
    await page.waitForSelector('[data-grhist="g1"]');
    await page.click('[data-grhist="g1"]');
    await page.waitForSelector('#grResults [data-eval-check="gr"]');
    await page.click('#grResults [data-eval-check="gr"]');
    await page.waitForFunction(b => { const s = document.querySelector(b + ' #chkSrc'); return s && s.value === 'gr' && !document.querySelector(b).hidden; }, B);
    assert(await tabNow() === 'check', await tabNow());
    assert((await sum()).includes('점검한 글 2개'), await sum());
  }],
  ['각 화면의 [기재 점검] 단추 → 그 화면 글만 · 화면에 올 때마다 다시 점검', async () => {
    await goTab('hk');
    await page.click('[data-hkstu="h1"]');
    await page.click('#hkEditor [data-hkr="edit"][data-i="0"]');
    await page.fill('#hkEditor [data-edit="0"]', '방과후 수학 과외를 받으며 계산 실력을 키움.');
    await page.click('#hkEditor [data-hkr="edit"][data-i="0"]');
    await page.click('#hkList [data-eval-check="hk"]');
    await page.waitForFunction(b => document.querySelector(b + ' #chkSrc').value === 'hk' && /행동특성 4편/.test(document.querySelector(b + ' .chk-sum').textContent), B);
    const r = row('행동특성 · 1번');
    await r.waitFor();
    assert(JSON.stringify(await r.locator('mark.chk-hit').allTextContents()) === JSON.stringify(['과외']), '고친 글을 다시 점검');
    await enter(page, 'evaluate', 'unit');
    await page.click('section[data-menu="evaluate"] .unit-box [data-unv="results"]');
    await page.click('section[data-menu="evaluate"] .unit-box [data-rv="pyeongeo"]');
    await page.click('section[data-menu="evaluate"] .unit-box [data-eval-check="unit"]');
    await page.waitForFunction(b => document.querySelector(b + ' #chkSrc').value === 'unit', B);
    assert(await sum() === '점검한 글 1개 · 고칠 곳 0곳', await sum());
    assert((await page.textContent(B)).includes('고칠 곳이 없어요'), '빈 목록 안내');
    for (const k of ['py', 'cc']) {
      await goTab(k === 'py' ? 'pyeongeo' : 'cc');
      if (k === 'cc') { await page.waitForSelector('#ccResults [data-eval-check="cc"]', { state: 'attached' }); await page.evaluate(() => document.querySelector('#ccResults [data-eval-check="cc"]').click()); }
      else await page.click('#pane [data-eval-check="py"]');
      await page.waitForFunction(([b, k]) => document.querySelector(b + ' #chkSrc').value === k && !document.querySelector(b).hidden, [B, k]);
    }
    await page.selectOption(`${B} #chkSrc`, '');
  }],
  ['단원평가 평어 [그 글로 가기]: 결과 모아 보기 › 교과 평어로 넘기기의 그 학생 칸', async () => {
    await page.evaluate(async () => { const m = await import('./menus/evaluate/unit/unit-model.js'); const v = m.getPyeongeo('수학'); v.students[1].text = '김하늘이 곱셈을 정확하게 해냄.'; m.savePyeongeo('수학', v); });
    await goCheck();
    await row('단원평가 평어 · 수학 · 1번').locator('[data-chk-go]').click();
    await page.waitForFunction(() => document.activeElement && document.activeElement.matches('textarea[data-py="1"]'));
    assert(await tabNow() === 'unit', await tabNow());
  }],
  ['단원평가 평어만 볼 때 [나이스 차례로 복사하러 가기]는 교과 평어 학생별 화면(그 [나이스 차례로 복사])으로 — 창체가 아님', async () => {
    await goCheck();
    await page.selectOption(`${B} #chkSrc`, 'unit');
    await page.click(`${B} [data-chk-neis]`);
    await page.waitForFunction(() => document.querySelector('section[data-menu="evaluate"] [data-py="neis"]')?.checkVisibility(), null, { timeout: 8000 });
    assert(await page.evaluate(() => !!document.querySelector('section[data-menu="evaluate"] [data-py="neis"]')), '학생별 화면이 아님: ' + await tabNow());
    await goCheck();
    await page.selectOption(`${B} #chkSrc`, '');
  }],
  ['AI 키가 없으면 [AI로 고치기]는 짧은 안내', async () => {
    await page.evaluate(() => localStorage.setItem('ssam:engine', JSON.stringify({ engine: '', keys: {}, remember: true })));
    await page.reload(); await page.waitForTimeout(500);
    await goCheck();
    const n = calls.length;
    const r = row('단원평가 평어 · 수학 · 1번');
    await r.locator('[data-chk-ai]').click();
    await r.locator('.chk-hint').waitFor();
    assert((await r.locator('.chk-hint').textContent()).includes('AI 키'), await r.locator('.chk-hint').textContent());
    assert(calls.length === n, 'AI를 부르지 않음');
  }],
  ['390px: 가로로 넘치지 않음, 누르는 칸 44px', async () => {
    await page.setViewportSize({ width: 390, height: 800 });
    try {
      await page.waitForTimeout(200);
      assert(await noOverflow(), '넘침');
      // 숨긴 읽기 글(.sr-only)이 문서를 늘려 화면 전체가 밀리지 않음(아래 탭이 화면 아래에 붙어 있게)
      const d = await page.evaluate(() => [document.documentElement.scrollHeight, innerHeight]);
      assert(d[0] <= d[1] + 1, '문서 높이 ' + d);
      const hs = await page.$$eval(`${B} button, ${B} select`, bs => bs.filter(b => b.offsetParent).map(b => Math.round(b.getBoundingClientRect().height)));
      assert(hs.length && hs.every(h => h >= 44), '높이 ' + hs.join(','));
    } finally { await page.setViewportSize({ width: 1280, height: 860 }); }
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join('\n')); }]
]);
await t.close();
