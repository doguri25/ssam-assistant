// 떠 있는 버튼(웹판): 파일 고르기·끌어 놓기 판, 확인 카드, 종류 바꾸기, 입력 칸, 바로 실행, 줄 세우기, 못 읽는 파일, 다른 끌어 놓기 칸과 겹치지 않음, 설정
import { join } from 'node:path';
import { open, run, assert, FIXTURES } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
await page.goto(url);
await page.waitForTimeout(400);
// 시험용 처리 함수: 실제 메뉴 대신 부른 기록만 남김
const stub = () => page.evaluate(async () => {
  const m = await import('./core/inbox.js');
  window.__ran = [];
  const rec = kind => async (files, values) => { window.__ran.push([kind, files.map(f => f.name), values]); return `${kind} 했어요(시험)`; };
  m.registerInbox('roster', { act: () => '시험: 명단 넣기', run: rec('roster') });
  m.registerInbox('year-plan', { act: () => '시험: 연간계획', fields: () => [{ key: 'name', label: '업무명', type: 'text', required: true }], run: rec('year-plan') });
});
await stub();
const ran = () => page.evaluate(() => window.__ran);
const pick = async files => page.setInputFiles('#inboxFile', files);
const memo = { name: '메모.txt', mimeType: 'text/plain', buffer: Buffer.from('안녕하세요. 오늘 회의는 3시입니다.') };
const sheet = '#sheetRoot .sheet';

await run('inbox', [
  ['버튼이 보이고, 파일을 고르면 확인 카드: 판단한 종류·까닭·할 일 → [실행]이 처리 함수를 부름', async () => {
    assert(await page.isVisible('#inboxFab'), '버튼');
    await pick(join(FIXTURES, 'roster-sample.csv'));
    await page.waitForSelector(`${sheet} #ibRun`);
    const txt = await page.textContent(sheet);
    assert(txt.includes('학급 명단') && txt.includes('번호·성명') && txt.includes('시험: 명단 넣기'), txt);
    await page.click(`${sheet} #ibRun`);
    await page.waitForFunction(() => window.__ran.length === 1);
    assert((await ran())[0][0] === 'roster' && (await page.textContent('#toast')).includes('roster 했어요'), JSON.stringify(await ran()));
  }],
  ['[다른 것으로] 종류를 바꾸면 그 입력 칸, 필수 칸이 비면 실행 안 됨', async () => {
    await pick(join(FIXTURES, 'roster-sample.csv'));
    await page.waitForSelector(`${sheet} #ibKind`);
    await page.selectOption(`${sheet} #ibKind`, 'year-plan');
    await page.waitForSelector(`${sheet} [data-ib-field="name"]`);
    await page.click(`${sheet} #ibRun`);
    await page.waitForTimeout(150);
    assert((await ran()).length === 1 && await page.isVisible(`${sheet} [role="alert"]`), '빈 칸으로 실행됨');
    await page.fill(`${sheet} [data-ib-field="name"]`, '독서교육');
    await page.click(`${sheet} #ibRun`);
    await page.waitForFunction(() => window.__ran.length === 2);
    const r = (await ran())[1];
    assert(r[0] === 'year-plan' && r[2].name === '독서교육', JSON.stringify(r));
  }],
  ['모르는 파일은 할 일을 고르기 전에 [실행]을 못 누름', async () => {
    await pick(memo);
    await page.waitForSelector(`${sheet} #ibRun`);
    assert((await page.textContent(sheet)).includes('알아보지 못했어요') && await page.isDisabled(`${sheet} #ibRun`), '모름');
    await page.selectOption(`${sheet} #ibKind`, 'roster');
    assert(!(await page.isDisabled(`${sheet} #ibRun`)), '고른 뒤');
    await page.click(`${sheet} [data-close]`);
    await page.waitForTimeout(100);
    assert((await ran()).length === 2, '그만두기인데 실행');
  }],
  ['못 읽는 파일(.docx)은 까닭만 보이고 아무것도 하지 않음', async () => {
    await pick({ name: '보고서.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
    await page.waitForSelector(sheet);
    const txt = await page.textContent(sheet);
    assert(txt.includes('보고서.docx') && await page.locator(`${sheet} #ibRun`).count() === 0, txt);
    await page.click(`${sheet} [data-close]`);
    assert((await ran()).length === 2, '실행됨');
  }],
  ['카드가 떠 있는 동안 또 넣으면 앞 것이 끝난 뒤 다음 카드', async () => {
    await pick(join(FIXTURES, 'roster-sample.csv'));
    await page.waitForSelector(`${sheet} #ibRun`);
    await pick(memo);
    await page.waitForTimeout(200);
    assert((await page.textContent(sheet)).includes('roster-sample.csv'), '앞 카드가 바뀜');
    await page.click(`${sheet} #ibRun`);
    await page.waitForFunction(() => document.querySelector('#sheetRoot .sheet')?.textContent.includes('메모.txt'));
    await page.click(`${sheet} [data-close]`);
    assert((await ran()).length === 3, JSON.stringify(await ran()));
  }],
  ['설정 «바로 실행»이면 카드 없이, 다만 필수 값이 있으면 카드', async () => {
    await page.evaluate(async () => (await import('./core/inbox.js')).setInboxSettings({ mode: 'direct' }));
    await pick(join(FIXTURES, 'roster-sample.csv'));
    await page.waitForFunction(() => window.__ran.length === 4);
    assert(await page.locator(sheet).count() === 0, '카드가 뜸');
    await pick({ name: '독서.txt', mimeType: 'text/plain', buffer: Buffer.from('2026학년도 독서교육 운영 계획\nⅠ. 목적\nⅡ. 방침\nⅢ. 세부 추진 계획') });
    await page.waitForSelector(`${sheet} [data-ib-field="name"]`);
    await page.click(`${sheet} [data-close]`);
    await page.evaluate(async () => (await import('./core/inbox.js')).setInboxSettings({ mode: 'confirm' }));
  }],
  ['끌어 오면 놓기 판이 뜨고, 판에 놓으면 받음(창체 모드가 문서 전체 놓기를 막아도)', async () => {
    await page.evaluate(() => window.SSAM.setMode('cc'));
    await page.click('nav.app-side [data-menu-go="class"]');
    const dt = await page.evaluateHandle(() => { const d = new DataTransfer(); d.items.add(new File(['번호,성명\n1,가\n2,나'], '명단.csv', { type: 'text/csv' })); return d; });
    await page.dispatchEvent('body', 'dragenter', { dataTransfer: dt });
    await page.waitForSelector('#inboxPad:not([hidden])');
    // 판에 온 끌기는 판이 받고(놓기 허용) 문서 전체 처리(창체의 놓기 막기 등)로 퍼지지 않음
    const seen = await page.evaluate(() => {
      let doc = 0; const spy = () => { doc++; }; document.addEventListener('dragover', spy);
      const d = new DataTransfer(); d.items.add(new File(['x'], 'a.csv'));
      const e = new DragEvent('dragover', { dataTransfer: d, bubbles: true, cancelable: true });
      document.getElementById('inboxPad').dispatchEvent(e);
      document.removeEventListener('dragover', spy);
      return [e.defaultPrevented, doc];
    });
    assert(seen[0] && seen[1] === 0, JSON.stringify(seen));
    await page.dispatchEvent('#inboxPad', 'drop', { dataTransfer: dt });
    await page.waitForSelector(`${sheet} #ibRun`);
    assert((await page.textContent(sheet)).includes('명단.csv'), '판으로 받음');
    await page.click(`${sheet} [data-close]`);
    assert(await page.isHidden('#inboxPad'), '판이 남음');
  }],
  ['평가지 채점 칸(#grDrop)에 놓은 파일은 그 칸이 받고 버튼은 가로채지 않음', async () => {
    await page.click('nav.app-side [data-menu-go="evaluate"]');
    await page.click('#menuTabs [data-tab="gr"]');
    await page.waitForSelector('#grDrop');
    const n = (await ran()).length;
    const dt = await page.evaluateHandle(() => { const d = new DataTransfer(); d.items.add(new File(['x'], '학습지.png', { type: 'image/png' })); return d; });
    await page.dispatchEvent('#grDrop', 'drop', { dataTransfer: dt });
    await page.waitForTimeout(300);
    assert(await page.locator(sheet).count() === 0 && (await ran()).length === n, '버튼이 가로챔');
  }],
  ['설정 › 화면 › 떠 있는 버튼: 끄면 버튼이 사라지고 다시 열어도 그대로', async () => {
    await page.click('nav.app-side [data-menu-go="settings"]');
    await page.click('#menuTabs [data-tab="screen"]');
    await page.waitForSelector('#ibSetOn');
    assert(await page.isChecked('#ibSetOn') && await page.isChecked('#ibSetModeConfirm') && await page.isChecked('#ibSetPlanDraft'), '기본값');
    await page.click('#ibSetOn');
    await page.waitForTimeout(100);
    assert(await page.isHidden('#inboxFab'), '버튼이 남음');
    await page.reload(); await page.waitForTimeout(400);
    assert(await page.isHidden('#inboxFab'), '다시 열면 보임');
    await page.click('nav.app-side [data-menu-go="settings"]');
    await page.click('#menuTabs [data-tab="screen"]');
    await page.click('#ibSetOn');
    assert(await page.isVisible('#inboxFab'), '다시 켜도 안 보임');
    assert((await page.evaluate(async () => (await import('./core/inbox.js')).getInboxSettings())).on === true, '저장');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
