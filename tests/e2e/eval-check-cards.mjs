// 평가 › 기재 점검 새 모양(스펙 2026-11-14-eval-redesign §7): 0인 타일은 파랑 체크, 타일을 다시 누르면 전체로,
// 카드의 어디(… · n번 · n번째 문장)와 걸린 문장만, 검토 AI가 이미 낸 고친 문장은 AI를 부르지 않고 지운 말·더한 말로 → [고친 글로 바꾸기],
// [그대로 두기]는 다시 열어도 세지 않음(check:keep), 같은 문장은 [학생마다 다르게 쓰기](한 명씩 — 이름·번호 없이) → 학생마다 바꾸기,
// 오른쪽 「나이스에 넣기 전 마지막 점검」(살펴본 곳/전체·모든 학생 글·종류별 남은 수·나이스 차례로 복사하러 가기), 390px. 글·이름은 모두 지어낸 것
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const S2 = '모둠 활동에서 서로의 생각을 존중하며 협력함.';
await page.addInitScript(([S2]) => {
  if (localStorage.getItem('test:seeded')) return;
  localStorage.setItem('test:seeded', '1');
  localStorage.setItem('ssam:mig:pron', '1');
  localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
  localStorage.setItem('ssam:class', JSON.stringify({ count: 3, except: [] }));
  localStorage.setItem('ssam:grs', JSON.stringify(['g1'])); // 고칠 곳 없는 평가지 채점 평어(1번만)
  localStorage.setItem('ssam:gr:g1', JSON.stringify({ kind: 'gr', title: '수학 수행평가', createdAt: 1, students: [{ id: 's1', no: 1, n: 1, skip: 0, score: 90, level: 'high', text: '받아올림이 있는 덧셈을 바르게 계산함.', d: 0 }] }));
  localStorage.setItem('ssam:cc', JSON.stringify({ areas: {
    auto: { acts: [{ id: 'a1', name: '1인 1역', desc: '' }], items: { 1: { parts: { a1: { t: '수업 시간에 산만함.', sig: '1인 1역|', rvd: 1, rv: { problem: '부정 표현', fix: '수업에 집중하는 시간이 점점 늘어남.' } } }, d: 0 } } },
    club: { club: '', acts: [], items: {} }, career: { acts: [], items: {} } }, len: 'mid', grade: 3 }));
  const one = (id, no, text) => ({ id, no, label: '', memo: '메모', done: 0, results: [{ t: text, d: 0 }] });
  localStorage.setItem('ssam:hk', JSON.stringify({ settings: { unit: 'char', min: 20, max: 80, variants: 2, ending: 'eum', grade: 3 }, students: [
    one('h1', 1, '이 학생은 발표를 즐겨 함. 영어 학원에서 배운 낱말을 씀.'), one('h2', 2, `${S2} 친구를 잘 도움.`), one('h3', 3, `${S2} 맡은 일을 해냄.`)] }));
}, [S2]);
const calls = [];
await mockClaude(page, ({ prompt }) => {
  if (!prompt.startsWith('[생기부 글 고치기]')) return '[]';
  calls.push(prompt);
  const body = (prompt.split('\n[글]\n')[1] || '').split('\n\n')[0];
  if (body.includes('도움')) return JSON.stringify({ text: '모둠 활동에서 친구의 생각을 귀 기울여 듣고 함께 답을 찾음. 친구를 잘 도움.' });
  if (body.includes('해냄')) return JSON.stringify({ text: '모둠에서 맡은 역할을 정해 끝까지 책임 있게 해냄. 맡은 일을 해냄.' });
  return JSON.stringify({ text: '발표를 즐겨 함.' });
});
const B = 'section[data-menu="evaluate"] .chk-box';
const ls = k => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const tiles = () => page.$$eval(`${B} [data-chk-kind]`, bs => bs.map(b => b.textContent.replace(/\s+/g, ' ').trim()));
const card = (kind, label) => page.locator(`${B} [data-chk-group="${kind}"] .chk-row`, { has: page.locator('.chk-src', { hasText: label }) });
const fin = () => page.textContent(`${B} .chk-final`).then(x => x.replace(/\s+/g, ' '));
const strip = l => l.map(x => x.replace(/^(지운|더한) 말: /, ''));
const goCheck = async () => {
  await page.evaluate(() => import('./core/shell.js').then(s => s.go('evaluate', 'check')));
  await page.waitForFunction(b => /편을 AI 없이/.test((document.querySelector(b + ' .chk-sum') || {}).textContent || '') && !document.querySelector(b).hidden, B);
};

await page.goto(url);
await page.waitForTimeout(400);

await run('eval-check-cards', [
  ['타일: 종류마다 수, 0이면 파랑 체크, 쓰면 안 되는 말은 주황 · 오른쪽 마지막 점검', async () => {
    await goCheck();
    assert(JSON.stringify(await tiles()) === JSON.stringify(['전체 5', '쓰면 안 되는 말 1', '같은 문장 2', '이름·주어 1', '글자 수 0', '부정 표현 1']), JSON.stringify(await tiles()));
    const cls = k => page.getAttribute(`${B} [data-chk-kind="${k}"]`, 'class');
    assert((await cls('len')).includes('ok') && await page.locator(`${B} [data-chk-kind="len"] svg`).count() === 1, '0은 파랑 체크');
    assert((await cls('ban')).includes('turn') && !(await cls('dup')).includes('ok'), '주황');
    const bg = await page.$eval(`${B} [data-chk-kind="len"]`, e => getComputedStyle(e).backgroundColor);
    const soft = await page.evaluate(() => { const d = document.createElement('div'); d.style.background = 'var(--accent-soft)'; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; });
    assert(bg === soft, `0 타일 바탕 ${bg} / ${soft}`);
    const f = await fin();
    assert(f.includes('나이스에 넣기 전 마지막 점검') && f.includes('0 / 5 살펴봄'), f);
    assert(f.includes('글이 없는 학생이 있어요') && f.includes('창의적 체험활동 · 자율·자치활동 2·3번'), f);
    assert(f.includes('글자 수를 넘은 글이 없어요') && f.includes('쓰면 안 되는 말 1곳') && f.includes('같은 문장 2곳'), f);
    assert(await page.locator(`${B} .chk-aside .ai-note`).count() === 1, '「AI로 가는 것」');
  }],
  ['카드: 어디(… · n번 · n번째 문장)와 걸린 문장만, 짧은 까닭', async () => {
    const ban = card('ban', '행동특성 · 1번'), nm = card('name', '행동특성 · 1번');
    assert((await ban.locator('.chk-src').textContent()).trim() === '행동특성 · 1번 · 2번째 문장', await ban.locator('.chk-src').textContent());
    assert((await ban.locator('.chk-src b').textContent()) === '1번', '번호 굵게');
    assert((await ban.locator('.chk-text').textContent()).replace(/[①\s]|\(고칠 곳 1\)/g, '') === '…영어학원에서배운낱말을씀.', await ban.locator('.chk-text').textContent());
    assert((await nm.locator('.chk-src').textContent()).trim() === '행동특성 · 1번 · 1번째 문장', await nm.locator('.chk-src').textContent());
    assert((await nm.locator('.chk-tag').textContent()).trim() === '주어', await nm.locator('.chk-tag').textContent());
    const heads = await page.$$eval(`${B} .chk-gh`, h => h.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
    assert(JSON.stringify(heads) === JSON.stringify(['쓰면 안 되는 말 · 1', '같은 문장 · 2', '이름·주어 · 1', '부정 표현 · 1']), JSON.stringify(heads));
  }],
  ['타일을 누르면 그 종류만, 다시 누르면 전체 · 0인 종류는 「고칠 곳이 없어요」', async () => {
    await page.click(`${B} [data-chk-kind="len"]`);
    assert(await page.getAttribute(`${B} [data-chk-kind="len"]`, 'aria-pressed') === 'true', 'pressed');
    assert((await page.textContent(`${B} .chk-main`)).includes('글자 수에 고칠 곳이 없어요'), await page.textContent(`${B} .chk-main`));
    await page.click(`${B} [data-chk-kind="len"]`);
    assert(await page.getAttribute(`${B} [data-chk-kind=""]`, 'aria-pressed') === 'true', '전체로');
    assert(await page.locator(`${B} .chk-row`).count() === 4, '카드 4개');
  }],
  ['390px: 가로로 넘치지 않음, 타일 두 줄, 누르는 칸 44px', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    try {
      await page.waitForTimeout(200);
      const r = await page.evaluate(b => {
        const W = document.documentElement.clientWidth, bad = [...document.querySelectorAll(b + ' *')].filter(el => el.getBoundingClientRect().right > W + 1).map(el => el.className);
        return { w: document.documentElement.scrollWidth, W, bad };
      }, B);
      assert(r.w <= r.W && !r.bad.length, JSON.stringify(r));
      const xs = await page.$$eval(`${B} .ev-tile`, ts => [...new Set(ts.map(t => Math.round(t.getBoundingClientRect().left)))].length);
      assert(xs === 2, '타일 칸 ' + xs);
      const hs = await page.$$eval(`${B} button, ${B} select`, bs => bs.filter(b => b.offsetParent).map(b => Math.round(Math.min(b.getBoundingClientRect().height, b.getBoundingClientRect().width))));
      assert(hs.length && hs.every(h => h >= 44), '크기 ' + hs.join(','));
    } finally { await page.setViewportSize({ width: 1280, height: 860 }); }
  }],
  ['[그대로 두기]: 그 곳은 세지 않고 다음 카드로 초점, 다시 열어도(새로 고침) 그대로 둔 채', async () => {
    await card('name', '행동특성 · 1번').locator('[data-chk-keep]').click();
    await page.waitForFunction(b => !document.querySelector(b + ' [data-chk-group="name"]'), B);
    assert(JSON.stringify(await tiles()) === JSON.stringify(['전체 4', '쓰면 안 되는 말 1', '같은 문장 2', '이름·주어 0', '글자 수 0', '부정 표현 1']), JSON.stringify(await tiles()));
    assert(await page.evaluate(b => { const a = document.activeElement; return !!(a && a.closest(b + ' [data-chk-card]')); }, B), '초점: 다음 카드');
    assert((await ls('ssam:check:keep')).length === 1, JSON.stringify(await ls('ssam:check:keep')));
    assert((await ls('ssam:hk')).students[0].results[0].t.startsWith('이 학생은'), '글은 그대로');
    await page.reload(); await page.waitForTimeout(500);
    await goCheck();
    assert((await tiles())[3] === '이름·주어 0', JSON.stringify(await tiles()));
    const f = await fin();
    assert(f.includes('1 / 5 살펴봄') && f.includes('그대로 둔 곳 1'), f);
  }],
  ['검토 AI가 이미 낸 고친 문장: AI를 부르지 않고 지운 말·더한 말 → [고친 글로 바꾸기]는 창체 저장소에(검토 의견은 씀)', async () => {
    const r = card('neg', '창의적 체험활동 · 자율·자치활동 · 1번');
    await r.locator('.chk-diff').waitFor();
    assert(strip(await r.locator('.chk-dtext del').allTextContents()).join('|') === '수업 시간에 산만함.', await r.locator('.chk-dtext').textContent());
    assert(strip(await r.locator('.chk-dtext ins').allTextContents()).join('|') === '수업에 집중하는 시간이 점점 늘어남.', await r.locator('.chk-dtext').textContent());
    assert((await r.locator('.chk-dnote').textContent()).includes('검토 AI가 이미 고친 글이에요'), await r.locator('.chk-dnote').textContent());
    assert(await r.locator('[data-chk-apply]').textContent() === '고친 글로 바꾸기', '단추');
    const deco = await r.locator('.chk-dtext del').evaluate(e => getComputedStyle(e).textDecorationLine);
    assert(deco.includes('line-through'), '지운 말 줄 긋기 ' + deco);
    await r.locator('[data-chk-apply]').click();
    await page.waitForFunction(b => !document.querySelector(b + ' [data-chk-group="neg"]'), B);
    const pt = (await ls('ssam:cc')).areas.auto.items[1].parts.a1;
    assert(pt.t === '수업에 집중하는 시간이 점점 늘어남.' && !pt.rv, JSON.stringify(pt));
    assert(calls.length === 0, 'AI를 부르지 않음');
    assert((await fin()).includes('2 / 5 살펴봄'), await fin());
  }],
  ['같은 문장 [학생마다 다르게 쓰기]: 한 명씩(이름·번호 없이) → 학생마다 지운 말·더한 말 → 바꾸면 남은 학생의 고친 글도 남음', async () => {
    const d = page.locator(`${B} [data-chk-group="dup"] .chk-row`);
    assert((await d.locator('.chk-src').textContent()).includes('행동특성 · 2명이 똑같이 씀'), await d.locator('.chk-src').textContent());
    await d.locator('[data-chk-dupfix]').click();
    await page.waitForFunction(b => document.querySelectorAll(b + ' .chk-subs .chk-diff').length === 2, B);
    assert(calls.length === 2, '두 번(한 명씩) ' + calls.length);
    for (const p of calls) assert(p.includes(`다른 학생 글과 같은 문장「${S2}」`) && !/\d+\s*번/.test(p) && !p.includes('행동특성 · '), p.slice(0, 500));
    const subs = await page.$$eval(`${B} .chk-subs .chk-sub .chk-src`, e => e.map(x => x.textContent.trim()));
    assert(JSON.stringify(subs) === JSON.stringify(['행동특성 · 2번', '행동특성 · 3번']), JSON.stringify(subs));
    const sub2 = page.locator(`${B} .chk-subs .chk-sub`, { has: page.locator('.chk-src', { hasText: '행동특성 · 2번' }) });
    assert(strip(await sub2.locator('ins').allTextContents()).join('|') === '친구의 생각을 귀 기울여 듣고 함께 답을 찾음.', await sub2.locator('.chk-dtext').textContent());
    await sub2.locator('[data-chk-apply]').click();
    await page.waitForFunction(b => !document.querySelector(b + ' [data-chk-group="dup"]') && !!document.querySelector(b + ' [data-chk-group="left"]'), B);
    assert((await ls('ssam:hk')).students[1].results[0].t.startsWith('모둠 활동에서 친구의 생각을'), '2번 저장');
    const left = page.locator(`${B} [data-chk-group="left"] .chk-row`);
    assert((await left.locator('.chk-src').textContent()).trim() === '행동특성 · 3번', await left.locator('.chk-src').textContent());
    await left.locator('[data-chk-apply]').click();
    await page.waitForFunction(b => !document.querySelector(b + ' [data-chk-group="left"]'), B);
    assert((await ls('ssam:hk')).students[2].results[0].t.startsWith('모둠에서 맡은 역할을'), '3번 저장');
    const f = await fin();
    assert(f.includes('4 / 5 살펴봄') && f.includes('고친 곳 3') && f.includes('같은 문장이 없어요') && f.includes('쓰면 안 되는 말 1곳'), f);
  }],
  ['나이스에 넣기 전: 그 화면 글만 보면 「n명 모두 글이 있어요」, [나이스 차례로 복사하러 가기]는 전체복사가 있는 화면으로(행동특성은 행동특성 화면의 [나이스 차례로 복사])', async () => {
    await page.selectOption(`${B} #chkSrc`, 'hk');
    assert((await fin()).includes('3명 모두 글이 있어요'), await fin());
    assert((await page.textContent(`${B} .chk-neis-sub`)).includes('창체·평가지 채점 화면의 [전체복사]'), await page.textContent(`${B} .chk-neis-sub`));
    await page.click(`${B} [data-chk-neis]`);
    await page.waitForFunction(() => document.querySelector('#menuTabs [aria-current="page"]').dataset.tab === 'hk');
    await goCheck();
    await page.selectOption(`${B} #chkSrc`, 'cc');
    await page.click(`${B} [data-chk-neis]`);
    await page.waitForFunction(() => document.querySelector('#menuTabs [aria-current="page"]').dataset.tab === 'cc');
    await goCheck();
    await page.selectOption(`${B} #chkSrc`, 'gr');
    await page.click(`${B} [data-chk-neis]`);
    await page.waitForFunction(() => document.querySelector('#menuTabs [aria-current="page"]').dataset.tab === 'gr');
  }],
  ['한 종류에 카드가 많으면 6개만, [n개 더 보기]로 모두', async () => {
    await page.evaluate(() => {
      const hk = JSON.parse(localStorage.getItem('ssam:hk'));
      hk.students = Array.from({ length: 8 }, (_, i) => ({ id: 'x' + i, no: i + 1, label: '', memo: '메모', done: 0, results: [{ t: `수업 뒤 학원${i ? ' 숙제' : ''}를 ${'꾸준히 '.repeat(i)}해 옴.`, d: 0 }] }));
      localStorage.setItem('ssam:hk', JSON.stringify(hk));
      localStorage.setItem('ssam:class', JSON.stringify({ count: 8, except: [] })); // 행특은 학급 명단 안의 학생만
    });
    await page.reload(); await page.waitForTimeout(500);
    await goCheck();
    await page.selectOption(`${B} #chkSrc`, '');
    const G = `${B} [data-chk-group="ban"]`;
    assert(await page.locator(`${G} .chk-row`).count() === 6, '처음 6개');
    assert((await page.textContent(`${G} [data-chk-more]`)).trim() === '쓰면 안 되는 말 2개 더 보기', await page.textContent(`${G} [data-chk-more]`));
    await page.click(`${G} [data-chk-more]`);
    await page.waitForFunction(g => document.querySelectorAll(g + ' .chk-row').length === 8, G);
    assert(await page.locator(`${G} [data-chk-more]`).count() === 0, '더 보기 없어짐');
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join('\n')); }]
]);
await t.close();
