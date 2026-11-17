// 2026-11-17 품의 버그(선생님 알림 「품의 입력할 때 왼쪽 상단에 입력기가 뜨고 글자가 한박자 늦게 들어가」):
// 한글을 조합하는 동안(입력기가 글자를 만드는 중) 글자마다 저장·합계·산출 내역·확인 목록·사유 맞추기로 화면을 고치고,
// 관련 칸은 치는 칸의 안내 글(placeholder)까지 글자마다 바꿨음 → 조합 중에는 칸 값만 받아 두고 화면은 건드리지 않음,
// 조합을 마치면(또는 치다 멈추면) 저장·합계·초안 사유가 따라옴
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const INTRO = '독서 교육을 위하여 도서를 구입하고자 합니다.';
await mockClaude(page, async ({ prompt }) => {
  if (prompt.startsWith('[품의 초안]')) return JSON.stringify({ title: '학급 문고 도서 구입', intro: INTRO, fields: {} });
  return '[]';
});
const P = 'section[data-menu="purchase"]';
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:purchase:current') || 'null'));

async function reset() {
  await page.evaluate(() => {
    for (const x of Object.keys(localStorage)) if (x.startsWith('ssam:purchase')) localStorage.removeItem(x);
    localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
    localStorage.setItem('ssam:purchase:view', JSON.stringify('full'));
  });
  await page.reload({ timeout: 20000 });
  await page.waitForTimeout(300);
  await page.click('nav.app-side [data-menu-go="purchase"]');
  await page.click('#menuTabs [data-tab="new"]');
  await page.waitForSelector(`${P} #pcIntake`);
  // 앱이 칸에 값을 넣거나 커서·초점을 옮기면 적어 둠(입력기 흉내로 넣는 값은 __imeSet — 적지 않음)
  await page.evaluate(() => {
    const T = window.__t = { el: null, on: false, writes: [] };
    const native = new Map();
    for (const C of [HTMLInputElement, HTMLTextAreaElement]) {
      const d = Object.getOwnPropertyDescriptor(C.prototype, 'value');
      native.set(C, d.set);
      Object.defineProperty(C.prototype, 'value', { get: d.get, set(v) { if (T.on && this === T.el) T.writes.push('value=' + v); d.set.call(this, v); }, configurable: true });
      for (const m of ['setSelectionRange', 'select', 'setRangeText']) { const o = C.prototype[m]; C.prototype[m] = function (...a) { if (T.on && this === T.el) T.writes.push(m); return o.apply(this, a); }; }
    }
    for (const m of ['focus', 'blur', 'scrollIntoView']) { const o = HTMLElement.prototype[m] || Element.prototype[m]; HTMLElement.prototype[m] = function (...a) { if (T.on) T.writes.push(m + ' ' + (this.id || this.tagName)); return o.apply(this, a); }; }
    window.__imeSet = (el, v) => native.get(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement).call(el, v);
  });
}
async function makeDraft() {
  await page.fill(`${P} #pcIntake`, '동화책 10권 12000원');
  await page.click(`${P} [data-pc="go"]`);
  await page.waitForFunction(s => (document.querySelector(`${s} #pcTitle`) || {}).value, P);
  await page.waitForTimeout(150);
}
/* 입력기 흉내: 칸 끝에 글자(음절)마다 compositionstart → (compositionupdate + input isComposing)… → compositionend.
   음절 사이(한 키에 앞 음절 끝·다음 음절 시작)는 바로 잇고, 키 사이는 20ms 쉼. end=false면 마지막 음절을 조합 중인 채로 둠.
   → 조합하는 동안의 [화면 바뀜 수, 칸이 같은 요소·초점 그대로인지, 앱이 칸에 한 일, 입력기 값을 덮었는지] */
async function compose(sel, syllables, { end = true } = {}) {
  await page.evaluate(([s]) => {
    const el = document.querySelector(s);
    el.focus();
    const n = el.value.length; el.setSelectionRange(n, n);
    const box = document.querySelector('section[data-menu="purchase"] .pc-box');
    const c = window.__c = { el, base: el.value, muts: 0, same: true, overwritten: [] };
    c.mo = new MutationObserver(ms => { c.muts += ms.length; }); // 키 사이(타이머)에 고친 것도 셈
    window.__c.mo.observe(box, { subtree: true, childList: true, attributes: true, characterData: true });
    Object.assign(window.__t, { el, on: true, writes: [] });
  }, [sel]);
  for (let i = 0; i < syllables.length; i++) {
    const steps = syllables[i], last = i === syllables.length - 1;
    for (let j = 0; j < steps.length; j++) {
      await page.evaluate(([s, txt, start, fin, more]) => {
        const c = window.__c, el = c.el;
        const ev = (type, data) => el.dispatchEvent(new CompositionEvent(type, { bubbles: true, data }));
        if (start) ev('compositionstart', '');
        window.__imeSet(el, c.base + txt);
        ev('compositionupdate', txt);
        el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, inputType: 'insertCompositionText', data: txt }));
        c.muts += c.mo.takeRecords().length;
        if (document.querySelector(s) !== el || document.activeElement !== el) c.same = false;
        if (el.value !== c.base + txt) c.overwritten.push(el.value);
        if (fin) {
          // 한 키에: 이 음절 끝(compositionend) → (다음 음절이 있으면) 바로 다음 조합 시작
          ev('compositionend', txt);
          c.base = el.value;
          if (more) ev('compositionstart', '');
          // 마지막 음절을 마치면 여기까지 셈(마친 뒤 저장·화면 고치기는 괜찮음)
          else { c.muts += c.mo.takeRecords().length; c.mo.disconnect(); }
        }
      }, [sel, steps[j], j === 0 && !(i > 0 && syllables.length > 1), j === steps.length - 1 && (end || !last), !last]);
      await page.waitForTimeout(20);
    }
  }
  return page.evaluate(() => {
    const c = window.__c;
    c.muts += c.mo.takeRecords().length; c.mo.disconnect();
    window.__t.on = false;
    return { muts: c.muts, same: c.same, writes: window.__t.writes.slice(), overwritten: c.overwritten, value: c.el.value };
  });
}
const ok = (r, label) => {
  assert(r.same, `${label}: 조합 중 칸이 바뀌거나 초점이 옮겨 감`);
  assert(!r.writes.length, `${label}: 조합 중 앱이 칸을 건드림 ${JSON.stringify(r.writes)}`);
  assert(!r.overwritten.length, `${label}: 조합 중 칸 값을 덮음 ${JSON.stringify(r.overwritten)}`);
  assert(r.muts === 0, `${label}: 조합 중 화면을 ${r.muts}번 고침(글자마다 다시 그림)`);
};
const KO = [['ㄱ', '과'], ['ㅎ', '하', '학'], ['ㅅ', '시', '실']]; // 과학실

await page.goto(url);
await page.waitForTimeout(300);

await run('fix1117-purchase-ime', [
  ['[ime-1] 초안이 있을 때 품의 칸마다 한글을 조합하는 동안 칸·화면을 건드리지 않고, 마치면 저장·합계·사유가 따라옴', async () => {
    await reset();
    await makeDraft();
    // 둘째 품목: 수량·단가만 넣어 두고 품명을 조합(품명이 생기면 합계에 들어감)
    await page.click(`${P} [data-pc="addItem"]`);
    await page.fill(`${P} [data-item="1"][data-f="qty"]`, '2');
    await page.fill(`${P} [data-item="1"][data-f="price"]`, '3000');
    await page.waitForTimeout(100);
    assert((await page.textContent(`${P} #pcSum`)).includes('120,000'), '합계 처음');
    const form = ['#pcRelated', '#pcProject', '#pcPurpose', '#pcDate', '#pcTarget', '#pcPlace', '#pcBudget', '#pcTotal', '#pcMemo'];
    for (const f of form) {
      await page.fill(`${P} ${f}`, '');
      const r = await compose(`${P} ${f}`, KO);
      ok(r, f);
      assert(r.value === '과학실', `${f} 값: ${r.value}`);
      await page.waitForTimeout(80);
      const k = await page.getAttribute(`${P} ${f}`, 'data-k');
      assert((await state()).form[k] === '과학실', `${f} 저장: ${(await state()).form[k]}`);
    }
    // 사유가 따라옴(손대지 않은 사유)
    const rs = await page.inputValue(`${P} #pcReason`);
    assert(rs.startsWith('1. 관련: 과학실\n') && rs.includes('목적: 과학실') && rs.includes('장소: 과학실') && rs.includes('예산 과목: 과학실'), rs);
    // 품목 칸
    const r = await compose(`${P} [data-item="1"][data-f="name"]`, [['ㄱ', '고', '공'], ['ㅊ', '채', '책']]);
    ok(r, '품명');
    await page.waitForTimeout(80);
    assert((await page.textContent(`${P} #pcSum`)).includes('126,000'), '합계: ' + await page.textContent(`${P} #pcSum`));
    assert((await page.textContent(`${P} [data-amt="1"]`)).includes('6,000'), '금액 칸');
    assert((await page.inputValue(`${P} #pcReason`)).includes('금126,000원'), '사유 소요 예산');
    assert((await state()).form.items[1].name === '공책', '품명 저장');
    for (const f of ['spec', 'unit']) {
      const q = await compose(`${P} [data-item="1"][data-f="${f}"]`, [['ㄱ', '가', '각']]);
      ok(q, f);
      await page.waitForTimeout(80);
      assert((await state()).form.items[1][f] === '각', `${f} 저장`);
    }
    // 넣기 칸·제목·사유
    const a = await compose(`${P} #pcIntake`, KO);
    ok(a, '넣기 칸');
    assert((await page.inputValue(`${P} #pcIntake`)) === '과학실', '넣기 칸 값');
    const b = await compose(`${P} #pcTitle`, KO);
    ok(b, '제목');
    await page.waitForTimeout(80);
    assert((await state()).draft.title === '학급 문고 도서 구입과학실', '제목 저장: ' + (await state()).draft.title);
    assert(!errors.length, errors.join('\n'));
  }],
  ['[ime-2] 사유 칸 「2.」 줄 끝에서 조합: 칸·화면 그대로, 마치면 첫 문장으로 저장(앱이 계속 맞추는 사유)', async () => {
    await reset();
    await makeDraft();
    await page.click(`${P} #pcReason`);
    // 「2.」 줄 끝에 커서를 두고 입력기 흉내(compose()는 칸 끝에 붙여서 여기서는 직접)
    const res = await page.evaluate(s => {
      const ta = document.querySelector(`${s} #pcReason`), v = ta.value, n = v.indexOf('\n', v.indexOf('\n') + 1), head = v.slice(0, n), tail = v.slice(n);
      ta.setSelectionRange(n, n);
      const box = document.querySelector('section[data-menu="purchase"] .pc-box');
      const mo = new MutationObserver(() => {}); mo.observe(box, { subtree: true, childList: true, attributes: true, characterData: true });
      Object.assign(window.__t, { el: ta, on: true, writes: [] });
      let muts = 0;
      const ev = (type, data) => ta.dispatchEvent(new CompositionEvent(type, { bubbles: true, data }));
      let base = head;
      for (const syl of [['ㄷ', '도'], ['ㅅ', '서']]) {
        ev('compositionstart', '');
        for (const x of syl) { window.__imeSet(ta, base + ' ' + x + tail); ta.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, data: x })); muts += mo.takeRecords().length; }
        ev('compositionend', syl.at(-1));
        base = base + ' ' + syl.at(-1);
      }
      muts += mo.takeRecords().length; mo.disconnect(); window.__t.on = false;
      return { muts, writes: window.__t.writes.slice(), same: document.activeElement === ta && document.querySelector(`${s} #pcReason`) === ta };
    }, P);
    assert(res.same && !res.writes.length && res.muts === 0, JSON.stringify(res));
    await page.waitForTimeout(100);
    const s = await state();
    assert(s.draft.intro === INTRO + ' 도 서' && s.draft.edited === false, JSON.stringify([s.draft.intro, s.draft.edited]));
    assert(s.draft.reason === await page.inputValue(`${P} #pcReason`), '저장 = 화면');
  }],
  ['[ime-3] 실제 입력기(CDP)로 목적·품명을 여러 음절 치는 동안 화면을 고치지 않고, 마치면 저장·합계·사유가 따라옴', async () => {
    await reset();
    await makeDraft();
    const cdp = await page.context().newCDPSession(page);
    await page.evaluate(() => {
      const box = document.querySelector('section[data-menu="purchase"] .pc-box');
      window.__muts = 0;
      window.__mo = new MutationObserver(ms => { window.__muts += ms.length; }); window.__mo.observe(box, { subtree: true, childList: true, attributes: true, characterData: true });
    });
    const during = [];
    async function type(sel, syllables) {
      await page.click(sel);
      const take = () => page.evaluate(() => { const n = window.__muts + window.__mo.takeRecords().length; window.__muts = 0; return n; });
      await page.waitForTimeout(50); await take();
      for (const syl of syllables) {
        for (const x of syl) { await cdp.send('Input.imeSetComposition', { text: x, selectionStart: 1, selectionEnd: 1 }); await page.waitForTimeout(15); }
        during.push(await take());
        await cdp.send('Input.insertText', { text: syl.at(-1) });
        await page.waitForTimeout(30);
        await take(); // 음절을 마친 뒤(조합이 없을 때) 고치는 것은 괜찮음
      }
    }
    await page.fill(`${P} #pcPurpose`, '');
    await type(`${P} #pcPurpose`, [['ㄷ', '도'], ['ㅅ', '서']]);
    await page.waitForTimeout(100);
    assert(during.every(n => n === 0), '조합 중 화면 고침: ' + during);
    assert((await page.inputValue(`${P} #pcPurpose`)) === '도서' && (await state()).form.purpose === '도서', '목적');
    assert((await page.inputValue(`${P} #pcReason`)).includes('가. 목적: 도서'), '사유 목적');
    await page.click(`${P} [data-pc="addItem"]`);
    await page.fill(`${P} [data-item="1"][data-f="qty"]`, '3');
    await page.fill(`${P} [data-item="1"][data-f="price"]`, '1000');
    during.length = 0;
    await type(`${P} [data-item="1"][data-f="name"]`, [['ㅍ', '푸', '풀']]);
    await page.waitForTimeout(100);
    assert(during.every(n => n === 0), '조합 중 화면 고침(품명): ' + during);
    assert((await page.textContent(`${P} #pcSum`)).includes('123,000') && (await state()).form.items[1].name === '풀', '합계·저장');
    await cdp.detach();
    assert(!errors.length, errors.join('\n'));
  }],
  ['[ime-4] 조합 중에 치다 멈추면(마지막 음절을 조합 중인 채로) 칸은 그대로 두고 저장·사유는 따라옴, 칸을 떠나면 마침', async () => {
    await reset();
    await makeDraft();
    await page.fill(`${P} #pcPlace`, '');
    const r = await compose(`${P} #pcPlace`, KO, { end: false });
    ok(r, '장소(멈추기 전)');
    await page.evaluate(() => { Object.assign(window.__t, { on: true, writes: [] }); });
    await page.waitForTimeout(900);
    const w = await page.evaluate(() => { window.__t.on = false; return window.__t.writes.slice(); });
    assert(!w.length, '멈춘 뒤에도 칸을 건드림 ' + JSON.stringify(w));
    assert(await page.evaluate(s => document.activeElement === document.querySelector(s) && document.activeElement === window.__c.el, `${P} #pcPlace`), '칸이 바뀜');
    assert((await page.inputValue(`${P} #pcPlace`)) === '과학실', '값');
    assert((await state()).form.place === '과학실' && (await page.inputValue(`${P} #pcReason`)).includes('장소: 과학실'), '멈추면 저장·사유');
    await page.evaluate(s => { const el = document.querySelector(s); el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '실' })); }, `${P} #pcPlace`);
    await page.click(`${P} #pcDate`);
    await page.waitForTimeout(100);
    assert((await state()).form.place === '과학실', '마친 뒤 저장');
  }],
  ['[ime-5] 관련 칸에 치는 동안 그 칸의 안내 글(placeholder)은 바뀌지 않음(늘 비웠을 때의 기본값)', async () => {
    await reset();
    await page.click(`${P} [data-pctype="event"]`);
    await page.fill(`${P} #pcProject`, '가을 학교 축제');
    await page.waitForTimeout(100);
    const ph0 = await page.getAttribute(`${P} #pcRelated`, 'placeholder');
    assert(/^비우면 「xx초등학교-xxxxx\(\d{4}\. xx\. xx\.\)」$/.test(ph0), ph0);
    await page.click(`${P} #pcRelated`);
    await page.keyboard.insertText('○○교육청 공문');
    await page.waitForTimeout(100);
    assert((await page.getAttribute(`${P} #pcRelated`, 'placeholder')) === ph0, '안내 글이 친 글을 따라 바뀜: ' + await page.getAttribute(`${P} #pcRelated`, 'placeholder'));
    await page.fill(`${P} #pcRelated`, '');
    await page.waitForTimeout(100);
    assert((await page.getAttribute(`${P} #pcRelated`, 'placeholder')) === ph0, '비우면 기본값');
  }]
]);
await t.close();
