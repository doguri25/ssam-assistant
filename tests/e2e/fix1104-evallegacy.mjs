// 평가 옛 화면(평가지 채점)·한꺼번에 넣기 고침 (11월 4일)
// 적힌 번호로 맞출 때 결석 번호·채점에서 뺀 쪽이 나이스 칸을 밀지 않음, 글자층 학생 스캔은 정답·기준 글이 되지 않음(묶음 글은 이름 가림),
// 다음 평가 묶음은 지난 정답표를 비우고 넣음, 넣을 것이 없을 때 알림, 기준 칸을 고치는 중에는 다시 그리지 않음, 「새 채점」 직전 저장
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await t.ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
  if (!localStorage.getItem('ssam:class')) localStorage.setItem('ssam:class', JSON.stringify({ count: 4, except: [] }));
  if (!localStorage.getItem('ssam:grset')) localStorage.setItem('ssam:grset', JSON.stringify({ maskOn: false, mask: [] }));
  // Windows 앱 흉내: 나이스 차례로 붙여넣기에 넘기는 글을 받아 둠
  window.__inv = [];
  window.__TAURI__ = {
    core: { invoke: async (cmd, args) => { window.__inv.push({ cmd, args }); if (cmd === 'neis_arm') return { gen: 1, secs: 300 }; if (cmd === 'app_version') return '0.0.0'; if (cmd === 'check_update') return { available: false }; return null; } },
    event: { listen: async () => () => {} }
  };
});
let reads = [], roles = null;
const grades = [];
await mockClaude(page, ({ prompt, images }) => {
  if (prompt.startsWith('[번호 읽기]')) return JSON.stringify({ nos: reads.map((no, i) => ({ i: i + 1, no, sure: true })) });
  if (prompt.startsWith('[쪽 나누기]')) return JSON.stringify({ pages: roles || [] });
  if (prompt.includes('수행평가를 채점하는')) { grades.push({ prompt, images }); return JSON.stringify({ score: 80, summary: '바르게 풀었음', evidence: ['풀이가 맞음'], strengths: '꼼꼼함', improve: '검산', unreadable: false }); }
  if (prompt.includes('채점 결과입니다')) return '[]';
  return JSON.stringify([...prompt.matchAll(/^- (\d+)번 \(/gm)].map(m => ({ no: +m[1], text: `${m[1]}번 학생 평어로 수를 바르게 계산함.` })));
});
const until = async (fn, ms = 20000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('시간 초과'); await new Promise(r => setTimeout(r, 80)); } };
const shot = async (w, name = `답안${w}.png`) => ({ name, mimeType: 'image/png', buffer: await page.screenshot({ clip: { x: 0, y: 0, width: w, height: 420 } }) });
const lastArm = () => page.evaluate(() => { const a = window.__inv.filter(x => x.cmd === 'neis_arm').pop(); return a ? a.args.texts : null; });
const saved = () => page.evaluate(() => { const ids = JSON.parse(localStorage.getItem('ssam:grs') || '[]'); return ids.length ? JSON.parse(localStorage.getItem('ssam:gr:' + ids[0])) : null; });
const rows = () => page.$$eval('#grResults [data-grrow]', els => els.map(e => e.querySelector('.badge').textContent.trim() + (e.classList.contains('skip') ? 's' : '')));
const chips = () => page.$$eval('#grCritBox .chip', els => els.map(e => e.textContent.trim()));
const toastText = () => page.evaluate(() => (document.querySelector('#toast') || {}).textContent || '');
const fresh = async () => {
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/^ssam:(gr:|grs$)/.test(k)) localStorage.removeItem(k); });
  await page.goto(url, { timeout: 30000 }); await page.waitForTimeout(500);
  await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="gr"]');
  await page.waitForSelector('#grDrop');
};
const upload = async files => {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#grDrop')]);
  await fc.setFiles(files);
  await page.waitForFunction(n => document.querySelector('#grSetup').textContent.includes(`학생 ${n}명`), files.length);
};
// 화면 정리(스펙 2026-11-14-ui-tidy): 자주 안 바꾸는 설정은 접혀 있어 펼친 뒤 바꿈
const openFold = async key => { await page.waitForSelector(`[data-fold="${key}"]`); if (!(await page.$eval(`[data-fold="${key}"]`, d => d.open))) await page.click(`[data-fold="${key}"] > summary`); };
const drawNoBox = async () => {
  await page.click('[data-gr="noBox"]');
  await page.waitForSelector('#sheetRoot #mkStage');
  const b = await page.locator('#sheetRoot #mkStage').boundingBox();
  await page.mouse.move(b.x + b.width * 0.7, b.y + 8); await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.9, b.y + 40, { steps: 4 }); await page.mouse.up();
  await page.click('#sheetRoot #mkOk');
};
const gradeAll = async () => {
  await page.click('[data-gr="start"]');
  await page.waitForSelector('[data-gr="copyAll"]:not([disabled])', { timeout: 20000 });
  await page.waitForTimeout(300);
};
const neisTexts = async () => {
  await page.click('[data-gr="copyAll"]');
  await page.waitForSelector('#neisPanel .neis-steps');
  await until(async () => !!(await lastArm()), 3000);
  const r = { texts: await lastArm(), steps: (await page.textContent('#neisPanel .neis-steps')).replace(/\s+/g, ' ') };
  await page.click('#neisPanel [data-neis="close"]');
  return r;
};
// 글자층 PDF (복사기 「검색 가능 PDF」·인쇄본): 쪽마다 html
const pdfOf = async pagesHtml => {
  const pg = await t.ctx.newPage();
  await pg.setContent(`<!doctype html><meta charset="utf-8"><style>section{page-break-after:always;height:900px;font:16px sans-serif}</style>${pagesHtml.map(h => `<section>${h}</section>`).join('')}`);
  const b = await pg.pdf({ format: 'A4' }); await pg.close(); return b;
};
const KIDS = [['5', '김민수'], ['6', '이서연'], ['7', '박지훈'], ['8', '최하은']];
const putBundle = async (files, card = true) => {
  await page.setInputFiles('#bundleFile-gr', files);
  if (card) { await page.waitForSelector('#sheetRoot #bundleOk', { timeout: 15000 }); const sum = await page.textContent('#sheetRoot #bundleSum'); await page.click('#sheetRoot #bundleOk'); return sum; }
  return '';
};

await page.goto(url); await page.waitForTimeout(400);

await run('fix1104-evallegacy', [
  ['[gr-byno-absent] 학급 4명·2번 결석(읽은 번호 1·3·4) → 2번은 「채점 안 함」 자리, 나이스 글은 [1번, 빈 칸, 3번, 4번]', async () => {
    await fresh();
    await upload([await shot(300), await shot(310), await shot(320)]);
    reads = [1, 3, 4];
    await openFold('gr-pages');
    await page.check('#grByNo');
    await drawNoBox();
    await page.fill('#grTitle', '세 자리 수 덧셈'); await page.dispatchEvent('#grTitle', 'input');
    await page.click('[data-gr="start"]');
    await page.waitForSelector('#sheetRoot #noOk');
    assert((await page.textContent('#sheetRoot #noMissing')).includes('2번'), await page.textContent('#sheetRoot #noMissing'));
    await page.click('#sheetRoot #noOk');
    await page.waitForSelector('[data-gr="copyAll"]:not([disabled])', { timeout: 20000 });
    await page.waitForTimeout(300);
    assert(JSON.stringify(await rows()) === JSON.stringify(['1', '2s', '3', '4']), JSON.stringify(await rows()));
    const n = await neisTexts();
    assert(n.texts.length === 4 && n.texts[0].startsWith('1번') && n.texts[1] === '' && n.texts[2].startsWith('3번') && n.texts[3].startsWith('4번'), JSON.stringify(n.texts));
    assert(n.steps.includes('1번부터 4번까지 4명'), n.steps);
    await until(async () => { const g = await saved(); return g && g.students.map(s => s.no + (s.skip ? 's' : '')).join(',') === '1,2s,3,4'; }, 3000);
  }],
  ['[gr-byno-absent] 번호 칸·이름 칸 편집기는 채운 빈 자리(쪽 없음)를 건너뜀(오류 없음)', async () => {
    await page.click('[data-gr="back"]').catch(() => {});
    await page.click('[data-gr="noBox"]');
    await page.waitForSelector('#sheetRoot #mkStage');
    await page.click('#sheetRoot [data-close]').catch(() => page.mouse.click(5, 5));
    await page.waitForTimeout(200);
    assert(errors.length === 0, errors.join(' | '));
  }],
  ['[gr-byno-absent] 빈 자리를 채운 뒤 학생당 쪽을 다시 정해도 「채점 안 함」이 엉뚱한 쪽으로 옮겨 가지 않음', async () => {
    await page.fill('#grPer', '1'); await page.dispatchEvent('#grPer', 'change');
    await page.evaluate(() => document.querySelector('#grView').classList.add('show-pane'));
    await until(async () => (await rows()).length === 3, 3000);
    assert(JSON.stringify(await rows()) === JSON.stringify(['1', '2', '3']), JSON.stringify(await rows()));
  }],
  ['[gr-byno-skip-dup] 첫 쪽을 「채점에서 빼기」하고 나머지에서 1·2번 → 번호가 겹치지 않고 나이스 글은 [1번, 2번](빈 칸 없음)', async () => {
    await fresh();
    await upload([await shot(300), await shot(310), await shot(320)]);
    await page.evaluate(() => document.querySelector('#grView').classList.add('show-pane'));
    await page.click('#grResults [data-grskip]');
    reads = [1, 2];
    await openFold('gr-pages');
    if (!(await page.isChecked('#grByNo'))) await page.check('#grByNo');
    await page.fill('#grTitle', '세 자리 수 덧셈'); await page.dispatchEvent('#grTitle', 'input');
    await page.click('[data-gr="start"]');
    await page.waitForSelector('#sheetRoot #noOk');
    await page.click('#sheetRoot #noOk');
    await page.waitForSelector('[data-gr="copyAll"]:not([disabled])', { timeout: 20000 });
    await page.waitForTimeout(300);
    const r = await rows();
    assert(r.length === 3 && r[0] === '1' && r[1] === '2' && r[2].endsWith('s') && !r[2].startsWith('1') && !r[2].startsWith('2'), JSON.stringify(r));
    const n = await neisTexts();
    assert(n.texts.length === 2 && n.texts[0].startsWith('1번') && n.texts[1].startsWith('2번'), JSON.stringify(n.texts));
    assert(n.steps.includes('1번부터 2번까지 2명'), n.steps);
    const g = await saved();
    const nos = g.students.filter(s => !s.skip).map(s => s.no);
    assert(nos.join(',') === '1,2' && g.students.filter(s => s.skip).every(s => !(s.no > 0)), JSON.stringify(g.students.map(s => [s.no, s.skip])));
  }],
  ['[gr-byno-skip-dup] 지난 채점으로 다시 열어도 나이스 글은 [1번, 2번]', async () => {
    await page.goto(url, { timeout: 30000 }); await page.waitForTimeout(500);
    await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="gr"]');
    await page.waitForSelector('[data-grhist]');
    await page.click('[data-grhist]');
    await page.waitForSelector('[data-gr="copyAll"]');
    const n = await neisTexts();
    assert(n.texts.length === 2 && n.texts[0].startsWith('1번') && n.texts[1].startsWith('2번'), JSON.stringify(n.texts));
  }],
  ['[gr-bundle-ocr-privacy] 글자층 학생 스캔 PDF(「이름 김민수」 쌍점 없음, 4쪽)를 평가지 채점 묶음에 넣으면 학생 4명, 정답·기준 문서 없음, 채점 요청에 이름 없음', async () => {
    await fresh();
    await openFold('gr-pages');
    if (await page.isChecked('#grByNo')) await page.uncheck('#grByNo');
    const pdf = await pdfOf(KIDS.map(([no, nm]) => `<h2>3학년 수학 수행평가 곱셈</h2><p>3학년 2반 ${no}번 이름 ${nm}</p><p>1. 23 x 4 를 계산하고 까닭을 쓰시오. 답 92 까닭 20 x 4 와 3 x 4 를 더했어요</p>`));
    await putBundle([{ name: '3학년2반_곱셈_스캔.pdf', mimeType: 'application/pdf', buffer: pdf }], false);
    await page.waitForFunction(() => document.querySelector('#grSetup').textContent.includes('학생 4명'), null, { timeout: 15000 });
    assert(await page.locator('#sheetRoot #bundleCard').count() === 0, '카드');
    assert((await chips()).length === 0, JSON.stringify(await chips()));
    const g0 = grades.length;
    await page.fill('#grTitle', '곱셈'); await page.dispatchEvent('#grTitle', 'input');
    await gradeAll();
    const sent = grades.slice(g0).map(g => g.prompt).join('\n');
    assert(grades.length - g0 === 4 && KIDS.every(([, nm]) => !sent.includes(nm)), sent.slice(0, 300));
  }],
  ['[gr-bundle-ocr-privacy] 단원평가·활동지 묶음(expect 없음)에서도 「이름 김민수」 글자층 스캔은 문서가 아니라 쪽', async () => {
    const pdf = [...await pdfOf(KIDS.map(([no, nm]) => `<p>3학년 2반 ${no}번 이름 ${nm}</p><p>3학년 수학 수행평가 곱셈</p><p>1. 23 x 4 를 계산하고 까닭을 쓰시오. 답 92</p>`))];
    const r = await page.evaluate(async bytes => {
      const B = await import('./core/bundle.js');
      const b = await B.readBundle([new File([new Uint8Array(bytes)], '스캔.pdf', { type: 'application/pdf' })]);
      return { pages: b.pages.length, student: b.doc.student, teacher: b.doc.teacher, roles: b.roles };
    }, pdf);
    assert(r.pages === 4 && !r.student && !r.teacher && r.roles.every(x => x === 'student'), JSON.stringify(r).slice(0, 300));
  }],
  ['[gr-bundle-ocr-privacy] 「정답」 이름의 글자층 PDF는 학생이 아니라 정답·교사용(카드), 정답·기준으로 들어가는 묶음 글은 이름 칸을 가림', async () => {
    await fresh();
    const key = await pdfOf(['<p>곱셈 평가</p><p>1. 92 (20 x 4 와 3 x 4 를 더함)</p><p>2. 128 (32 x 4)</p>']);
    const sum = await putBundle([{ name: '곱셈 정답.pdf', mimeType: 'application/pdf', buffer: key },
      { name: '채점 기준.txt', mimeType: 'text/plain', buffer: Buffer.from('[채점 기준]\n1번 정답 92, 까닭이 있으면 만점\n잘 쓴 예: 3학년 2반 5번 이름: 김민수') }]);
    // 한글에서 내보낸 정답 PDF(글자층)는 정답·교사용 문서(쪽이 아님), 학생으로 세지 않음
    assert(sum.includes('정답·교사용') && !sum.includes('학생'), sum);
    await page.waitForFunction(() => document.querySelector('#grCritBox').textContent.includes('한꺼번에 넣은 정답·기준'));
    const c = await chips();
    assert(c.some(x => x.includes('한꺼번에 넣은 정답·기준')) && !(await page.textContent('#grSetup')).includes('학생 1명'), JSON.stringify(c));
    await page.click('#grCritBox [data-grcritview="0"]');
    await page.waitForSelector('#sheetRoot #critDocText');
    const text = await page.inputValue('#sheetRoot #critDocText');
    assert(text.includes('1번 정답 92') && text.includes('128') && KIDS.every(([, nm]) => !text.includes(nm)), text);
    await page.click('#sheetRoot [data-close]').catch(() => page.mouse.click(5, 5));
  }],
  ['[gr-bundle-digital] 한글에서 내보낸 평가지 PDF(글자층, 이름 칸 비어 있음)는 학생이 아니라 정답·기준 글, 사진 답안 3장은 학생 3명', async () => {
    await fresh();
    roles = null;
    const paper = await pdfOf(['<h2>3학년 수학 3단원 평가</h2><p>3학년 반 번 이름</p><p>1. 23 x 4 를 계산하고 까닭을 쓰시오.</p><p>2. 32 x 4 를 계산하시오.</p>']);
    await putBundle([{ name: '3단원 평가지.pdf', mimeType: 'application/pdf', buffer: paper }, await shot(300, 'd-1.png'), await shot(310, 'd-2.png'), await shot(320, 'd-3.png')], false);
    await page.waitForFunction(() => document.querySelector('#grSetup').textContent.includes('학생 3명'), null, { timeout: 15000 });
    const c = await chips();
    assert(c.some(x => x.includes('한꺼번에 넣은 정답·기준')), JSON.stringify(c));
  }],
  ['[gr-bundle-oldkey] A 묶음 채점 뒤 B 묶음 → 정답표는 B 것만, B 채점 요청에 A 정답 글·그림 없음', async () => {
    await fresh();
    const bundle = async tag => [
      { name: `${tag}평가 정답.txt`, mimeType: 'text/plain', buffer: Buffer.from(`${tag}평가 정답\n1번 정답 ${tag === 'A' ? '456' : '999'}\n2번 정답 ${tag === 'A' ? '곱셈' : '나눗셈'}`) },
      await shot(300, `${tag}-1.png`), await shot(310, `${tag}-2.png`), await shot(320, `${tag}-3.png`), await shot(330, `${tag}-4.png`)];
    roles = [{ i: 0, role: 'teacher' }, { i: 1, role: 'student' }, { i: 2, role: 'student' }, { i: 3, role: 'student' }];
    await putBundle(await bundle('A'));
    await page.waitForFunction(() => document.querySelector('#grSetup').textContent.includes('학생 3명'));
    assert(JSON.stringify((await chips()).map(x => x.replace(/ · \d+자$/, ''))) === JSON.stringify(['한꺼번에 넣은 정답·기준', 'A-1.png']), JSON.stringify(await chips()));
    await page.fill('#grTitle', 'A 평가'); await page.dispatchEvent('#grTitle', 'input');
    await gradeAll();
    await page.click('[data-gr="back"]').catch(() => {});
    const g0 = grades.length;
    await putBundle(await bundle('B'));
    await page.waitForFunction(() => document.querySelector('#grSetup').textContent.includes('학생 3명'));
    assert(JSON.stringify((await chips()).map(x => x.replace(/ · \d+자$/, ''))) === JSON.stringify(['한꺼번에 넣은 정답·기준', 'B-1.png']), JSON.stringify(await chips()));
    await page.fill('#grTitle', 'B 평가'); await page.dispatchEvent('#grTitle', 'input');
    await gradeAll();
    const g = grades[g0];
    assert(g && g.prompt.includes('1번 정답 999') && !g.prompt.includes('1번 정답 456') && g.images === 2, g ? `${g.images} ${g.prompt.slice(g.prompt.indexOf('[채점 기준]'), g.prompt.indexOf('[채점 기준]') + 200)}` : '요청 없음');
  }],
  // 1105 고침(gr-bundle-keyonly-wipe-2): 정답만 넣으면 새 채점이 아니라 [정답표 파일]처럼 지금 채점에 더함(스캔·학생은 그대로)
  ['[gr-bundle-oldkey] 끝난 기록에 정답만 넣으면 지금 채점에 더함(새 채점 아님)', async () => {
    await page.click('[data-gr="back"]').catch(() => {});
    const id = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:grs'))[0]);
    await putBundle([{ name: 'C평가 정답.txt', mimeType: 'text/plain', buffer: Buffer.from('C평가 정답\n1번 정답 777') }]);
    await page.waitForTimeout(1000);
    assert(JSON.stringify((await chips()).map(x => x.replace(/ · \d+자$/, ''))) === JSON.stringify(['한꺼번에 넣은 정답·기준', '한꺼번에 넣은 정답·기준', 'B-1.png']), JSON.stringify(await chips()));
    const after = await page.evaluate(id => JSON.parse(localStorage.getItem('ssam:gr:' + id)), id);
    assert(after && JSON.stringify(after.critDocs).includes('777') && JSON.stringify(after.critDocs).includes('999'), JSON.stringify(after && after.critDocs));
    assert(await page.$('[data-grhist][aria-current="true"]'), '새 채점이 됨');
  }],
  ['[gr-bundle-empty-toast] 읽지 못하는 파일만 → 「넣을 수 있는 파일이 없었어요 …」와 파일 이름, 정답 문서만 → 「정답·기준 문서를 넣었어요」', async () => {
    await fresh();
    await page.setInputFiles('#bundleFile-gr', [{ name: '수학 정답.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('PK\u0003\u0004 not really') }]);
    await until(async () => (await toastText()).includes('없었어요'), 6000);
    const m1 = await toastText();
    assert(m1.includes('넣을 수 있는 파일이 없었어요') && m1.includes('수학 정답.docx') && !m1.includes('을 넣었어요'), m1);
    assert((await chips()).length === 0, JSON.stringify(await chips()));
    await putBundle([{ name: '정답 문서.txt', mimeType: 'text/plain', buffer: Buffer.from('1번 정답 456\n2번 정답 곱셈') }]);
    await until(async () => (await toastText()).includes('넣었어요'), 6000);
    const m2 = await toastText();
    assert(m2.includes('정답·기준 문서를 넣었어요'), m2);
  }],
  ['[gr-setup-rerender-ime] 채점을 마친 뒤 기준 칸 가운데를 고치면 0.9초 뒤에도 같은 칸·커서 그대로, 이어 친 글이 그 자리에', async () => {
    await fresh();
    await upload([await shot(300), await shot(310), await shot(320)]);
    await openFold('gr-pages');
    if (await page.isChecked('#grByNo')) await page.uncheck('#grByNo');
    await page.fill('#grTitle', '곱셈'); await page.dispatchEvent('#grTitle', 'input');
    await page.fill('#grCrit', '1번 정답 456 / 2번 까닭'); await page.dispatchEvent('#grCrit', 'input');
    await gradeAll();
    await page.waitForTimeout(800);
    await page.evaluate(() => { const el = document.querySelector('#grCrit'); el.focus(); const i = el.value.indexOf('456') + 3; el.setSelectionRange(i, i); window.__el = el; });
    await page.keyboard.type(' 또는 사백오십육', { delay: 20 });
    await page.waitForTimeout(900);
    const a = await page.evaluate(() => { const el = document.querySelector('#grCrit'); return { same: el === window.__el, caret: el.selectionStart, at: el.value.indexOf('사백오십육') + 5 }; });
    assert(a.same && a.caret === a.at, JSON.stringify(a));
    await page.keyboard.type('원', { delay: 20 });
    assert(await page.inputValue('#grCrit') === '1번 정답 456 또는 사백오십육원 / 2번 까닭', await page.inputValue('#grCrit'));
    // 한글 조합 중에도 칸을 바꾸지 않음
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: '한', selectionStart: 1, selectionEnd: 1 });
    await page.dispatchEvent('#grCrit', 'input');
    await page.waitForTimeout(900);
    assert(await page.evaluate(() => document.querySelector('#grCrit') === window.__el), '조합 중 칸이 바뀜');
    await cdp.send('Input.insertText', { text: '' }).catch(() => {});
    await cdp.detach();
  }],
  ['[gr-setup-rerender-ime] 제목을 고치는 중에도 지난 채점 목록만 고친 제목으로 바뀜(제목 칸은 그대로)', async () => {
    await page.click('#grTitle');
    await page.keyboard.press('End');
    await page.evaluate(() => { window.__t = document.querySelector('#grTitle'); });
    await page.keyboard.type(' 2차시', { delay: 20 });
    await until(async () => (await page.textContent('#grSetup .gr-hist')).includes('곱셈 2차시'), 3000);
    assert(await page.evaluate(() => document.querySelector('#grTitle') === window.__t && document.activeElement === window.__t), '제목 칸이 바뀜');
  }],
  ['[gr-save-after-new] 평어를 복사하고 0.6초 안에 「새 채점」 → 빈 기록(null) 없음, 원래 기록에 사용함 표시가 저장됨', async () => {
    await page.click('#grResults [data-grcopy]');
    await page.waitForTimeout(100);
    await page.click('[data-gr="new"]');
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => ({ ids: JSON.parse(localStorage.getItem('ssam:grs') || '[]'), nul: localStorage.getItem('ssam:gr:null') }));
    assert(r.ids.length === 1 && r.ids[0] && r.nul === null, JSON.stringify(r));
    const g = await saved();
    assert(g.students[0].d === 1, JSON.stringify(g.students.map(s => s.d)));
    assert(!(await page.textContent('#grSetup')).includes('(제목 없음)'), '빈 기록이 목록에');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
