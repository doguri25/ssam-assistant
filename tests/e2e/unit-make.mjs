// 평가 › 단원평가 › [문항 만들기] (스펙 2026-11-15-docedit-minutes-quiz §3): 목록의 [문항 만들기] → 진도표 교과·단원·다음 차시(기본) → [만들기](AI 업무 계획, 학생 자료 없음)
// → 문항 카드(객관식 정답 「3」은 ③으로, 보기 밖 정답은 확인할 것), 배점 합 100(서술형 두 배)·고치기·[배점 고르게 나누기], [이 문항 다시 만들기]·[문항 더하기]·[빼기],
// [문제지 내려받기](맨 위 「학년 반 번호 이름」 칸)·[정답지 내려받기], [평가 만들기] → 1단계 정답표가 채워진 새 단원평가(채점 요청에 그 정답표·문제지 글),
// 진도표 밖 「직접 쓰기」(교직원 이름은 가려 보냄 — 만든 평가의 제목·문제지는 원래 이름, 채점 요청 글에는 다시 가린 이름), 만드는 동안 계획 메뉴에 「AI가 일하는 중」 점이 뜨지 않음, 390·360px 가로 넘침·겹침 없음. 학교·이름은 모두 지어낸 것
import { readFileSync } from 'node:fs';
import { open, run, assert, enter, mockClaude } from './helpers.mjs';
import { unzip } from '../../web/core/zip.js';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-11-16T09:00:00'));
await page.addInitScript(() => {
  if (localStorage.getItem('ssam:__seeded')) return;
  localStorage.setItem('ssam:__seeded', '1');
  localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
  localStorage.setItem('ssam:class:info', JSON.stringify({ grade: 3, room: 2 }));
  const L = (unit, title, no, pages) => ({ week: null, period: '', from: '', unit, title, no, pages, memo: '' });
  localStorage.setItem('ssam:class:subjects', JSON.stringify([{ id: 'sci', name: '과학', start: '', offset: 3, total: null, lessons: [
    L('1. 과학자처럼 탐구해 볼까요', '탐구 문제 정하기', '1/2', '8~9'), L('1. 과학자처럼 탐구해 볼까요', '실험 계획하기', '2/2', '10~11'),
    L('2. 동물의 생활', '동물을 분류하기', '1/3', '30~31'), L('2. 동물의 생활', '땅에 사는 동물', '2/3', '32~33'), L('2. 동물의 생활', '물에 사는 동물', '3/3', '34~35')] }]));
});
const prompts = [];
let gate = null;
const MADE = { title: '동물의 생활', items: [
  { type: 'choice', question: '땅속에 사는 동물은 무엇인가요?', choices: ['① 두더지', '② 붕어', '③ 참새', '④ 나비'], answer: '①', content: '땅속에 사는 동물', domain: '지식', pages: '32쪽' },
  { type: 'choice', question: '다리가 없는 동물은 무엇인가요?', choices: ['개미', '거미', '뱀', '토끼'], answer: '3', content: '동물의 생김새', domain: '이해', pages: '32쪽' },
  { type: 'choice', question: '땅 위에서 사는 동물을 고르세요.', choices: ['고래', '사슴', '오징어', '문어'], answer: '②', content: '땅 위 동물', domain: '지식', pages: '33쪽' },
  { type: 'short', question: '땅속에 굴을 파고 사는 동물을 하나 쓰세요.', answer: '두더지 / 지렁이', content: '땅속 동물', domain: '지식', pages: '32쪽' },
  { type: 'choice', question: '뱀이 움직이는 방법은?', choices: ['날아서', '기어서', '헤엄쳐서', '뛰어서'], answer: '⑤', content: '움직이는 방법', domain: '이해', pages: '33쪽' }
] };
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  // 직접 쓴 범위에서 가린 이름(〔이름1〕)이 오면 1번 물음에 그 자리 표시를 그대로 씀
  if (prompt.startsWith('[문항 만들기]')) { if (gate) await gate; return JSON.stringify(prompt.includes('〔이름1〕') ? { ...MADE, items: [{ ...MADE.items[0], question: '〔이름1〕 선생님이 보여 준 땅속 동물은 무엇인가요?' }, ...MADE.items.slice(1)] } : MADE); }
  if (prompt.startsWith('[문항 다시 만들기]')) return JSON.stringify({ item: { type: 'essay', question: '땅에 사는 동물이 땅에서 살기 알맞은 까닭을 쓰세요.', answer: '다리가 튼튼해서 걷거나 뛸 수 있어요.', criteria: '생김새와 사는 곳을 이어 쓰면 만점', content: '사는 곳과 생김새', domain: '적용' } });
  return '{}';
});
const V = 'section[data-menu="evaluate"] .unit-box', MK = `${V} .un-mkpage`;
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('시간 초과'); await new Promise(r => setTimeout(r, 50)); } };
const cards = () => page.locator(`${MK} .mk-item`).count();
const dec = b => new TextDecoder().decode(b);
const tests = () => page.evaluate(() => (JSON.parse(localStorage.getItem('ssam:unit:list') || '[]')).map(s => JSON.parse(localStorage.getItem('ssam:unit:t:' + s.id))));
const dots = () => page.$$eval('nav.app-side .side-btn.working', bs => bs.map(b => b.dataset.menuGo).join(','));
/* 보이는 누르는 칸끼리 겹침(mobile-layout.mjs와 같은 셈) */
const overlaps = () => page.evaluate(() => {
  const sec = document.querySelector('section[data-menu="evaluate"]');
  const clip = e => {
    let r = e.getBoundingClientRect(), x = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const q = p.getBoundingClientRect(); x = { l: Math.max(x.l, q.left), t: Math.max(x.t, q.top), r: Math.min(x.r, q.right), b: Math.min(x.b, q.bottom) }; }
    }
    return x;
  };
  const name = e => (e.getAttribute('aria-label') || e.textContent || e.id || '').trim().replace(/\s+/g, ' ').slice(0, 30);
  const els = [...sec.querySelectorAll('.un-mkpage button, .un-mkpage input:not([type=checkbox]), .un-mkpage select, .un-mkpage textarea, .un-mkpage .chip')]
    .filter(e => e.checkVisibility()).map(e => [e, clip(e)]).filter(([, x]) => x.r - x.l > 2 && x.b - x.t > 2);
  const hit = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 3 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 3;
  const out = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const [a, ra] = els[i], [b, rb] = els[j]; if (!a.contains(b) && !b.contains(a) && hit(ra, rb)) out.push(`${name(a)} × ${name(b)}`); }
  return out;
});
const wide = () => page.evaluate(() => {
  const vw = document.documentElement.clientWidth, out = [];
  for (const e of document.querySelectorAll('section[data-menu="evaluate"] .un-mkpage *')) {
    if (!e.checkVisibility()) continue;
    const r = e.getBoundingClientRect();
    if (r.width && r.right > vw + 1) {
      let p = e.parentElement, scroll = false;
      for (; p; p = p.parentElement) if (getComputedStyle(p).overflowX !== 'visible' && p.getBoundingClientRect().right <= vw + 1) { scroll = true; break; }
      if (!scroll) out.push((e.className || e.tagName) + ':' + Math.round(r.right));
    }
  }
  return { out: out.slice(0, 5), page: document.scrollingElement.scrollWidth - vw };
});
await page.goto(url);
await page.waitForTimeout(400);

await run('unit-make', [
  ['평가 › 단원평가 목록에 [문항 만들기] → 고르기: 진도표 교과, 다음 차시(진도표 4번째 차시)가 기본, 학년은 학급 정보', async () => {
    await enter(page, 'evaluate', 'unit');
    await page.waitForSelector(`${V} [data-un="make"]`);
    assert((await page.textContent(`${V} [data-un="make"]`)).trim() === '문항 만들기', '단추 이름');
    await page.click(`${V} [data-un="make"]`);
    await page.waitForSelector(`${MK} #mkSub`);
    assert(await page.inputValue(`${MK} #mkSub`) === 'sci', '교과');
    assert((await page.textContent(`${MK} #mkUnit option:checked`)).includes('2. 동물의 생활'), '단원');
    const checked = await page.$$eval(`${MK} [data-mp="lesson"]:checked`, a => a.map(x => x.value));
    assert(JSON.stringify(checked) === '["3"]', JSON.stringify(checked));
    assert((await page.textContent(`${MK} .mk-lessons`)).includes('다음 차시'), '다음 차시 표시');
    assert(await page.inputValue(`${MK} #mkGrade`) === '3' && await page.inputValue(`${MK} #mkCount`) === '5', '학년·문항 수');
    assert(await page.isVisible(`${MK} [data-ai-row="plan"]`) && (await page.textContent(`${MK} .ai-note`)).includes('AI로 가는 것'), 'AI 줄·AI로 가는 것');
  }],
  ['[만들기] → 요청(범위·학년·문항 수·유형, 학생 자료 없음), 만드는 동안 계획 메뉴에 점 없음 → 문항 카드 5개, 「3」은 ③, 배점 합 100, 보기 밖 정답은 확인할 것', async () => {
    let open; gate = new Promise(r => { open = r; });
    await page.click(`${MK} [data-mk="make"]`);
    await page.waitForSelector(`${MK} #mkBusy`);
    assert(!(await dots()).includes('plan'), '계획 메뉴 점: ' + await dots());
    open(); gate = null;
    await until(async () => await cards() === 5);
    const p = prompts.find(x => x.startsWith('[문항 만들기]'));
    assert(p.includes('과학 · 3학년') && p.includes('땅에 사는 동물') && p.includes('32~33쪽') && p.includes('모두 5문항'), p.slice(0, 400));
    assert(p.includes('객관식 3문항') && p.includes('단답 1문항') && p.includes('서술형 1문항'), '유형 나누기');
    assert(!/김하늘|이바다|한가람|\d+번 학생/.test(p), '학생 자료');
    assert(await page.inputValue(`${MK} [data-mk-item="2"] [data-mf="answer"]`) === '③', '정답 번호로');
    assert(await page.inputValue(`${MK} [data-mk-item="1"] [data-mf="choice"][data-ci="0"]`) === '두더지', '보기 번호 표시 뺌');
    assert((await page.textContent(`${MK} #mkSum`)).includes('배점 합 100점'), await page.textContent(`${MK} #mkSum`));
    assert((await page.textContent(`${MK} [data-mk-warn="5"]`)).includes('정답'), '5번 확인할 것');
    assert(await page.isVisible(`${MK} #mkProbs`), '고칠 것 줄');
  }],
  ['고치기: 정답 고르기·물음 쓰기 → 확인할 것 사라짐, 배점을 고치면 합이 바뀌고 [배점 고르게 나누기]로 100점', async () => {
    await page.selectOption(`${MK} [data-mk-item="5"] [data-mf="answer"]`, '②');
    await page.fill(`${MK} [data-mk-item="1"] [data-mf="question"]`, '땅속에 굴을 파고 사는 동물은 무엇인가요?');
    assert((await page.textContent(`${MK} [data-mk-warn="5"]`)).trim() === '', '5번 확인할 것 남음');
    assert(await page.isHidden(`${MK} #mkProbs`), '고칠 것 줄 남음');
    await page.fill(`${MK} [data-mk-item="2"] [data-mf="points"]`, '30');
    assert((await page.textContent(`${MK} #mkSum`)).includes('110점'), await page.textContent(`${MK} #mkSum`));
    await page.click(`${MK} [data-mk="split"]`);
    assert((await page.textContent(`${MK} #mkSum`)).includes('배점 합 100점') && await page.inputValue(`${MK} [data-mk-item="2"] [data-mf="points"]`) === '20', '고르게');
    assert(await page.inputValue(`${MK} [data-mk-item="1"] [data-mf="question"]`) === '땅속에 굴을 파고 사는 동물은 무엇인가요?', '다시 그려도 고친 물음 그대로');
  }],
  ['[이 문항 다시 만들기](3번) → 요청에 3번·다른 문항 → 서술형으로 바뀌고 배점은 서술형 두 배로 다시 나눔', async () => {
    await page.click(`${MK} [data-mk="redo"][data-no="3"]`);
    await until(async () => (await page.inputValue(`${MK} [data-mk-item="3"] [data-mf="question"]`)).includes('알맞은 까닭'));
    const p = prompts.find(x => x.startsWith('[문항 다시 만들기]'));
    assert(p.includes('3번') && p.includes('땅속에 굴을 파고 사는 동물은 무엇인가요?') && p.includes('"item"'), p.slice(0, 300));
    assert(await page.inputValue(`${MK} [data-mk-item="3"] [data-mf="type"]`) === 'essay', '서술형');
    assert(await page.inputValue(`${MK} [data-mk-item="3"] [data-mf="criteria"]`) === '생김새와 사는 곳을 이어 쓰면 만점', '채점 기준');
    const pts = await page.$$eval(`${MK} [data-mf="points"]`, a => a.map(x => +x.value));
    assert(JSON.stringify(pts) === '[16,17,33,17,17]', JSON.stringify(pts));
  }],
  ['[문항 더하기] → 빈 6번(물음에 초점) → [빼기] → 5문항', async () => {
    await page.click(`${MK} [data-mk="add"]`);
    await until(async () => await cards() === 6);
    assert(await page.evaluate(() => document.activeElement && document.activeElement.dataset.mf === 'question' && document.activeElement.dataset.no === '6'), '초점');
    assert((await page.textContent(`${MK} [data-mk-warn="6"]`)).includes('물음'), '빈 문항 확인할 것');
    await page.click(`${MK} [data-mk="del"][data-no="6"]`);
    await until(async () => await cards() === 5);
  }],
  ['[문제지 내려받기]: 한글 — 맨 위 「학년 반 번호 이름」 칸·제목·물음·①~⑤, 정답은 없음 / [정답지 내려받기]: 정답 표', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${MK} [data-mk="paper"]`)]);
    assert(dl.suggestedFilename() === '3학년 과학 2단원 동물의 생활 단원평가 문제지.hwpx', dl.suggestedFilename());
    const s = dec((await unzip(new Uint8Array(readFileSync(await dl.path())))).get('Contents/section0.xml'));
    const at = w => s.indexOf(`<hp:t>${w}</hp:t>`);
    assert(at('학년') > 0 && at('번호') > at('학년') && at('이름') > at('번호'), '이름 칸');
    assert(at('3학년 과학 2단원 동물의 생활 단원평가') > at('이름'), '이름 칸이 제목보다 위');
    assert(s.includes('1. 땅속에 굴을 파고 사는 동물은 무엇인가요? (16점)') && s.includes('② 붕어') && s.includes('(서술형, 33점)'), '물음·보기');
    assert(!s.includes('두더지 / 지렁이') && !s.includes('이어 쓰면 만점'), '정답·기준이 문제지에');
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.click(`${MK} [data-mk="answers"]`)]);
    assert(dl2.suggestedFilename() === '3학년 과학 2단원 동물의 생활 단원평가 정답지.hwpx', dl2.suggestedFilename());
    const s2 = dec((await unzip(new Uint8Array(readFileSync(await dl2.path())))).get('Contents/section0.xml'));
    assert(s2.includes('두더지 / 지렁이') && s2.includes('(예) 다리가 튼튼해서') && s2.includes('채점 기준'), '정답지');
  }],
  ['[평가 만들기] → 새 단원평가 1단계: 제목·정답표 5문항(③·배점)·문제지 글이 채워짐, 채점 요청에 그 정답표, 5번을 빼고 다시 더해도 뺀 물음은 문제지에 없음', async () => {
    await page.click(`${MK} [data-mk="create"]`);
    await page.waitForSelector(`${V} .un-key`);
    assert((await page.textContent(`${V} .un-title`)).trim() === '3학년 과학 2단원 동물의 생활', await page.textContent(`${V} .un-title`));
    assert((await page.textContent(`${V} .steps li.cur`)).includes('학생 문제지·답안'), '1단계');
    assert(await page.locator(`${V} .un-key tbody tr`).count() === 5, '문항 수');
    assert(await page.inputValue(`${V} [data-k="2-answer"]`) === '③' && await page.inputValue(`${V} [data-k="3-type"]`) === 'essay' && await page.inputValue(`${V} [data-k="3-points"]`) === '33', '정답표');
    assert((await page.textContent(`${V} .un-sum`)).includes('5문항 · 100점'), await page.textContent(`${V} .un-sum`));
    assert(await page.isVisible(`${V} [data-mk="madePaper"]`), '1단계에서 문제지 다시 내려받기');
    const [x] = await tests();
    assert(x && x.meta.subject === '과학' && x.meta.grade === 3 && x.meta.unitNo === 2 && x.meta.unitName === '동물의 생활' && x.meta.lesson === '2/3', JSON.stringify(x && x.meta));
    assert(x.paper.text.includes('1. 땅속에 굴을 파고 사는 동물은 무엇인가요?') && x.key.items[3].answer === '두더지 / 지렁이', '저장');
    const g = await page.evaluate(async id => { const m = await import('./menus/evaluate/unit/unit-ai.js'), u = await import('./menus/evaluate/unit/unit-model.js'); return m.gradePrompt(u.getTest(id), 1); }, x.id);
    assert(g.includes('2 | 고르기 | ③ | 17') && g.includes('[평가지 글]') && g.includes('② 붕어'), g.slice(0, 500));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${V} [data-mk="madePaper"]`)]);
    assert(dl.suggestedFilename().endsWith('문제지.hwpx'), dl.suggestedFilename());
    assert(dec((await unzip(new Uint8Array(readFileSync(await dl.path())))).get('Contents/section0.xml')).includes('뱀이 움직이는 방법은?'), '5번 물음');
    // 마지막 5번을 빼고 [문항 더하기](같은 5번) → 다시 내려받는 문제지에 뺀 물음이 되살아나지 않음
    await page.click(`${V} [data-un="delItem"][data-no="5"]`);
    await page.click(`${V} [data-un="addItem"]`);
    await until(async () => await page.locator(`${V} .un-key tbody tr`).count() === 5);
    const [dl3] = await Promise.all([page.waitForEvent('download'), page.click(`${V} [data-mk="madePaper"]`)]);
    const s3 = dec((await unzip(new Uint8Array(readFileSync(await dl3.path())))).get('Contents/section0.xml'));
    assert(!s3.includes('뱀이 움직이는 방법은?') && s3.includes('땅속에 굴을 파고 사는 동물은 무엇인가요?'), '뺀 문항의 물음이 문제지에');
    await page.click(`${V} [data-un="back"]`);
    await page.waitForSelector(`${V} .un-card`);
    assert((await page.textContent(`${V} .un-list`)).includes('3학년 과학 2단원 동물의 생활'), '목록');
  }],
  ['진도표 밖 「직접 쓰기」: 범위가 비면 알림 → 쓴 범위로 요청(교직원 이름은 가림)', async () => {
    await page.click(`${V} [data-un="make"]`);
    await page.waitForSelector(`${MK} #mkSub`);
    assert(await cards() === 0, '만든 뒤엔 새로 시작');
    await page.selectOption(`${MK} #mkSub`, '__free');
    await page.waitForSelector(`${MK} #mkFree`);
    await page.click(`${MK} [data-mk="make"]`);
    await page.waitForSelector(`${MK} #mkMsg`);
    assert((await page.textContent(`${MK} #mkMsg`)).includes('범위를 써 주세요'), await page.textContent(`${MK} #mkMsg`));
    await page.fill(`${MK} #mkSubject`, '사회');
    await page.fill(`${MK} #mkFree`, '1. 우리 고장의 모습(한가람 선생님 자료)\n고장의 자랑거리 알기\n이바다 선생님 반과 같은 범위');
    const n = prompts.length;
    await page.click(`${MK} [data-mk="make"]`);
    await until(async () => await cards() === 5);
    const p = prompts.slice(n).find(x => x.startsWith('[문항 만들기]'));
    assert(p.includes('[교과] 사회') && p.includes('- 1. 우리 고장의 모습') && p.includes('- 고장의 자랑거리 알기'), p.slice(0, 300));
    assert(!/한가람|이바다/.test(p) && p.includes('〔이름1〕 선생님 자료') && p.includes('〔이름2〕 선생님'), '직접 쓴 범위의 교직원 이름은 가려 보냄');
    assert(await page.inputValue(`${MK} [data-mk-item="1"] [data-mf="question"]`) === '한가람 선생님이 보여 준 땅속 동물은 무엇인가요?', '돌아온 물음은 원래 이름');
  }],
  ['휴대폰 390·360px: 고르기(차시 목록)·문항 카드·내려받기 줄이 가로로 넘치거나 겹치지 않음', async () => {
    await page.selectOption(`${MK} #mkSub`, 'sci');
    await page.waitForSelector(`${MK} .mk-lessons`);
    for (const w of [390, 360]) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.waitForTimeout(250);
      const r = await wide();
      assert(!r.out.length && r.page <= 1, `${w}px 넘침: ${JSON.stringify(r)}`);
      const o = await overlaps();
      assert(!o.length, `${w}px 겹침: ${o.slice(0, 4).join(' / ')}`);
      if (process.env.SHOT) for (const [k, sel] of [['pick', '#mkPickCard'], ['item', '[data-mk-item="1"]'], ['essay', '[data-mk-item="3"]'], ['out', '.mk-done']]) {
        await page.locator(`${MK} ${sel}`).scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${process.env.SHOT}/unit-make-${w}-${k}.png` });
      }
    }
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['직접 쓴 범위로 [평가 만들기] → 제목·평가 정보·문제지 글은 원래 이름, 채점 요청 글에는 다시 가린 이름(〔이름1〕)만', async () => {
    await page.selectOption(`${MK} [data-mk-item="5"] [data-mf="answer"]`, '②');
    await page.click(`${MK} [data-mk="create"]`);
    await page.waitForSelector(`${V} .un-key`);
    const title = (await page.textContent(`${V} .un-title`)).trim();
    assert(title === '3학년 사회 1단원 우리 고장의 모습(한가람 선생님 자료)', title);
    const x = (await tests()).find(t => t && t.meta.subject === '사회');
    assert(x && x.meta.unitName === '우리 고장의 모습(한가람 선생님 자료)' && x.paper.text.includes('1. 한가람 선생님이 보여 준 땅속 동물은'), JSON.stringify(x && x.meta));
    const g = await page.evaluate(async id => { const m = await import('./menus/evaluate/unit/unit-ai.js'), u = await import('./menus/evaluate/unit/unit-model.js'); return m.gradePrompt(u.getTest(id), 1); }, x.id);
    assert(!/한가람|이바다/.test(g) && g.includes('[평가] 3학년 사회 1단원 우리 고장의 모습(〔이름1〕 선생님 자료)') && g.includes('1. 〔이름1〕 선생님이 보여 준 땅속 동물은'), g.slice(0, 600));
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join(' | ')); }]
]);
await t.close();
