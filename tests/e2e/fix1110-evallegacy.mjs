// 평가 옛 화면(평가지 채점·창체·행특) 고침 (11월 10일)
// 지난 채점 기록의 예외 번호, 겹친 평어 다시 쓰기가 사용함 글을 바꿈, 창체 나이스 붙여넣기를 준비한 뒤 다시 쓴 글
// 글은 모두 지어낸 것
import { join } from 'node:path';
import { open, run, assert, mockClaude, FIXTURES } from './helpers.mjs';
import { zipStore } from '../../web/core/zip.js';

const t = await open();
const { page, url, errors } = t;
await t.ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
  // Windows 앱 흉내: 나이스 차례로 붙여넣기에 넘기는 글을 받아 두고, 앱이 보내는 알림(neis-paste)을 시험에서 보냄
  window.__inv = [];
  window.__TAURI__ = {
    core: { invoke: async (cmd, args) => { window.__inv.push({ cmd, args }); if (cmd === 'neis_arm') return { gen: window.__inv.filter(x => x.cmd === 'neis_arm').length, secs: 300 }; if (cmd === 'app_version') return '0.0.0'; if (cmd === 'check_update') return { available: false }; return null; } },
    event: { listen: async (name, cb) => { if (name === 'neis-paste') window.__neis = cb; return () => {}; } }
  };
});
// 평어 요청: 학생마다 몇 번째로 쓰는지 셈(write[no])
const write = {};
let dupFor = null; // { no, text }: 이 학생의 첫 평어로 이 글을 돌려줌
const DUP2 = '수의 크기를 비교하는 방법을 정확하게 알고 문제를 끝까지 풀어냄.';
const DUP1 = '수의 크기를 비교하는 방법을 정확하게 알고 문제를 스스로 해결함.';
let ccN = 0, ccImgs = 0;
const grades = [];
await mockClaude(page, ({ prompt, images }) => {
  if (prompt.startsWith('[문장 검토]')) return JSON.stringify({ items: [] });
  if (prompt.includes('수행평가를 채점하는')) { grades.push(prompt); return JSON.stringify({ score: 80, summary: '바르게 풀었음', evidence: ['풀이가 맞음'], strengths: '꼼꼼함', improve: '검산', unreadable: false }); }
  if (prompt.includes('채점 결과입니다')) return '[]';
  if (images && prompt.includes('창의적 체험활동 특기사항')) { ccImgs++; return JSON.stringify({ note: `학습지 ${ccImgs}: 교실 정리를 다짐함`, text: `교실을 깨끗하게 하려고 ${ccImgs}가지 방법을 스스로 정해 꾸준히 실천함.`, blank: false }); }
  if (prompt.includes('창의적 체험활동 특기사항')) {
    const n = +(prompt.match(/학생 (\d+)명에게/) || [])[1] || 1;
    ccN++;
    return Array.from({ length: n }, (_, j) => `${ccN}차 공통 활동에 즐겁게 참여하며 ${j + 1}번째로 친구를 돕는 태도를 보임.`).join('\n');
  }
  if (prompt.includes('교과학습발달상황')) {
    return JSON.stringify([...prompt.matchAll(/^- (\d+)번 \(/gm)].map(m => {
      const no = +m[1]; write[no] = (write[no] || 0) + 1;
      if (dupFor && dupFor.no === no && write[no] === 1) return { no, text: dupFor.text };
      return { no, text: `${no}번 학생은 덧셈 과정을 ${write[no]}번째로 차근차근 설명함.` };
    }));
  }
  return '[]';
});
const until = async (fn, ms = 20000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('시간 초과'); await new Promise(r => setTimeout(r, 80)); } };
const rows = () => page.$$eval('#grResults [data-grrow]', els => els.map(e => e.querySelector('.badge').textContent.trim() + (e.classList.contains('skip') ? 's' : '')));
const lastArm = () => page.evaluate(() => { const a = window.__inv.filter(x => x.cmd === 'neis_arm').pop(); return a ? a.args.texts : null; });
const rec = id => page.evaluate(id => JSON.parse(localStorage.getItem('ssam:gr:' + id)), id);
const goTab = async tab => { await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click(`#menuTabs [data-tab="${tab}"]`); };
// 지난 채점 기록 하나를 넣고 평가지 채점 탭을 엶
const seedGR = async (id, students, cls = { count: 4, except: [] }) => {
  await page.evaluate(({ id, students, cls }) => {
    for (const k of Object.keys(localStorage)) if (/^ssam:(gr:|grs$|grset$|class$|neis)/.test(k)) localStorage.removeItem(k);
    localStorage.setItem('ssam:class', JSON.stringify(cls));
    localStorage.setItem('ssam:grset', JSON.stringify({ maskOn: false, mask: [] }));
    localStorage.setItem('ssam:gr:' + id, JSON.stringify({ kind: 'gr', title: '곱셈 서술형', createdAt: 5, criteria: '', critDocs: [], settings: { byNo: false, maskOn: false, mask: [], ratio: { top: 10, high: 30, mid: 40, low: 20 } }, students }));
    localStorage.setItem('ssam:grs', JSON.stringify([id]));
  }, { id, students, cls });
  await page.goto(url, { timeout: 30000 }); await page.waitForTimeout(500);
  await goTab('gr');
  await page.waitForSelector(`[data-grhist="${id}"]`);
  await page.click(`[data-grhist="${id}"]`);
  await page.waitForSelector('[data-gr="copyAll"]');
};
const stu = (no, level, text, d = 0) => ({ id: 's' + no, no, n: 1, skip: 0, score: 90 - no, level, text, d });
// 한글(.hwpx) 정답표: 문단마다 한 줄
const NSP = 'http://www.hancom.co.kr/hwpml/2011/paragraph', NSS = 'http://www.hancom.co.kr/hwpml/2011/section';
const hwpx = (name, lines) => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(zipStore([{ name: 'mimetype', data: 'application/hwp+zip' }, { name: 'Contents/section0.xml', data: `<?xml version="1.0" encoding="UTF-8"?><hs:sec xmlns:hs="${NSS}" xmlns:hp="${NSP}">${lines.map(l => `<hp:p><hp:run><hp:t>${l}</hp:t></hp:run></hp:p>`).join('')}</hs:sec>` }])) });
// 행특: 5명 학생 칸(메모 없음)으로 다시 열고 행동특성 탭
const hkReset = async () => {
  await page.goto(url, { timeout: 30000 }); await page.waitForTimeout(600);
  await page.evaluate(async () => {
    (await import('./core/store.js')).freeze();
    localStorage.setItem('ssam:class', JSON.stringify({ count: 5, except: [] }));
    localStorage.setItem('ssam:hk', JSON.stringify({ settings: { unit: 'char', min: 300, max: 500, variants: 1, ending: 'eum', grade: 3 }, students: [1, 2, 3, 4, 5].map(no => ({ id: 'h' + no, no, label: '', memo: '', results: [], done: 0 })) }));
  });
  await page.goto(url, { timeout: 30000 }); await page.waitForTimeout(500);
  await goTab('hk');
  await page.waitForSelector('[data-hk="bulk"]');
};
const hkBulk = async (text, over = true) => {
  await page.click('[data-hk="bulk"]');
  await page.waitForSelector('#sheetRoot #hkBulkBox');
  await page.fill('#sheetRoot #hkBulkBox', text);
  if (!over) await page.uncheck('#sheetRoot #hkBulkOver');
  await page.click('#sheetRoot #hkBulkOk');
  await page.waitForTimeout(900);
};
const hkMemos = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:hk')).students.map(s => [s.no, s.memo]));

await page.goto(url); await page.waitForTimeout(400);

await run('fix1110-evallegacy', [
  // ---------- gr-hist-except ----------
  ['[gr-hist-except] 지난 채점 기록을 열고 예외 번호(2)를 넣어도 기록의 학생 번호는 그대로(스캔 차례로 다시 매기지 않음), 저장된 기록도 그대로', async () => {
    await seedGR('h1', [stu(1, 'high', '1번 평어로 곱셈을 바르게 함.'), stu(2, 'mid', '2번 평어로 곱셈을 대체로 함.'), stu(3, 'mid', '3번 평어로 곱셈 과정을 설명함.'), stu(4, 'low', '4번 평어로 곱셈을 도움받아 함.')]);
    assert(JSON.stringify(await rows()) === '["1","2","3","4"]', JSON.stringify(await rows()));
    await page.fill('#grExcept', '2'); await page.dispatchEvent('#grExcept', 'change');
    await page.waitForTimeout(900);
    const r = await rows();
    assert(JSON.stringify(r) === '["1","2","3","4"]', '번호가 바뀜 ' + JSON.stringify(r));
    const g = await rec('h1');
    const nos = g.students.map(s => `${s.no}:${s.text.slice(0, 2)}`).join(',');
    assert(nos === '1:1번,2:2번,3:3번,4:4번', '저장된 기록이 바뀜 ' + nos);
  }],
  ['[gr-hist-except] 그 뒤 [전체복사](Windows 앱): 예외 번호(나이스에 칸이 없음) 학생 글은 넣지 않아 3번 글이 3번 칸에', async () => {
    await page.click('[data-gr="copyAll"]');
    await page.waitForSelector('#neisPanel .neis-steps');
    await until(async () => !!(await lastArm()), 3000);
    const texts = await lastArm(), steps = (await page.textContent('#neisPanel .neis-steps')).replace(/\s+/g, ' ');
    await page.click('#neisPanel [data-neis="close"]');
    assert(JSON.stringify(texts) === JSON.stringify(['1번 평어로 곱셈을 바르게 함.', '3번 평어로 곱셈 과정을 설명함.', '4번 평어로 곱셈을 도움받아 함.']), JSON.stringify(texts));
    assert(steps.includes('1번부터 4번까지 3명'), steps);
  }],
  // ---------- gr-dedup-used ----------
  ['[gr-dedup-used] 한 학생 평어를 다시 썼는데 이미 복사해 쓴(사용함) 다른 학생 평어와 앞부분이 겹치면, 사용함 글은 그대로 두고 방금 쓴 학생만 다시 씀', async () => {
    await seedGR('h2', [stu(1, 'high', '1번 평어로 곱셈을 바르게 함.'), stu(2, 'high', DUP2, 1), stu(3, 'mid', '3번 평어로 곱셈 과정을 설명함.')], { count: 3, except: [] });
    for (const k of Object.keys(write)) delete write[k];
    dupFor = { no: 1, text: DUP1 };
    await page.click('[data-grre="s1"]');
    await until(async () => (write[1] || 0) >= 1 && !(await page.$('#grResults .chip.run')), 15000);
    await page.waitForTimeout(800);
    dupFor = null;
    const g = await rec('h2');
    const s2 = g.students.find(s => s.no === 2), s1 = g.students.find(s => s.no === 1);
    assert(s2.text === DUP2 && s2.d === 1, '사용함 글이 바뀜: ' + JSON.stringify(s2));
    assert(!write[2], '사용함 학생에게 다시 쓰기 요청을 보냄');
    assert(s1.text !== DUP1 && s1.text.startsWith('1번'), '겹친 평어를 다시 쓰지 않음: ' + s1.text);
  }],
  // ---------- cc-neis-stale ----------
  ['[cc-neis-stale] 창체 [전체복사](Windows 앱)로 준비한 뒤 한 학생을 다시 쓰면 준비를 풂, 예전 준비의 붙여넣기 알림이 와도 새 글을 「사용함」으로 표시하지 않음', async () => {
    await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (/^ssam:(cc|class|neis)/.test(k)) localStorage.removeItem(k);
      localStorage.setItem('ssam:class', JSON.stringify({ count: 2, except: [] }));
    });
    await page.goto(url, { timeout: 30000 }); await page.waitForTimeout(500);
    await goTab('cc');
    await page.waitForSelector('[data-ccf="name"][data-cck="auto"]');
    await page.fill('[data-ccf="name"][data-cck="auto"]', '교실 환경 지킴이');
    await page.click('[data-cc="genAll"]');
    await page.waitForFunction(() => document.querySelectorAll('#ccResults [data-cccopy]').length === 2, null, { timeout: 15000 });
    const before = await page.textContent('#ccResults [data-cccopy="1"]');
    await page.click('[data-cc="copyAll"]');
    await page.waitForSelector('#neisPanel .neis-steps');
    await until(async () => !!(await lastArm()), 3000);
    const armed = await lastArm();
    assert(armed[0] === before.trim(), '준비한 글: ' + JSON.stringify(armed));
    await page.click('[data-ccre="1"]');
    await until(async () => { const x = await page.textContent('#ccResults [data-cccopy="1"]').catch(() => ''); return x && x.trim() !== before.trim(); }, 15000);
    await page.waitForTimeout(300);
    const disarmed = await page.evaluate(() => window.__inv.some(x => x.cmd === 'neis_disarm'));
    const panel = await page.$('#neisPanel');
    // 예전 준비(gen 1)로 두 명을 넣었다는 알림
    await page.evaluate(() => { window.__neis({ payload: { gen: 1, state: 'start', total: 2 } }); window.__neis({ payload: { gen: 1, state: 'end', done: 2, reason: 'finished' } }); });
    await page.waitForTimeout(700);
    const used = await page.$$eval('#ccResults .cc-row', els => els.map(e => e.classList.contains('used')));
    assert(disarmed && !panel, '다시 쓴 뒤에도 예전 글로 준비가 남음');
    assert(!used[0], '다시 쓴 1번 글(나이스에 들어가지 않은 글)을 사용함으로 표시함');
  }],
  ['[cc-neis-stale] 동아리활동 [전체복사]로 준비한 뒤 동아리 이름을 고치면(나이스에는 예전 이름 글이 들어감) 넣었다는 알림이 와도 「사용함」으로 표시하지 않음', async () => {
    await page.click('[data-ccview="club"]');
    await page.fill('[data-ccf="club"]', '과학탐구반');
    await page.fill('[data-ccf="name"][data-cck="club"]', '물 로켓 만들기');
    await page.click('[data-cc="gen"]');
    await page.waitForFunction(() => document.querySelectorAll('#ccResults [data-cccopy]').length === 2, null, { timeout: 15000 });
    const n0 = await page.evaluate(() => window.__inv.filter(x => x.cmd === 'neis_arm').length);
    await page.click('[data-cc="copyAll"]');
    await until(async () => (await page.evaluate(() => window.__inv.filter(x => x.cmd === 'neis_arm').length)) > n0, 3000);
    await page.waitForSelector('#neisPanel .neis-steps');
    const armed = await lastArm(), gen = n0 + 1;
    assert(armed.every(x => x.startsWith('(과학탐구반) ')), JSON.stringify(armed));
    await page.fill('[data-ccf="club"]', '과학 탐구반');
    await page.evaluate(gen => { window.__neis({ payload: { gen, state: 'start', total: 2 } }); window.__neis({ payload: { gen, state: 'end', done: 2, reason: 'finished' } }); }, gen);
    await page.waitForTimeout(700);
    const used = await page.$$eval('#ccResults .cc-row', els => els.map(e => e.classList.contains('used')));
    await page.click('#neisPanel [data-neis="close"]').catch(() => {});
    assert(used.length === 2 && !used[0] && !used[1], '글이 바뀐 학생을 사용함으로 표시함 ' + JSON.stringify(used));
  }],
  // ---------- hk-bulk-cellbreak ----------
  ['[hk-bulk-cellbreak] 엑셀 메모 칸 안 줄바꿈(Alt+Enter, 「"…"」로 감싸 옴): 번호·메모 칸이면 그 학생 메모로 이어 붙이고 다음 학생에게 가지 않음', async () => {
    await hkReset();
    await hkBulk('1\t"성실함\n친구를 잘 도와줌"\r\n2\t차분함\r\n3\t"독서를 즐김, ""어린 왕자""를 좋아함"\r\n', false);
    const m = await hkMemos();
    assert(JSON.stringify(m.slice(0, 4)) === JSON.stringify([[1, '성실함, 친구를 잘 도와줌'], [2, '차분함'], [3, '독서를 즐김, "어린 왕자"를 좋아함'], [4, '']]), JSON.stringify(m));
  }],
  ['[hk-bulk-cellbreak] 번호 없이 메모 칸만 복사해도 줄바꿈 든 칸 뒤 학생이 한 명씩 밀리지 않음, 이름 칸도 그대로 뺌', async () => {
    await hkReset();
    await hkBulk('김민수\t"1인 1역 성실함\n발표 자신감이 자람"\r\n이서연\t친구를 잘 도와줌\r\n박지훈\t독서를 즐김\r\n');
    const m = await hkMemos();
    assert(JSON.stringify(m.slice(0, 4)) === JSON.stringify([[1, '1인 1역 성실함, 발표 자신감이 자람'], [2, '친구를 잘 도와줌'], [3, '독서를 즐김'], [4, '']]), JSON.stringify(m));
    assert(!JSON.stringify(m).includes('김민수'), '이름이 들어감');
  }],
  // ---------- cc-sheet-nomask ----------
  ['[cc-sheet-nomask] 창체 학습지 스캔을 넣고 이름 칸을 정하지 않은 채 [모든 영역 만들기]를 누르면 묻고, 학습지 그림을 AI로 보내지 않음', async () => {
    await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (/^ssam:(cc|class|neis)/.test(k)) localStorage.removeItem(k);
      localStorage.setItem('ssam:class', JSON.stringify({ count: 3, except: [] }));
    });
    await page.goto(url, { timeout: 30000 }); await page.waitForTimeout(500);
    await goTab('cc');
    await page.waitForSelector('[data-ccf="name"][data-cck="auto"]');
    await page.fill('[data-ccf="name"][data-cck="auto"]', '교실 환경 지킴이');
    await page.click('#ccGrade');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-ccsheet][data-cck="auto"]')]);
    await fc.setFiles([1, 2, 3].map(i => join(FIXTURES, `sheet-${i}.png`)));
    await page.waitForSelector('[data-ccsheetinfo]');
    const i0 = ccImgs;
    await page.click('[data-cc="genAll"]');
    await page.waitForSelector('#sheetRoot #ccNoMaskOk', { timeout: 3000 });
    assert((await page.textContent('#sheetRoot')).includes('학생 이름이 그대로 AI 회사로 보내져요'), await page.textContent('#sheetRoot'));
    await page.click('#sheetRoot [data-close]');
    await page.waitForTimeout(800);
    assert(ccImgs === i0, '묻는 동안·취소한 뒤 학습지 그림을 보냄 ' + (ccImgs - i0));
  }],
  ['[cc-sheet-nomask] [이름 칸 정하기] → 가릴 곳을 정하면 묻지 않고 만듦, 다른 학습지로 바꾸지 않는 한 [다시 쓰기]도 묻지 않음', async () => {
    await page.click('[data-cc="genAll"]');
    await page.waitForSelector('#sheetRoot #ccMaskGo');
    await page.click('#sheetRoot #ccMaskGo');
    await page.waitForSelector('#sheetRoot #mkStage');
    await page.waitForTimeout(200);
    const b = await page.locator('#sheetRoot #mkStage img').boundingBox();
    await page.mouse.move(b.x + b.width * 0.02, b.y + b.height * 0.02); await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.15, { steps: 4 }); await page.mouse.up();
    await page.click('#sheetRoot #mkOk');
    await page.waitForTimeout(300);
    const i0 = ccImgs;
    await page.click('[data-cc="genAll"]');
    await page.waitForFunction(() => document.querySelectorAll('#ccResults .gr-sum').length === 3, null, { timeout: 15000 });
    assert(!(await page.$('#sheetRoot #ccNoMaskOk')), '가릴 곳을 정했는데 물음');
    assert(ccImgs - i0 === 3, '학습지 그림 요청 ' + (ccImgs - i0));
  }],
  ['[cc-sheet-nomask] [가리지 않고 쓰기]를 고른 경우에만 가리지 않은 학습지를 보냄(그 학습지에서 한 번만 물음)', async () => {
    // 다른 활동(가릴 곳 없음)에 학습지를 넣음
    await page.click('[data-ccadd="auto"]');
    const id = await page.evaluate(() => document.activeElement.dataset.ccid);
    assert(id, '새 활동 칸 없음');
    await page.fill(`[data-ccf="name"][data-ccid="${id}"]`, '학급 회의');
    await page.click('#ccGrade');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`[data-ccsheet="${id}"]`)]);
    await fc.setFiles([1, 2, 3].map(i => join(FIXTURES, `sheet-${i}.png`)));
    await page.waitForTimeout(400);
    const i0 = ccImgs;
    await page.click('[data-cc="genAll"]');
    await page.waitForSelector('#sheetRoot #ccNoMaskOk');
    await page.click('#sheetRoot #ccNoMaskOk');
    await until(async () => ccImgs - i0 === 3 && !(await page.$('#ccView .spin')), 15000);
    const i1 = ccImgs;
    await page.click('[data-ccre="2"]');
    await page.waitForTimeout(300);
    assert(!(await page.$('#sheetRoot #ccNoMaskOk')), '한 번 고른 뒤 또 물음');
    await until(async () => ccImgs > i1 && !(await page.$('#ccView .spin')), 15000);
  }],
  // ---------- gr-critdoc-name ----------
  ['[gr-critdoc-name] [정답표 파일]로 넣은 한글 정답표(모범 답안)의 「이름: 김민수」는 가려서 저장하고 채점 요청에도 보내지 않음(정답 낱말은 그대로)', async () => {
    await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (/^ssam:(gr:|grs$|grset$|class$)/.test(k)) localStorage.removeItem(k);
      localStorage.setItem('ssam:class', JSON.stringify({ count: 1, except: [] }));
      localStorage.setItem('ssam:grset', JSON.stringify({ maskOn: false, mask: [] }));
    });
    await page.goto(url, { timeout: 30000 }); await page.waitForTimeout(500);
    await goTab('gr');
    await page.waitForSelector('#grDrop');
    const [fc0] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-gr="critImg"]')]);
    await fc0.setFiles([hwpx('모범답안.hwpx', ['사회 수행평가 모범 답안', '3학년 2반 5번 이름: 김민수', '1. 문화유산 이름: 석굴암', '2. 안중근'])]);
    await page.waitForSelector('#grCritBox [data-grcritview="0"]');
    await page.click('#grCritBox [data-grcritview="0"]');
    await page.waitForSelector('#sheetRoot #critDocText');
    const v = await page.inputValue('#sheetRoot #critDocText');
    await page.click('#sheetRoot [data-close]');
    assert(!v.includes('김민수') && v.includes('이름: ○○○') && v.includes('석굴암') && v.includes('안중근'), v);
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#grDrop')]);
    await fc.setFiles([join(FIXTURES, 'sheet-1.png')]);
    await page.waitForFunction(() => document.querySelector('#grSetup').textContent.includes('학생 1명'));
    await page.fill('#grTitle', '문화유산'); await page.dispatchEvent('#grTitle', 'input');
    const g0 = grades.length;
    await page.click('[data-gr="start"]');
    await until(async () => grades.length > g0, 15000);
    assert(!grades[g0].includes('김민수') && grades[g0].includes('석굴암'), '채점 요청에 이름: ' + grades[g0].slice(0, 300));
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
