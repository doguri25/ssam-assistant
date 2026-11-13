// 화면 정리(스펙 2026-11-14-ui-tidy) — 평가 옛 화면: 교과 평어·창의적 체험활동·행동특성·평가지 채점
// 행특 설정 접기(요약 한 줄·바꾸면 요약이 바뀌고 다시 열어도 그대로), 특성 단추 묶음 접기(고른 수), 채점·창체 설정 접기,
// 화면 설명은 세 번 연 뒤 접힘(ssam:ui:intro), 「AI로 가는 것」 펼침, 390px에서 넘치지 않음. 글은 모두 지어낸 것
import { open, run, assert, enter } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('시간 초과'); await new Promise(r => setTimeout(r, 80)); } };
// 자료를 비우고(필요하면 넣고) 다시 엶
const fresh = async (seed = {}) => {
  await page.evaluate(seed => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('ssam:') && k !== 'ssam:engine') localStorage.removeItem(k);
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, seed);
  await page.goto(url, { timeout: 30000 }); await page.waitForTimeout(500);
};
const fold = (root, key) => page.evaluate(({ root, key }) => {
  const d = document.querySelector(`${root} [data-fold="${key}"]`);
  return d ? { open: d.open, sum: d.querySelector('.fold-text').textContent.trim(), act: d.querySelector('.fold-act').textContent.trim() } : null;
}, { root, key });
const openFold = async (root, key) => { if (!(await fold(root, key)).open) await page.click(`${root} [data-fold="${key}"] > summary`); };
const groups = () => page.$$eval('#hkEditor details[data-kwg]', els => els.map(d => ({ g: d.dataset.kwg, open: d.open, head: d.querySelector('summary').textContent.trim() })));
const HK1 = { settings: { unit: 'char', min: 300, max: 500, variants: 2, ending: 'eum', grade: 3 }, students: [1, 2].map(no => ({ id: 'h' + no, no, label: '', memo: '', results: [], done: 0 })) };
const intro = root => page.evaluate(r => { const d = document.querySelector(`${r} details.intro`); return d ? { open: d.open, sum: d.querySelector('summary').textContent.trim(), text: d.querySelector('.intro-text').textContent.trim() } : null; }, root);

await page.goto(url); await page.waitForTimeout(400);

await run('ui-tidy-eval', [
  ['행특: 맨 위 설정이 접힌 요약 한 줄 「300~500자 · 후보 2개 · ~함. · 3학년 12명」 + [바꾸기]', async () => {
    await fresh({ 'ssam:class': { count: 12, except: [] }, 'ssam:hk': HK1 });
    await enter(page, 'evaluate', 'hk');
    await page.waitForSelector('#hkSet [data-fold="hk-set"]');
    await until(async () => (await fold('#hkSet', 'hk-set')).sum.includes('12명'));
    const f = await fold('#hkSet', 'hk-set');
    assert(!f.open && f.sum === '300~500자 · 후보 2개 · ~함. · 3학년 12명' && f.act === '바꾸기', JSON.stringify(f));
    assert(!(await page.isVisible('#hkMin')) && !(await page.isVisible('#hkGrade')), '접혀 있는데 설정 칸이 보임');
    // 예외 번호는 요약에도
    await openFold('#hkSet', 'hk-set');
    await page.fill('#hkSet [data-cls="except"]', '7'); await page.press('#hkSet [data-cls="except"]', 'Tab');
    await until(async () => (await fold('#hkSet', 'hk-set')).sum.endsWith('3학년 11명(7번 제외)'));
  }],
  ['행특: 펼쳐 분량을 바꾸면 요약이 바로 바뀌고, 다시 열어도 값이 그대로(접힌 채로 열림)', async () => {
    await page.fill('#hkMin', '400'); await page.dispatchEvent('#hkMin', 'change');
    await until(async () => (await fold('#hkSet', 'hk-set')).sum.startsWith('400~500자'));
    assert((await fold('#hkSet', 'hk-set')).open, '바꾼 뒤 다시 그려도 펼친 채로');
    await page.click('#hkSet [data-hkset="variants"] [data-v="3"]');
    await page.selectOption('#hkGrade', '5');
    await until(async () => (await fold('#hkSet', 'hk-set')).sum === '400~500자 · 후보 3개 · ~함. · 5학년 11명(7번 제외)');
    await page.waitForTimeout(700); // 저장(0.5초 뒤)
    await page.reload(); await page.waitForTimeout(500);
    await enter(page, 'evaluate', 'hk');
    await until(async () => { const f = await fold('#hkSet', 'hk-set'); return f && f.sum === '400~500자 · 후보 3개 · ~함. · 5학년 11명(7번 제외)'; });
    assert(!(await fold('#hkSet', 'hk-set')).open, '학생 수가 있으면 접힌 채로 열려야 함');
    await openFold('#hkSet', 'hk-set');
    assert(await page.inputValue('#hkMin') === '400' && await page.inputValue('#hkGrade') === '5', '값이 그대로가 아님');
  }],
  ['행특: 학생 수가 비어 있으면 처음부터 펼쳐 보이고, 학생 수를 넣어도 바로 접히지 않음', async () => {
    await fresh({});
    await enter(page, 'evaluate', 'hk');
    await page.waitForSelector('#hkSet [data-fold="hk-set"]');
    await until(async () => (await fold('#hkSet', 'hk-set')).open);
    assert((await fold('#hkSet', 'hk-set')).sum.includes('학생 수를 넣어 주세요'), JSON.stringify(await fold('#hkSet', 'hk-set')));
    await page.fill('#hkSet [data-cls="count"]', '4'); await page.press('#hkSet [data-cls="count"]', 'Tab');
    await until(async () => (await fold('#hkSet', 'hk-set')).sum.endsWith('3학년 4명'));
    assert((await fold('#hkSet', 'hk-set')).open && await page.isVisible('#hkGrade'), '학생 수를 넣자마자 접힘');
  }],
  ['행특 특성 단추: 묶음마다 접기(처음엔 생활만 펼침), 묶음 머리에 고른 수 「생활 · 1개 골랐어요」(글로)', async () => {
    await fresh({ 'ssam:class': { count: 2, except: [] }, 'ssam:hk': HK1 });
    await enter(page, 'evaluate', 'hk');
    await page.waitForSelector('[data-hkstu]');
    await page.click('[data-hkstu="h1"]');
    await page.waitForSelector('#hkEditor details[data-kwg]');
    let g = await groups();
    assert(JSON.stringify(g.map(x => x.g)) === JSON.stringify(['생활', '학습', '관계', '특기', '성장 중']), JSON.stringify(g));
    assert(g[0].open && g.slice(1).every(x => !x.open), '처음엔 첫 묶음만 펼침: ' + JSON.stringify(g));
    assert(g.every(x => x.head === x.g), '고르기 전 머리: ' + JSON.stringify(g));
    assert(!(await page.isVisible('#hkEditor [data-kw="경청함"]')) && await page.isVisible('#hkEditor [data-kw="성실함"]'), '접힌 묶음 단추가 보임');
    await page.click('#hkEditor [data-kw="성실함"]');
    await until(async () => (await groups())[0].head === '생활 · 1개 골랐어요');
    assert((await page.inputValue('#hkMemo')) === '성실함', await page.inputValue('#hkMemo'));
    assert(await page.$('#hkEditor [data-kw="성실함"].on'), '고른 단추 표시');
    // 관계 묶음을 펼쳐 둘 고름
    await page.click('#hkEditor details[data-kwg="관계"] > summary');
    await page.click('#hkEditor [data-kw="경청함"]'); await page.click('#hkEditor [data-kw="공감 능력"]');
    await until(async () => (await groups())[2].head === '관계 · 2개 골랐어요');
    assert((await page.inputValue('#hkMemo')) === '성실함, 경청함, 공감 능력', await page.inputValue('#hkMemo'));
    // 손으로 메모를 고쳐도 고른 수가 바로 맞음
    await page.fill('#hkMemo', '성실함, 공감 능력');
    await until(async () => (await groups())[2].head === '관계 · 1개 골랐어요');
  }],
  ['행특 특성 단추: 펼치고 접은 묶음은 다른 학생·다른 탭을 다녀와도 그대로(이번 실행 동안)', async () => {
    await page.click('#hkEditor details[data-kwg="생활"] > summary'); // 생활 접기
    await page.waitForTimeout(100);
    await page.click('[data-hkstu="h2"]');
    await page.waitForSelector('#hkEditor details[data-kwg]');
    let g = await groups();
    assert(!g[0].open && g[2].open, '다른 학생에서 묶음 펼침이 바뀜: ' + JSON.stringify(g));
    assert(g.every(x => x.head === x.g), '2번은 고른 것이 없음: ' + JSON.stringify(g));
    await enter(page, 'evaluate', 'gr'); await enter(page, 'evaluate', 'hk');
    await page.click('[data-hkstu="h1"]');
    g = await groups();
    assert(!g[0].open && g[2].open && g[0].head === '생활 · 1개 골랐어요', JSON.stringify(g));
  }],
  ['평가지 채점: 쪽 나누기·수준 비율이 접힌 요약, 펼치면 칸, 비율 합이 100%가 아니면 요약이 글로 알려 줌', async () => {
    await fresh({ 'ssam:class': { count: 3, except: [2] } });
    await enter(page, 'evaluate', 'gr');
    await page.waitForSelector('#grSetup [data-fold="gr-pages"]');
    await until(async () => (await fold('#grSetup', 'gr-pages')).sum.includes('2번 제외'));
    let f = await fold('#grSetup', 'gr-pages');
    assert(!f.open && f.sum === '학생당 1쪽 · 1번부터 · 2번 제외', JSON.stringify(f));
    assert(!(await page.isVisible('#grPer')), '접혀 있는데 칸이 보임');
    assert(await page.isVisible('#grDrop') && await page.isVisible('#grMaskOn') && await page.isVisible('#grCrit'), '꼭 정할 칸(평가지·정답·이름 가리기)은 늘 보여야 함');
    await openFold('#grSetup', 'gr-pages');
    await page.fill('#grPer', '2'); await page.dispatchEvent('#grPer', 'change');
    await until(async () => (await fold('#grSetup', 'gr-pages')).sum.startsWith('학생당 2쪽'));
    assert((await fold('#grSetup', 'gr-pages')).open, '바꾼 뒤 접힘');
    f = await fold('#grSetup', 'gr-level');
    assert(!f.open && f.sum === '최상 10 · 상 30 · 중 40 · 하 20% · 평어 섞어서', JSON.stringify(f));
    await openFold('#grSetup', 'gr-level');
    await page.fill('#grR_top', '20'); await page.dispatchEvent('#grR_top', 'change');
    await until(async () => (await fold('#grSetup', 'gr-level')).sum === '수준 비율 합이 110%예요 · 100%로 맞춰 주세요');
    await page.fill('#grR_top', '10'); await page.dispatchEvent('#grR_top', 'change');
    await page.click('#grSetup [data-grmix="sheet"]');
    await until(async () => (await fold('#grSetup', 'gr-level')).sum === '최상 10 · 상 30 · 중 40 · 하 20% · 평어 평가지 위주');
    // 적힌 번호로 맞추기를 켜고 번호 칸을 정하지 않았으면 다음에 열 때 펼쳐 보임
    await openFold('#grSetup', 'gr-pages');
    await page.check('#grByNo');
    await until(async () => (await fold('#grSetup', 'gr-pages')).sum.includes('적힌 번호로 맞춤'));
    await page.reload(); await page.waitForTimeout(500);
    await enter(page, 'evaluate', 'gr');
    await page.waitForSelector('#grSetup [data-fold="gr-pages"]');
    assert((await fold('#grSetup', 'gr-pages')).open && await page.isVisible('[data-gr="noBox"]'), '번호 칸을 정해야 하는데 접혀 있음');
    await page.uncheck('#grByNo');
  }],
  ['창체: 학급 명단·학년·문장 길이가 접힌 요약 「3학년 3명 · 보통 45~70자 · ~함.」, 활동 칸은 늘 보임', async () => {
    await fresh({ 'ssam:class': { count: 3, except: [] } });
    await enter(page, 'evaluate', 'cc');
    await page.waitForSelector('#ccSetup [data-fold="cc-set"]');
    await until(async () => (await fold('#ccSetup', 'cc-set')).sum.includes('3명'));
    let f = await fold('#ccSetup', 'cc-set');
    assert(!f.open && f.sum === '3학년 3명 · 보통 45~70자 · ~함.', JSON.stringify(f));
    assert(await page.isVisible('[data-ccf="name"][data-cck="auto"]') && !(await page.isVisible('#ccGrade')), '활동 칸이 안 보이거나 학년 칸이 보임');
    await openFold('#ccSetup', 'cc-set');
    await page.click('#ccSetup [data-cclen="long"]');
    await page.selectOption('#ccGrade', '4');
    await until(async () => (await fold('#ccSetup', 'cc-set')).sum === '4학년 3명 · 길게 70~100자 · ~함.');
    // 학생 수가 비어 있으면 펼쳐 보임
    await fresh({});
    await enter(page, 'evaluate', 'cc');
    await page.waitForSelector('#ccSetup [data-fold="cc-set"]');
    await until(async () => (await fold('#ccSetup', 'cc-set')).open);
    assert(await page.isVisible('#ccSetup [data-cls="count"]'), '학생 수 칸이 안 보임');
  }],
  ['화면 설명: 처음 세 번은 펼쳐 보이고(화면마다 켤 때 한 번 셈) 그 뒤엔 접힌 「화면 설명」 — 보이지 않은 화면은 세지 않음', async () => {
    await fresh({ 'ssam:class': { count: 2, except: [] }, 'ssam:mode': 'hk' });
    // 켜기만 하고(「오늘」) 행특을 보지 않으면 세지 않음
    let c = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:ui:intro') || '{}'));
    assert(!c.hk, '보지 않은 화면을 셈: ' + JSON.stringify(c));
    for (let i = 1; i <= 3; i++) {
      if (i > 1) { await page.reload(); await page.waitForTimeout(400); }
      await enter(page, 'evaluate', 'hk');
      await page.waitForSelector('#hkSet details.intro');
      const d = await intro('#hkSet');
      assert(d.open && d.text === '메모나 특성 단추로 학생마다 행동특성 글을 만들어요.', i + '번째: ' + JSON.stringify(d));
      // 같은 실행에서 다른 탭을 다녀와도 한 번만 셈
      await enter(page, 'evaluate', 'cc'); await enter(page, 'evaluate', 'hk');
      c = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:ui:intro') || '{}'));
      assert(c.hk === i && c.cc === i, JSON.stringify(c));
    }
    await page.reload(); await page.waitForTimeout(400);
    await enter(page, 'evaluate', 'hk');
    await page.waitForSelector('#hkSet details.intro');
    const d = await intro('#hkSet');
    assert(!d.open && d.sum === '화면 설명', JSON.stringify(d));
    await page.click('#hkSet details.intro > summary');
    assert(await page.isVisible('#hkSet .intro-text'), '눌러도 안 펼쳐짐');
    // 다른 화면도 같은 부품
    for (const [tab, root] of [['gr', '#grSetup'], ['cc', '#ccSetup'], ['pyeongeo', '#importView']]) {
      await enter(page, 'evaluate', tab);
      await page.waitForSelector(`${root} details.intro`);
      const x = await intro(root);
      assert(x.text.length > 10 && x.text.length <= 48 && x.text.endsWith('요.'), tab + ': ' + JSON.stringify(x));
    }
  }],
  ['「AI로 가는 것」: 접혀 있고 누르면 무엇을 보내는지 + [AI로 보낸 글 보기](설정 › AI로)', async () => {
    await fresh({ 'ssam:class': { count: 2, except: [] }, 'ssam:hk': HK1 });
    await enter(page, 'evaluate', 'gr');
    await page.waitForSelector('#grSetup details.ai-note');
    assert(!(await page.$eval('#grSetup details.ai-note', d => d.open)), '처음부터 펼침');
    await page.click('#grSetup details.ai-note > summary');
    const txt = await page.textContent('#grSetup .ai-note-body');
    assert(txt.includes('이름 칸은 가려서') && txt.includes('AI로 보낸 글 보기'), txt);
    for (const [tab, root, word] of [['cc', '#ccSetup', '학습지 그림'], ['hk', '#hkEditor', '번호·별칭은 보내지 않아요']]) {
      await enter(page, 'evaluate', tab);
      if (tab === 'hk') { await page.waitForSelector('[data-hkstu]'); await page.click('[data-hkstu="h1"]'); }
      await page.waitForSelector(`${root} details.ai-note`);
      await page.click(`${root} details.ai-note > summary`);
      const t2 = await page.textContent(`${root} .ai-note-body`);
      assert(t2.includes(word), tab + ': ' + t2);
    }
    await page.click('#hkEditor [data-go-ailog]');
    await until(() => page.evaluate(() => !document.querySelector('section[data-menu="settings"]').hidden));
  }],
  ['교과 평어: 넣기 화면 설명, 평가요소 화면의 「AI로 가는 것」(학생 정보는 보내지 않음)', async () => {
    await fresh({});
    await enter(page, 'evaluate', 'pyeongeo');
    await page.waitForSelector('#importView .hero details.intro');
    assert((await intro('#importView')).text.includes('50개씩'), JSON.stringify(await intro('#importView')));
    assert(!(await page.$('#importView .hero > p')), '예전 설명 글이 그대로');
    // 「학생 이름이나 개인정보는 들어가지 않아요」는 「AI로 가는 것」으로, 저장 안내 글은 그대로
    await page.click('#importView details.ai-note > summary');
    assert((await page.textContent('#importView .ai-note-body')).includes('학생 정보는 보내지 않아요'), await page.textContent('#importView .ai-note-body'));
    await until(async () => (await page.textContent('#storeNote')).includes('저장돼요'));
    assert(!(await page.textContent('#storeNote')).includes('개인정보'), await page.textContent('#storeNote'));
    assert(await page.locator('#importView details.ai-note').count() === 1, '「AI로 가는 것」이 겹침');
    await page.click('#srcPaste');
    await page.fill('#pasteBox', await page.getAttribute('#pasteBox', 'placeholder'));
    await page.click('#pasteGo');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#units .unit');
    await page.click('#units .unit');
    await page.waitForSelector('#pane details.ai-note');
    await page.click('#pane details.ai-note > summary');
    assert((await page.textContent('#pane .ai-note-body')).includes('학생 정보는 보내지 않아요'), await page.textContent('#pane .ai-note-body'));
    assert(await page.isVisible('#pane [data-act="copyAll"]') && await page.isVisible('#pane [data-eval-check="py"]'), '버튼이 사라짐');
  }],
  ['390px: 네 화면 모두 가로로 넘치지 않음(설정을 펼쳐도)', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await fresh({ 'ssam:class': { count: 12, except: [7] }, 'ssam:hk': HK1 });
    const over = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    for (const [tab, root, key] of [['hk', '#hkSet', 'hk-set'], ['gr', '#grSetup', 'gr-pages'], ['cc', '#ccSetup', 'cc-set'], ['pyeongeo', null, null]]) {
      await enter(page, 'evaluate', tab);
      await page.waitForTimeout(300);
      assert(await over() <= 0, tab + ' 접힘: ' + await over());
      if (key) { await openFold(root, key); await page.waitForTimeout(100); assert(await over() <= 0, tab + ' 펼침: ' + await over()); }
    }
    await enter(page, 'evaluate', 'hk');
    await page.click('[data-hkstu="h1"]');
    await page.waitForSelector('#hkEditor details[data-kwg]');
    await page.$$eval('#hkEditor details[data-kwg]', els => els.forEach(d => { d.open = true; }));
    await page.waitForTimeout(100);
    assert(await over() <= 0, '특성 단추 펼침: ' + await over());
    const small = await page.$$eval('#hkEditor .kwc, #hkEditor .kwg-sum, #hkSet .fold-sum', els => els.filter(e => e.getBoundingClientRect().height < 44).length);
    assert(small === 0, '44px보다 작은 누르는 칸 ' + small);
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join('\n')); }]
]);
await t.close();
