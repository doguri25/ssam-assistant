// 평가 옛 화면(평가지 채점·행특) 2차 고침·기능 (11월 5일)
// 가릴 곳 없이 가리기가 켜져 있으면 채점 전에 물음, 한꺼번에 넣기에 정답만 넣으면 지금 채점에 더함(스캔·학생 그대로), 정답 글은 이름 칸만 가림,
// 다음 평가 묶음은 지난 기준 글·제목을 비움, 옛 기록의 겹친 번호, 행특 메모 한꺼번에 넣기의 이름 칸,
// 평가지 채점 탭의 AI 줄 하나(평어도 채점 AI로), 행특 특성 버튼 늘림
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
  if (!localStorage.getItem('ssam:class')) localStorage.setItem('ssam:class', JSON.stringify({ count: 4, except: [] }));
  // Windows 앱 흉내: 나이스 차례로 붙여넣기에 넘기는 글을 받아 둠
  window.__inv = [];
  window.__TAURI__ = {
    core: { invoke: async (cmd, args) => { window.__inv.push({ cmd, args }); if (cmd === 'neis_arm') return { gen: 1, secs: 300 }; if (cmd === 'app_version') return '0.0.0'; if (cmd === 'check_update') return { available: false }; return null; } },
    event: { listen: async () => () => {} }
  };
});
let roles = null, failAfter = 0;
const calls = [], grades = [];
const long = j => `학급 일에 책임감을 가지고 참여하며 ${j}번째로 친구를 돕는 모습이 돋보임. `.repeat(7).trim();
await mockClaude(page, ({ prompt, images, content, body }) => {
  calls.push({ model: body.model, prompt, images });
  if (prompt.startsWith('[쪽 나누기]')) return JSON.stringify({ pages: roles || [] });
  if (prompt.startsWith('[문장 검토]')) return JSON.stringify({ items: [] });
  if (prompt.includes('수행평가를 채점하는')) {
    grades.push({ prompt, images, model: body.model, b64: content.filter(x => x.type === 'image').map(x => x.source.data) });
    if (failAfter && grades.length > failAfter) return '읽지 못했어요';
    return JSON.stringify({ score: 80, summary: '바르게 풀었음', evidence: ['풀이가 맞음'], strengths: '꼼꼼함', improve: '검산', unreadable: false });
  }
  if (prompt.includes('채점 결과입니다')) return '[]';
  if (prompt.startsWith('아래 행동특성 및 종합의견을')) return long(9);
  if (prompt.includes('행동특성 및 종합의견을')) return [long(1), long(2)].join('\n');
  return JSON.stringify([...prompt.matchAll(/^- (\d+)번 \(/gm)].map(m => ({ no: +m[1], text: `${m[1]}번 학생 평어로 수를 바르게 계산함.` })));
});
const until = async (fn, ms = 20000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('시간 초과'); await new Promise(r => setTimeout(r, 80)); } };
const shot = async (w, name = `답안${w}.png`) => ({ name, mimeType: 'image/png', buffer: await page.screenshot({ clip: { x: 0, y: 0, width: w, height: 420 } }) });
// 「3학년 2반 5번 이름: 김민수」가 위쪽에 적힌 평가지 사진
const named = async (name = 'kim.png') => {
  const pg = await t.ctx.newPage();
  await pg.setContent('<div style="width:600px;height:400px;background:#fff;font:28px sans-serif;padding:20px;box-sizing:border-box">3학년 2반 5번 이름: 김민수<br><br><br><br>1. 23 x 4 = 92</div>');
  const buffer = await pg.screenshot({ clip: { x: 0, y: 0, width: 600, height: 400 } }); await pg.close();
  return { name, mimeType: 'image/png', buffer };
};
// 보낸 그림 위쪽 20%의 검은 점 수(이름 글자가 보이면 많음)
const darkTop = b64 => page.evaluate(async b64 => {
  const bmp = await createImageBitmap(await (await fetch('data:image/jpeg;base64,' + b64)).blob());
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, c.width, Math.round(c.height * 0.2)).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 100) n++; return n;
}, b64);
const lastArm = () => page.evaluate(() => { const a = window.__inv.filter(x => x.cmd === 'neis_arm').pop(); return a ? a.args.texts : null; });
const saved = () => page.evaluate(() => { const ids = JSON.parse(localStorage.getItem('ssam:grs') || '[]'); return ids.length ? JSON.parse(localStorage.getItem('ssam:gr:' + ids[0])) : null; });
const rows = () => page.$$eval('#grResults [data-grrow]', els => els.map(e => e.querySelector('.badge').textContent.trim() + (e.classList.contains('skip') ? 's' : '')));
const chips = () => page.$$eval('#grCritBox .chip', els => els.map(e => e.textContent.trim().replace(/ · [\d,]+자$/, '')));
const toastText = () => page.evaluate(() => (document.querySelector('#toast') || {}).textContent || '');
const sheetText = () => page.evaluate(() => (document.querySelector('#sheetRoot') || {}).textContent || '');
// grset: 평가지 채점 설정(null이면 처음 쓰는 선생님 — 가리기 켜짐·가릴 곳 없음)
const fresh = async (grset = { maskOn: false, mask: [] }) => {
  await page.evaluate(g => {
    for (const k of Object.keys(localStorage)) if (/^ssam:(gr:|grs$|grset$)/.test(k)) localStorage.removeItem(k);
    if (g) localStorage.setItem('ssam:grset', JSON.stringify(g));
  }, grset);
  await page.goto(url, { timeout: 30000 }); await page.waitForTimeout(500);
  await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="gr"]');
  await page.waitForSelector('#grDrop');
};
const upload = async files => {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#grDrop')]);
  await fc.setFiles(files);
  await page.waitForFunction(n => document.querySelector('#grSetup').textContent.includes(`학생 ${n}명`), files.length);
};
const title = async v => { await page.fill('#grTitle', v); await page.dispatchEvent('#grTitle', 'input'); };
const gradeAll = async () => {
  await page.click('[data-gr="start"]');
  await page.waitForSelector('[data-gr="copyAll"]:not([disabled])', { timeout: 20000 });
  await page.waitForTimeout(300);
};
const putBundle = async (files, card = true) => {
  await page.setInputFiles('#bundleFile-gr', files);
  if (card) { await page.waitForSelector('#sheetRoot #bundleOk', { timeout: 15000 }); await page.click('#sheetRoot #bundleOk'); }
};
const critText = async (i = 0) => {
  await page.click(`#grCritBox [data-grcritview="${i}"]`);
  await page.waitForSelector('#sheetRoot #critDocText');
  const v = await page.inputValue('#sheetRoot #critDocText');
  await page.click('#sheetRoot [data-close]').catch(() => page.mouse.click(5, 5));
  await page.waitForTimeout(150);
  return v;
};
const drawBox = async (x0, y0, x1, y1) => {
  const b = await page.locator('#sheetRoot #mkStage img').boundingBox();
  await page.mouse.move(b.x + b.width * x0, b.y + b.height * y0); await page.mouse.down();
  await page.mouse.move(b.x + b.width * x1, b.y + b.height * y1, { steps: 4 }); await page.mouse.up();
};
const txt = (name, body) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(body) });
const startLabel = () => page.evaluate(() => { const b = document.querySelector('[data-gr="start"]'); return b ? b.textContent.trim() : ''; });

await page.goto(url); await page.waitForTimeout(400);

await run('fix1105-evallegacy', [
  // ---------- gr-nomask-1 ----------
  ['[gr-nomask-1] 처음 쓰는 선생님(가리기 켜짐·가릴 곳 없음): 설정 칸에 경고, [채점하고 평어 쓰기]를 누르면 묻고 AI로 보내지 않음', async () => {
    await fresh(null);
    await upload([await named()]);
    assert(await page.isChecked('#grMaskOn'), '가리기 꺼짐');
    assert((await page.textContent('#grSetup')).includes('정하지 않으면 학생 이름이 그대로 AI 회사로 보내져요'), '경고 없음');
    await title('곱셈');
    const g0 = grades.length;
    await page.click('[data-gr="start"]');
    await page.waitForSelector('#sheetRoot #grNoMaskOk', { timeout: 3000 });
    assert((await sheetText()).includes('이름 칸을 아직 정하지 않았어요'), await sheetText());
    await page.waitForTimeout(800);
    assert(grades.length === g0, '물어보는 동안 보냄');
    await page.click('#sheetRoot [data-close]');
    await page.waitForTimeout(500);
    assert(grades.length === g0, '취소했는데 보냄');
  }],
  ['[gr-nomask-1] [이름 칸 정하기] → 이름 칸 상자 → 채점하면 묻지 않고 이름 자리를 가린 그림만 보냄', async () => {
    await page.click('[data-gr="start"]');
    await page.waitForSelector('#sheetRoot #grMaskGo');
    await page.click('#sheetRoot #grMaskGo');
    await page.waitForSelector('#sheetRoot #mkStage');
    await page.waitForTimeout(200);
    await drawBox(0.01, 0.01, 0.99, 0.25);
    await page.click('#sheetRoot #mkOk');
    await page.waitForTimeout(300);
    const g0 = grades.length;
    await gradeAll();
    assert(grades.length === g0 + 1, '채점 요청 ' + (grades.length - g0));
    const g = grades[g0];
    const dark = await darkTop(g.b64[g.b64.length - 1]);
    assert(dark < 50, '이름 자리 검은 점 ' + dark);
  }],
  ['[gr-nomask-1] [가리지 않고 채점]을 고른 경우에만 그대로 보냄(이번 채점에서 한 번만 물음 — 다시 채점은 묻지 않음)', async () => {
    await fresh(null);
    await upload([await named()]);
    await title('곱셈');
    const g0 = grades.length;
    await page.click('[data-gr="start"]');
    await page.waitForSelector('#sheetRoot #grNoMaskOk');
    await page.click('#sheetRoot #grNoMaskOk');
    await page.waitForSelector('[data-gr="copyAll"]:not([disabled])', { timeout: 20000 });
    assert(grades.length === g0 + 1, '채점 요청 ' + (grades.length - g0));
    assert(await darkTop(grades[g0].b64[0]) > 50, '가려짐');
    await page.evaluate(() => document.querySelector('#grView').classList.add('show-pane'));
    await page.click('#grResults [data-grregrade]');
    await until(async () => grades.length === g0 + 2, 5000);
    assert(!(await sheetText()).includes('이름 칸을 아직'), '다시 물음');
  }],
  ['[gr-nomask-1] 채점을 마친 뒤 가리기를 켜고(가릴 곳 없음) [다시 채점]을 누르면 묻고 보내지 않음', async () => {
    await fresh();
    await upload([await named()]);
    await title('곱셈');
    await gradeAll();
    await page.click('[data-gr="back"]').catch(() => {});
    await page.check('#grMaskOn');
    await page.evaluate(() => document.querySelector('#grView').classList.add('show-pane'));
    const g0 = grades.length;
    await page.click('#grResults [data-grregrade]');
    await page.waitForSelector('#sheetRoot #grNoMaskOk', { timeout: 3000 });
    await page.waitForTimeout(600);
    assert(grades.length === g0, '물어보는 동안 보냄');
    await page.click('#sheetRoot #grNoMaskOk');
    await until(async () => grades.length === g0 + 1, 5000);
  }],
  // ---------- gr-bundle-keyonly-wipe-2 ----------
  ['[gr-bundle-keyonly-wipe-2] 채점 중 오류로 멈춘 뒤 정답표만 한꺼번에 넣으면 스캔·학생·채점 결과는 그대로, 정답표만 더함', async () => {
    await fresh();
    await upload([await shot(300), await shot(310), await shot(320)]);
    await title('곱셈');
    failAfter = grades.length + 1;
    await page.click('[data-gr="start"]');
    await until(async () => (await startLabel()).includes('이어서 하기'));
    failAfter = 0;
    await page.click('[data-gr="back"]').catch(() => {});
    await putBundle([txt('곱셈 정답.txt', '곱셈 평가 정답\n1번 정답 92\n2번 정답 128')]);
    await page.waitForTimeout(600);
    const setup = await page.textContent('#grSetup');
    assert(setup.includes('학생 3명') && (await page.textContent('#grDrop')).includes('3쪽을 올렸어요'), setup.slice(0, 200));
    assert((await startLabel()).includes('이어서 하기'), await startLabel());
    assert((await rows()).length === 3, JSON.stringify(await rows()));
    assert(JSON.stringify(await chips()) === JSON.stringify(['한꺼번에 넣은 정답·기준']), JSON.stringify(await chips()));
    const m = await toastText();
    assert(m.includes('정답·기준 문서') && m.includes('다시 채점'), m);
    // 이어서 하면 남은 학생만 새 정답과 함께 채점
    const g0 = grades.length;
    await gradeAll();
    assert(grades.length === g0 + 2 && grades.slice(g0).every(g => g.prompt.includes('1번 정답 92')), `${grades.length - g0}`);
  }],
  ['[gr-bundle-keyonly-wipe-2] 다 끝난 채점에 정답표만 넣어도 [정답표 파일]처럼 지금 채점에 더함(새 채점 아님, 기록에 저장)', async () => {
    await page.click('[data-gr="back"]').catch(() => {});
    const id = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:grs'))[0]);
    await putBundle([txt('추가 기준.txt', '정답\n3번 정답 777')]);
    await page.waitForTimeout(1200);
    assert(JSON.stringify(await chips()) === JSON.stringify(['한꺼번에 넣은 정답·기준', '한꺼번에 넣은 정답·기준']), JSON.stringify(await chips()));
    assert((await page.textContent('#grDrop')).includes('3쪽을 올렸어요'), '스캔이 사라짐');
    assert(await page.$('[data-grhist][aria-current="true"]'), '새 채점이 됨');
    const after = await page.evaluate(id => JSON.parse(localStorage.getItem('ssam:gr:' + id)), id);
    assert(after && JSON.stringify(after.critDocs).includes('777') && after.students.filter(s => s.text).length === 3, JSON.stringify(after && after.critDocs));
  }],
  // ---------- gr-bundle-strip-key-3 ----------
  ['[gr-bundle-strip-key-3] 인물 이름·큰 수 정답을 한꺼번에 넣어도 정답표 글과 채점 요청 [채점 기준]에 그대로', async () => {
    await fresh();
    const key = '6학년 사회 2단원 평가 정답\n1. 안중근\n2. 윤봉길\n3. 유관순\n4. 3000 4000 5000\n5. 오각형';
    await putBundle([txt('사회 정답.txt', key), await shot(300, 's-1.png'), await shot(310, 's-2.png')]);
    await page.waitForFunction(() => document.querySelector('#grSetup').textContent.includes('학생 2명'));
    const text = await critText(0);
    assert(text === key, text);
    await title('사회');
    const g0 = grades.length;
    await gradeAll();
    const p = grades[g0].prompt, crit = p.slice(p.indexOf('[채점 기준]'), p.indexOf('[할 일]'));
    assert(['1. 안중근', '2. 윤봉길', '3. 유관순', '4. 3000 4000 5000', '5. 오각형'].every(x => crit.includes(x)) && !crit.includes('○○○'), crit);
  }],
  // ---------- gr-bundle-oldcrit-5 ----------
  ['[gr-bundle-oldcrit-5] A 채점(기준 칸에 직접 쓴 정답) 뒤 B 정답+스캔을 한꺼번에 넣으면 기준 칸·제목이 비고 B 요청에 A 기준 없음', async () => {
    await fresh();
    await upload([await shot(300), await shot(310)]);
    await title('A 곱셈');
    await page.fill('#grCrit', 'A평가 1번 정답 456'); await page.dispatchEvent('#grCrit', 'input');
    await gradeAll();
    await page.click('[data-gr="back"]').catch(() => {});
    await putBundle([txt('B평가 정답.txt', 'B평가 정답\n1번 정답 999'), await shot(330, 'b-1.png'), await shot(340, 'b-2.png')]);
    await page.waitForFunction(() => document.querySelector('#grSetup').textContent.includes('학생 2명'));
    assert(await page.inputValue('#grCrit') === '' && await page.inputValue('#grTitle') === '', `${await page.inputValue('#grCrit')} / ${await page.inputValue('#grTitle')}`);
    await title('B 나눗셈');
    const g0 = grades.length;
    await gradeAll();
    const p = grades[g0].prompt;
    assert(p.includes('1번 정답 999') && !p.includes('456') && !p.includes('A 곱셈'), p.slice(p.indexOf('[평가 정보]'), p.indexOf('[할 일]')));
  }],
  ['[gr-bundle-oldcrit-5] 학생 스캔만 한꺼번에 넣으면(정답 없음) 지난 기준 칸 글은 그대로(같은 평가를 다른 반에 쓸 때)', async () => {
    await page.click('[data-gr="back"]').catch(() => {});
    await page.fill('#grCrit', 'B평가 2번 까닭'); await page.dispatchEvent('#grCrit', 'input');
    await page.waitForTimeout(800);
    await putBundle([await shot(350, 'c-1.png'), await shot(360, 'c-2.png')], false);
    await page.waitForFunction(() => document.querySelector('#grDrop').textContent.includes('2쪽을 올렸어요') && !document.querySelector('[data-grhist][aria-current="true"]'));
    assert(await page.inputValue('#grCrit') === 'B평가 2번 까닭', await page.inputValue('#grCrit'));
  }],
  // ---------- gr-oldrec-dup-7 ----------
  ['[gr-oldrec-dup-7] 0.18.3 전 기록(채점에서 뺀 쪽이 1번을 그대로 가짐)을 열면 뺀 쪽은 번호 없음, 나이스 글은 [1번, 2번]', async () => {
    await fresh();
    await page.evaluate(() => {
      localStorage.setItem('ssam:gr:old1', JSON.stringify({ kind: 'gr', title: '옛 기록', createdAt: 1, criteria: '', critDocs: [], settings: { byNo: true, maskOn: false, mask: [], ratio: { top: 10, high: 30, mid: 40, low: 20 } },
        students: [{ id: 'a', no: 1, n: 1, skip: 0, score: 80, level: 'high', text: '1번 학생 평어.' }, { id: 'b', no: 2, n: 1, skip: 0, score: 70, level: 'mid', text: '2번 학생 평어.' }, { id: 'c', no: 1, n: 1, skip: 1, score: null, level: null, text: '' }] }));
      localStorage.setItem('ssam:grs', JSON.stringify(['old1']));
    });
    await page.goto(url, { timeout: 30000 }); await page.waitForTimeout(500);
    await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="gr"]');
    await page.waitForSelector('[data-grhist="old1"]');
    await page.click('[data-grhist="old1"]');
    await page.waitForSelector('[data-gr="copyAll"]');
    const r = await rows();
    assert(JSON.stringify(r) === JSON.stringify(['1', '2', '-s']), JSON.stringify(r));
    await page.click('[data-gr="copyAll"]');
    await page.waitForSelector('#neisPanel .neis-steps');
    await until(async () => !!(await lastArm()), 3000);
    const texts = await lastArm(), steps = (await page.textContent('#neisPanel .neis-steps')).replace(/\s+/g, ' ');
    await page.click('#neisPanel [data-neis="close"]');
    assert(JSON.stringify(texts) === JSON.stringify(['1번 학생 평어.', '2번 학생 평어.']), JSON.stringify(texts));
    assert(steps.includes('1번부터 2번까지 2명'), steps);
    await until(async () => { const g = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:gr:old1'))); return g.students.find(s => s.id === 'c').no === 0; }, 3000);
  }],
  // ---------- hk-bulk-name-4 ----------
  ['[hk-bulk-name-4] 엑셀 번호·이름·메모 칸을 붙여넣으면 이름 칸은 빼고 메모만 넣고 알림, 만들 때 AI로 이름이 가지 않음', async () => {
    await page.evaluate(() => localStorage.removeItem('ssam:hk'));
    await page.goto(url, { timeout: 30000 }); await page.waitForTimeout(500);
    await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="hk"]');
    await page.waitForSelector('[data-hk="bulk"]');
    await page.click('[data-hk="bulk"]');
    await page.waitForSelector('#sheetRoot #hkBulkBox');
    await page.fill('#sheetRoot #hkBulkBox', '번호\t이름\t메모\n1\t김민수\t1인 1역 성실함, 친구를 잘 도와줌\n2\t이서연\t독서를 즐김, 질문을 많이 함');
    await page.click('#sheetRoot #hkBulkOk');
    await page.waitForTimeout(700);
    const m = await toastText();
    assert(m.includes('2명') && m.includes('이름'), m);
    const hk = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:hk')));
    const memos = hk.students.filter(s => s.memo).map(s => [s.no, s.memo]);
    assert(JSON.stringify(memos) === JSON.stringify([[1, '1인 1역 성실함, 친구를 잘 도와줌'], [2, '독서를 즐김, 질문을 많이 함']]), JSON.stringify(memos));
    // 예전에 이름 칸까지 들어간 메모(3번)도 AI로는 이름을 빼고 보냄
    await page.evaluate(() => { const h = JSON.parse(localStorage.getItem('ssam:hk')); h.students.find(s => s.no === 3).memo = '최하은\t정리정돈 잘함'; localStorage.setItem('ssam:hk', JSON.stringify(h)); });
    await page.goto(url, { timeout: 30000 }); await page.waitForTimeout(500);
    await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="hk"]');
    await page.waitForSelector('[data-hk="all"]:not([disabled])');
    const c0 = calls.length;
    await page.click('[data-hk="all"]');
    await until(async () => calls.slice(c0).filter(c => c.prompt.includes('행동특성 및 종합의견을')).length >= 3, 15000);
    const sent = calls.slice(c0).map(c => c.prompt).join('\n');
    assert(['김민수', '이서연', '최하은'].every(n => !sent.includes(n)) && sent.includes('정리정돈 잘함'), sent.slice(0, 300));
  }],
  // ---------- 기능 요청 1: 평가지 채점 탭의 AI 하나 ----------
  ['[기능-AI하나] 평가지 채점 탭의 AI 줄은 하나(채점), 채점에 Opus를 고르면 평어 쓰기도 Opus(글쓰기 원칙 그대로), 평어 검토도 채점 검토 AI', async () => {
    await page.evaluate(() => localStorage.setItem('ssam:ai-roles', JSON.stringify({ review: null, tasks: { grade: { main: { engine: 'claude', model: 'claude-opus-5-5' }, reviewOn: true, review: { engine: 'claude', model: 'claude-haiku-5-5' } }, writing: { main: null, reviewOn: false, review: null } } })));
    await fresh();
    await page.waitForSelector('#grSetup [data-ai-row] .ai-row-t');
    const r = await page.$$eval('#grSetup [data-ai-row]', els => els.map(e => [e.dataset.aiRow, e.textContent.trim()]));
    assert(r.length === 1 && r[0][0] === 'grade' && r[0][1].startsWith('AI: Claude Opus 5.5 · 검토: Claude Haiku 5.5'), JSON.stringify(r));
    await upload([await shot(300), await shot(310)]);
    await title('곱셈');
    const c0 = calls.length;
    await gradeAll();
    await until(async () => calls.slice(c0).some(c => c.prompt.startsWith('[문장 검토]')), 8000);
    const mine = calls.slice(c0);
    const writes = mine.filter(c => c.prompt.includes("'교과학습발달상황' 평어"));
    assert(writes.length && writes.every(c => c.model === 'claude-opus-5-5' && c.prompt.includes('[글쓰기 원칙]')), JSON.stringify(writes.map(c => c.model)));
    const rv = mine.filter(c => c.prompt.startsWith('[문장 검토]'));
    assert(rv.length && rv.every(c => c.model === 'claude-haiku-5-5' && c.prompt.includes('수행평가 교과 평어')), JSON.stringify(rv.map(c => c.model)));
    assert(mine.filter(c => c.prompt.includes('수행평가를 채점하는') && !c.prompt.startsWith('[')).every(c => ['claude-opus-5-5', 'claude-haiku-5-5'].includes(c.model)), '채점 모델');
  }],
  ['[기능-AI하나] 교과 평어·행특은 그대로 평어(writing) AI: 채점에 Opus를 골라도 행특은 기본 AI(Sonnet), 평어 검토가 켜져도 평가지 채점 평어는 채점 검토를 따름', async () => {
    await page.evaluate(() => localStorage.setItem('ssam:ai-roles', JSON.stringify({ review: null, tasks: { grade: { main: { engine: 'claude', model: 'claude-opus-5-5' }, reviewOn: false, review: null }, writing: { main: null, reviewOn: true, review: { engine: 'claude', model: 'claude-haiku-5-5' } } } })));
    await fresh();
    await upload([await shot(300)]);
    await title('곱셈');
    const c0 = calls.length;
    await gradeAll();
    await page.waitForTimeout(800);
    assert(!calls.slice(c0).some(c => c.prompt.startsWith('[문장 검토]')), '채점 검토를 껐는데 평어 검토');
    await page.click('#menuTabs [data-tab="hk"]');
    await page.waitForSelector('[data-hkstu]');
    await page.click('[data-hkstu]');
    await page.waitForSelector('[data-hk="gen"]');
    const c1 = calls.length;
    await page.click('[data-hk="gen"]');
    await until(async () => calls.slice(c1).some(c => c.prompt.includes('행동특성 및 종합의견을')), 8000);
    const hk = calls.slice(c1).filter(c => c.prompt.includes('행동특성 및 종합의견을'));
    assert(hk.every(c => c.model === 'claude-sonnet-5-5'), JSON.stringify(hk.map(c => c.model)));
    await page.evaluate(() => localStorage.removeItem('ssam:ai-roles'));
  }],
  // ---------- 기능 요청 2: 행특 특성 버튼 ----------
  ['[기능-특성] 행특 특성 버튼이 44개 넘게(생활·학습·관계·특기·성장 중 묶음), 예전 버튼도 그대로, 새 버튼을 누르면 메모 끝에 들어감', async () => {
    await page.goto(url, { timeout: 30000 }); await page.waitForTimeout(500);
    await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="hk"]');
    await page.waitForSelector('[data-hkstu]');
    await page.click('[data-hkstu]');
    await page.waitForSelector('#hkEditor [data-kw]');
    const kws = await page.$$eval('#hkEditor [data-kw]', els => els.map(e => e.dataset.kw));
    assert(kws.length >= 44 && new Set(kws).size === kws.length, `${kws.length}개 · 겹침 ${kws.length - new Set(kws).size}`);
    assert(['성실함', '차분함', '유머 감각', '집중하는 시간이 늘어남', '감정 조절 노력 중', '예의 바름', '공감 능력', '자기주도적 학습', '바른 말 쓰기 노력 중'].every(k => kws.includes(k)), JSON.stringify(kws));
    const groups = await page.$$eval('#hkEditor [data-kwg]', els => els.map(e => e.dataset.kwg));
    assert(JSON.stringify(groups) === JSON.stringify(['생활', '학습', '관계', '특기', '성장 중']), JSON.stringify(groups));
    const before = await page.inputValue('#hkMemo');
    await page.click('#hkEditor [data-kw="예의 바름"]');
    await page.waitForTimeout(200);
    const after = await page.inputValue('#hkMemo');
    assert(after === (before.trim() ? before.trim().replace(/[,，\s]*$/, '') + ', 예의 바름' : '예의 바름'), after);
    // 화면 정리: 묶음마다 접혀 있어(처음엔 생활만 펼침) 관계 묶음을 펼친 뒤 누름
    await page.click('#hkEditor details[data-kwg="관계"] > summary');
    await page.click('#hkEditor [data-kw="새 친구와 잘 어울림"]');
    await page.waitForTimeout(700);
    const hk = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:hk')));
    assert(hk.students.some(s => s.memo.endsWith('예의 바름, 새 친구와 잘 어울림')), JSON.stringify(hk.students.map(s => s.memo)));
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
