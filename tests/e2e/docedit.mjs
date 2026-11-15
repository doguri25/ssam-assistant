// 문서·소통 › 문서 다듬기(스펙 2026-11-15 1A): .hwpx 넣기 → 빠른 요청 칩·요청 → [다듬기](AI 업무 doc, 줄 글만 — 이름·연락처는 가리고 명단 줄은 보내지 않음)
// → 바뀐 줄만 전 → 후(지운 줄·더한 줄 표시), 바뀌지 않은 줄은 접어 둠, 줄마다 [되돌리기]·[모두 되돌리기], 이어서 고치기·[한 단계 되돌리기],
// 날짜·학년도 바꾸기(AI 없이), [한글로 내려받기](원래 이름 + (다듬음), 모양 그대로 다시 열림), .txt는 글만 읽어 쌤비서 기본 문서로, 휴대폰(390·360px)
// 문서·이름은 모두 지어낸 것(새싹초등학교·김하늘·이바다·한가람)
import { readFileSync } from 'node:fs';
import { open, run, assert, mockClaude } from './helpers.mjs';
import { makeHwpx } from '../../web/core/hwpx.js';
import { readForm, checkXml } from '../../web/core/hwpx-form.js';
import { unzip } from '../../web/core/zip.js';

const t = await open();
const { page, url, errors } = t;
page.on('dialog', d => d.accept().catch(() => {}));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const DOC = makeHwpx({ title: '2026학년도 새싹초등학교 독서교육 운영 계획', blocks: [
  { type: 'p', text: '1. 목적' },
  { type: 'p', text: '  가. 학생들이 책 읽는 즐거움을 알게 하고자 함.' },
  { type: 'p', text: '2. 운영 방침' },
  { type: 'p', text: '  가. 아침 독서 시간을 운영함.' },
  { type: 'p', text: '담당: 교무부장 이바다 선생님(041-123-4567)' },
  { type: 'p', text: '참석: 김하늘, 이바다, 한가람' },
  { type: 'table', head: true, rows: [['구분', '내용'], ['기간', '2026. 3. ~ 2027. 2.'], ['대상', '3~6학년']] },
  { type: 'p', text: '붙임  계획서 1부.  끝.' }
] });
const orig = await readForm(DOC);
const prompts = [];
const idsOf = p => { const m = new Map(); for (const x of p.matchAll(/^\[(\d+)\] (.*)$/gm)) m.set(x[2], +x[1]); return m; };
await mockClaude(page, ({ prompt }) => {
  if (!prompt.startsWith('[문서 다듬기]')) return '{}';
  prompts.push(prompt);
  const id = idsOf(prompt);
  if (prompt.includes('[요청] 공문체로')) {
    return JSON.stringify({ changes: [
      { id: id.get('1. 목적'), op: 'replace', text: '1. 운영 목적' },
      { id: id.get('담당: 교무부장 〔이름1〕 선생님({{1}})'), op: 'replace', text: '담당: 교무부장 〔이름1〕 선생님({{1}})께서 운영함' },
      { id: id.get('  가. 아침 독서 시간을 운영함.'), op: 'delete' },
      { id: id.get('2. 운영 방침'), op: 'after', text: '  가. 날마다 아침 독서 시간을 운영함.' },
      { id: id.get('3~6학년'), op: 'replace', text: '3~6학년 전체' }
    ], note: '공문체로 다듬었어요.' });
  }
  if (prompt.includes('짧게 줄여 줘')) return JSON.stringify({ changes: [{ id: id.get('  가. 학생들이 책 읽는 즐거움을 알게 하고자 함.'), op: 'replace', text: '  가. 책 읽는 즐거움을 알게 함.' }], note: '짧게 줄였어요.' });
  return JSON.stringify({ changes: [], note: '' });
});
const B = 'section[data-menu="etc"] .de-box';
const go = (menu, tab) => page.evaluate(([m, tb]) => import('./core/shell.js').then(s => s.go(m, tb)), [menu, tab]);
const entries = () => page.locator(`${B} .de-chg`).count();
const toastText = () => page.evaluate(() => (document.querySelector('#toast') || {}).textContent || '');

await page.goto(url);
await page.waitForTimeout(400);

await run('docedit', [
  ['문서·소통에 「문서 다듬기」 탭: 다른 탭은 숨고, AI 줄(문서 다듬기·회의록)·「AI로 가는 것」 안내', async () => {
    await page.click('nav.app-side [data-menu-go="etc"]');
    assert((await page.textContent('#menuTabs')).includes('문서 다듬기'), '탭');
    await page.click('#menuTabs [data-tab="docedit"]');
    await page.waitForSelector(`${B} #deFile`, { state: 'attached' });
    assert(await page.isHidden('section[data-menu="etc"] .gm-box') && await page.isHidden('section[data-menu="etc"] .lf-box'), '다른 탭이 보임');
    assert(await page.locator(`${B} [data-ai-row="doc"]`).count() === 1, 'AI 줄');
    const note = await page.evaluate(s => document.querySelector(`${s} .ai-note-body`).textContent, B);
    assert(note.includes('줄 글만') && note.includes('이름·연락처') && note.includes('명단·주민번호') && note.includes('원본 파일은 저장하지 않아요'), note);
    assert(await page.locator(`${B} [data-de="run"]`).isDisabled(), '문서 없이 [다듬기]');
  }],
  ['.hwpx 넣기 → 파일 이름·고칠 줄 수, 바뀐 줄은 아직 없고 문서 줄은 접혀 있음', async () => {
    await page.setInputFiles(`${B} #deFile`, { name: '독서교육-계획.hwpx', mimeType: 'application/octet-stream', buffer: Buffer.from(DOC) });
    await page.waitForSelector(`${B} .de-name`);
    const nm = await page.textContent(`${B} .de-name`);
    assert(nm.includes('독서교육-계획.hwpx') && nm.includes('14줄'), nm);
    assert(await entries() === 0, '바뀐 줄');
    assert(await page.locator(`${B} details.de-same`).count() === 1 && !(await page.evaluate(s => document.querySelector(`${s} details.de-same`).open, B)), '접힌 줄');
    assert(await page.isHidden(`${B} .de-plain`), '.hwpx는 글만 안내가 없음');
  }],
  ['칩 「공문체로」 → 요청 칸, [다듬기] → AI 한 번(줄 글만, 이름·연락처는 가림, 명단 줄 빼고) → 바뀐 줄만 전 → 후(이름 되돌림)·지움·더함', async () => {
    await page.click(`${B} [data-de-chip="formal"]`);
    assert((await page.inputValue(`${B} #deAsk`)).startsWith('공문체로'), '칩 요청');
    await page.click(`${B} [data-de="run"]`);
    await page.waitForFunction(s => document.querySelectorAll(`${s} .de-chg`).length === 5, B, { timeout: 8000 });
    assert(prompts.length === 1, 'AI ' + prompts.length);
    const p = prompts[0];
    assert(p.includes('[1] 2026학년도 새싹초등학교 독서교육 운영 계획') && p.includes('담당: 교무부장 〔이름1〕 선생님({{1}})') && /표 칸 줄: /.test(p), p.slice(0, 900));
    assert(!/이바다|김하늘|한가람|041-123-4567|참석:/.test(p), '보내면 안 되는 글: ' + p);
    const txt = await page.textContent(`${B} #dePrev`);
    assert(txt.includes('이바다 선생님(041-123-4567)께서 운영함') && txt.includes('1. 운영 목적') && txt.includes('3~6학년 전체'), txt);
    assert(await page.locator(`${B} .de-chg.de-del`).count() === 1 && await page.locator(`${B} .de-chg.de-add`).count() === 1, '지움·더함 표시');
    assert((await page.textContent(`${B} .de-chg.de-del`)).includes('아침 독서 시간을 운영함.'), '지운 줄');
    assert((await page.textContent(`${B} .de-note`)).includes('공문체로 다듬었어요.'), 'AI 메모');
    assert((await toastText()).includes('5줄'), await toastText());
  }],
  ['줄마다 [되돌리기]: 그 줄만 원래대로(표 칸 「3~6학년」)', async () => {
    const li = page.locator(`${B} .de-chg`, { hasText: '3~6학년 전체' });
    await li.locator('[data-de-revert]').click();
    await page.waitForFunction(s => document.querySelectorAll(`${s} .de-chg`).length === 4, B);
    assert(!(await page.textContent(`${B} #dePrev`)).includes('3~6학년 전체'), '되돌리지 않음');
  }],
  ['이어서 고치기: 고친 글 위에 두 번째 요청(지운 줄은 보내지 않음) → [한 단계 되돌리기]로 그 앞', async () => {
    await page.fill(`${B} #deAsk`, '이바다 선생님 줄은 두고 짧게 줄여 줘');
    await page.click(`${B} [data-de="run"]`);
    await page.waitForFunction(s => document.querySelectorAll(`${s} .de-chg`).length === 5, B, { timeout: 8000 });
    const p = prompts[1];
    assert(p && p.includes('1. 운영 목적') && p.includes('  가. 날마다 아침 독서 시간을 운영함.') && !/\]   가\. 아침 독서/.test(p), p && p.slice(0, 900));
    assert(p.includes('[요청] 〔이름1〕 선생님 줄은 두고 짧게 줄여 줘') && !/이바다|041-123-4567/.test(p), '요청 글도 가림: ' + p.slice(0, 400));
    assert((await page.textContent(`${B} #dePrev`)).includes('  가. 책 읽는 즐거움을 알게 함.'.trim()), '두 번째 고침');
    await page.click(`${B} [data-de="undo"]`);
    await page.waitForFunction(s => document.querySelectorAll(`${s} .de-chg`).length === 4, B);
    assert(!(await page.textContent(`${B} #dePrev`)).includes('책 읽는 즐거움을 알게 함.'), '한 단계 되돌리지 않음');
  }],
  ['칩 「날짜·학년도 바꾸기」: 문서의 학년도를 짐작해 묻고, [모두 바꾸기]는 AI 없이', async () => {
    const n0 = prompts.length;
    await page.click(`${B} [data-de-chip="swap"]`);
    await page.waitForSelector(`${B} #deFrom`);
    assert(await page.inputValue(`${B} #deFrom`) === '2026학년도' && await page.inputValue(`${B} #deTo`) === '2027학년도', '짐작');
    await page.click(`${B} [data-de="swap"]`);
    await page.waitForFunction(s => document.querySelectorAll(`${s} .de-chg`).length === 5, B);
    assert(prompts.length === n0, 'AI를 부름');
    assert((await page.textContent(`${B} #dePrev`)).includes('2027학년도 새싹초등학교 독서교육 운영 계획'), '학년도');
  }],
  ['[한글로 내려받기]: 원래 이름 + (다듬음).hwpx, 다시 열면 바뀐 글·표 칸 그대로·잘 짜인 XML', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${B} [data-de="download"]`)]);
    assert(dl.suggestedFilename() === '독서교육-계획(다듬음).hwpx', dl.suggestedFilename());
    const bytes = new Uint8Array(readFileSync(await dl.path()));
    const z = await unzip(bytes);
    checkXml(new TextDecoder().decode(z.get('Contents/section0.xml')));
    const f = await readForm(bytes), tx = f.lines.map(l => l.text);
    assert(tx[0] === '2027학년도 새싹초등학교 독서교육 운영 계획' && tx.includes('1. 운영 목적') && !tx.includes('  가. 아침 독서 시간을 운영함.'), tx.join(' | '));
    assert(tx[tx.indexOf('2. 운영 방침') + 1] === '  가. 날마다 아침 독서 시간을 운영함.', '더한 줄 자리');
    assert(tx.includes('담당: 교무부장 이바다 선생님(041-123-4567)께서 운영함') && tx.includes('참석: 김하늘, 이바다, 한가람') && tx.includes('3~6학년'), '이름 되돌림·보내지 않은 줄·되돌린 칸');
    assert(f.lines.filter(l => l.inBox).length === orig.lines.filter(l => l.inBox).length, '표 칸 줄 수');
  }],
  ['[모두 되돌리기] → 바뀐 줄 없음, [한 단계 되돌리기]로 다시', async () => {
    await page.click(`${B} [data-de="revertAll"]`);
    await page.waitForFunction(s => document.querySelectorAll(`${s} .de-chg`).length === 0, B);
    await page.click(`${B} [data-de="undo"]`);
    await page.waitForFunction(s => document.querySelectorAll(`${s} .de-chg`).length === 5, B);
  }],
  ['휴대폰(390·360px): 가로로 넘치지 않고 누르는 칸끼리 겹치지 않음(설명·안내·접은 줄을 펼쳐도)', async () => {
    const bad = [];
    for (const [w, h] of [[390, 844], [360, 780]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(250);
      await page.evaluate(s => document.querySelectorAll(`${s} details`).forEach(d => { d.open = true; }), B);
      await page.waitForTimeout(150);
      const sw = await page.evaluate(() => { const a = document.querySelector('#app'); return [document.documentElement.scrollWidth, a.scrollWidth, a.clientWidth]; });
      if (sw[0] > w || sw[1] > sw[2]) bad.push(`${w}px 가로 넘침 ${sw}`);
      for (const x of await scan()) bad.push(`${w}px: ${x}`);
    }
    await page.setViewportSize({ width: 1280, height: 860 });
    assert(!bad.length, bad.join('\n'));
  }],
  ['.txt(글만): 묻고 새 문서로, 「한글에서 .hwpx로 저장해 넣으면 모양 그대로예요」, 쌤비서 기본 문서로 내려받기', async () => {
    await page.setInputFiles(`${B} #deFile`, { name: '운동회 안내.txt', mimeType: 'text/plain', buffer: Buffer.from('2026학년도 가을 운동회 안내\n\n1. 일시: 2026. 10. 2.(금)\n2. 장소: 운동장\n') });
    await page.waitForFunction(s => (document.querySelector(`${s} .de-name`) || {}).textContent?.includes('운동회 안내.txt'), B);
    assert((await page.textContent(`${B} .de-plain`)).includes('한글에서 .hwpx로 저장해 넣으면 모양 그대로예요'), '안내');
    assert(await entries() === 0, '새 문서');
    await page.click(`${B} [data-de-chip="swap"]`);
    await page.click(`${B} [data-de="swap"]`);
    await page.waitForFunction(s => document.querySelectorAll(`${s} .de-chg`).length === 1, B);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${B} [data-de="download"][data-exp-main]`)]);
    assert(dl.suggestedFilename() === '운동회 안내(다듬음).hwpx', dl.suggestedFilename());
    const f = await readForm(new Uint8Array(readFileSync(await dl.path())));
    const tx = f.lines.map(l => l.text);
    assert(tx[0] === '2027학년도 가을 운동회 안내' && tx.includes('1. 일시: 2026. 10. 2.(금)'), tx.join(' | '));
  }],
  ['문서 칸에 .hwpx를 끌어 놓으면 고른 것처럼(다듬던 문서가 있으면 묻고) 들어감', async () => {
    await drop(`${B} .de-file`, '독서교육-계획.hwpx', DOC);
    await page.waitForFunction(s => (document.querySelector(`${s} .de-name`) || {}).textContent?.includes('독서교육-계획.hwpx'), B);
    assert(await page.isHidden(`${B} .de-plain`) && await entries() === 0, '새 .hwpx');
  }],
  ['다른 화면에서 putDoceditFile(파일, { ask }) → 문서 다듬기 탭에 넣고 그 요청으로 바로 다듬기', async () => {
    await go('home');
    const st = await page.evaluate(async b64 => {
      const m = await import('./menus/etc/docedit.js');
      return m.putDoceditFile(new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], '안내.hwpx'), { ask: '공문체로 다듬어 줘' });
    }, Buffer.from(DOC).toString('base64'));
    assert(st === 'started', st);
    await page.waitForFunction(s => document.querySelectorAll(`${s} .de-chg`).length === 5, B, { timeout: 8000 });
    assert(await page.isVisible(`${B} .de-name`) && (await page.textContent(`${B} .de-name`)).includes('안내.hwpx'), '탭');
    assert(await page.inputValue(`${B} #deAsk`) === '공문체로 다듬어 줘', '요청 칸');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();

/* 칸에 파일 하나를 끌어 놓음(file-drop.mjs와 같은 방식) */
function drop(sel, name, bytes) {
  return page.evaluate(({ sel, name, b64 }) => {
    const el = document.querySelector(sel), dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], name));
    const r = el.getBoundingClientRect(), o = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 4, clientY: r.top + 4 };
    el.dispatchEvent(new DragEvent('dragenter', o)); el.dispatchEvent(new DragEvent('dragover', o)); el.dispatchEvent(new DragEvent('drop', o));
  }, { sel, name, b64: Buffer.from(bytes).toString('base64') });
}

/* 휴대폰 겹침 보기(mobile-layout.mjs와 같은 방식): 보이는 본문 누르는 칸끼리 겹침, 위아래로 내려 가며 */
async function scan() {
  const seen = new Set();
  const max = await page.evaluate(() => { const a = document.querySelector('#app'); return a.scrollHeight - a.clientHeight; });
  for (let y = 0; y <= max + 1; y += 200) {
    await page.evaluate(v => { document.querySelector('#app').scrollTop = v; }, y);
    await page.waitForTimeout(60);
    (await page.evaluate(() => {
      const sec = document.querySelector('section[data-menu="etc"]');
      const clip = e => {
        const r = e.getBoundingClientRect();
        let x = { l: r.left, t: r.top, r: r.right, b: r.bottom };
        for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const q = p.getBoundingClientRect(); x = { l: Math.max(x.l, q.left), t: Math.max(x.t, q.top), r: Math.min(x.r, q.right), b: Math.min(x.b, q.bottom) }; }
        }
        return x;
      };
      const name = e => (e.getAttribute('aria-label') || e.textContent || e.placeholder || e.id || '').trim().replace(/\s+/g, ' ').slice(0, 30);
      const els = [...sec.querySelectorAll('button, a[href], input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea, [role=button], summary')]
        .filter(e => e.checkVisibility({ opacityProperty: true, visibilityProperty: true })).map(e => [e, clip(e)]).filter(([, x]) => x.r - x.l > 2 && x.b - x.t > 2);
      const hit = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 3 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 3;
      const out = [];
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        const [a, ra] = els[i], [b, rb] = els[j];
        if (!a.contains(b) && !b.contains(a) && hit(ra, rb)) out.push(`${name(a)} × ${name(b)}`);
      }
      return out;
    })).forEach(x => seen.add(x));
  }
  await page.evaluate(() => { document.querySelector('#app').scrollTop = 0; });
  return [...seen];
}
