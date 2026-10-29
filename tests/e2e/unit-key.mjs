// 평가 › 단원평가: 탭 끼우기, 평가 목록, 1단계(정답지·평가지 넣기, 정답표 고치기), 사진 정답지는 AI, 예시로 채우기, 다시 열기
import { join } from 'node:path';
import { open, run, assert, mockClaude, ROOT } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
const prompts = [];
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
await mockClaude(page, async ({ prompt, images }) => {
  prompts.push({ prompt, images });
  if (prompt.startsWith('[단원평가 정답지]')) return JSON.stringify({
    meta: { subject: '수학', grade: 4, term: 2, unitNo: 3, round: 1 }, domains: ['계산', '이해'],
    items: [{ no: 1, content: '곱셈하기', domain: '계산', type: 'short', answer: '345', points: 50, criteria: '', pages: '<수학> 50쪽' }, { no: 2, content: '곱셈의 뜻', domain: '이해', answer: '②', points: 50 }]
  });
  return '{}';
});
const V = 'section[data-menu="evaluate"]';
const B = `${V} .unit-box`;
const go = async () => { await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="unit"]'); };
const cards = () => page.locator(`${B} [data-un-open]`).count();
await page.goto(url);
await page.waitForTimeout(400);

await run('unit-key', [
  ['단원평가 탭: 기존 평가 화면은 숨고, 다른 탭으로 가면 돌아옴', async () => {
    await go();
    assert(await page.isVisible(B), '단원평가 화면이 안 보임');
    assert(!(await page.isVisible('#importView')) && !(await page.isVisible('#grView')), '기존 화면이 보임');
    await page.click('#menuTabs [data-tab="pyeongeo"]');
    assert(await page.isVisible('#importView') || await page.isVisible('#planView'), '교과 평어 화면이 안 보임');
    assert(!(await page.isVisible(B)), '단원평가 화면이 남음');
    await page.click('#menuTabs [data-tab="gr"]');
    assert(await page.isVisible('#grView'), '평가지 채점 화면');
    await go();
    assert(await page.isVisible(B) && !(await page.isVisible('#grView')), '다시 단원평가');
  }],
  ['정답지 한글 파일: AI 없이 10문항 · 100점, 평가 정보 채움', async () => {
    await page.click(`${B} #unNew`);
    await page.setInputFiles(`${B} #unKeyFile`, join(ROOT, 'samples', '단원평가-정답지-예시.hwpx'));
    await page.waitForFunction(() => (document.querySelector('.unit-box .un-sum') || {}).textContent?.includes('10문항 · 100점'));
    assert(prompts.length === 0, 'AI를 부름');
    assert(await page.inputValue(`${B} #unSubject`) === '국어' && await page.inputValue(`${B} #unGrade`) === '3' && await page.inputValue(`${B} #unUnitNo`) === '2' && await page.inputValue(`${B} #unRound`) === '1', '평가 정보');
    assert(await page.inputValue(`${B} [data-k="6-answer"]`) === '(1) - ② (2) - ①', '6번 정답');
    assert(await page.inputValue(`${B} [data-k="6-type"]`) === 'match', '6번 유형');
  }],
  ['평가지 한글 파일: 단원 이름', async () => {
    await page.setInputFiles(`${B} #unPaperFile`, join(ROOT, 'samples', '단원평가지-예시.hwpx'));
    await page.waitForFunction(() => document.querySelector('.unit-box #unUnitName').value === '중요한 내용을 적어요');
    assert((await page.textContent(`${B} #unPaperMsg`)).includes('10문항'), '평가지 안내');
  }],
  ['배점을 고치면 합계와 알림', async () => {
    await page.fill(`${B} [data-k="1-points"]`, '6');
    await page.dispatchEvent(`${B} [data-k="1-points"]`, 'change');
    await page.waitForFunction(() => document.querySelector('.unit-box .un-sum').textContent.includes('101점'));
    assert((await page.textContent(`${B} .un-sum`)).includes('배점 합이 100점이 아니에요'), '알림');
    await page.fill(`${B} [data-k="1-points"]`, '5');
    await page.dispatchEvent(`${B} [data-k="1-points"]`, 'change');
    await page.waitForFunction(() => !document.querySelector('.unit-box .un-sum').textContent.includes('아니에요'));
  }],
  ['문항 더하기·빼기', async () => {
    await page.click(`${B} [data-un="addItem"]`);
    assert(await page.locator(`${B} [data-k="11-answer"]`).count() === 1, '11번 없음');
    await page.click(`${B} [data-un="delItem"][data-no="11"]`);
    assert(await page.locator(`${B} [data-k="11-answer"]`).count() === 0, '11번 남음');
  }],
  ['다음 단계 → 목록에 그 평가 카드', async () => {
    await page.click(`${B} [data-un="next"]`);
    assert((await page.textContent(`${B} .steps [aria-current="step"]`)).includes('답안'), '2단계가 아님');
    await page.click(`${B} [data-un="back"]`);
    assert(await cards() === 1, '카드 수');
    assert((await page.textContent(`${B} .un-list`)).includes('3학년 국어 2단원 중요한 내용을 적어요 (1회)'), '제목');
  }],
  ['사진 정답지 → AI 한 번, 이미지 1장', async () => {
    await page.click(`${B} #unNew`);
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: 200, height: 120 } });
    await page.setInputFiles(`${B} #unKeyFile`, { name: '정답지.png', mimeType: 'image/png', buffer: png });
    await page.waitForFunction(() => (document.querySelector('.unit-box .un-sum') || {}).textContent?.includes('2문항 · 100점'));
    const k = prompts.filter(p => p.prompt.startsWith('[단원평가 정답지]'));
    assert(k.length === 1 && k[0].images === 1, JSON.stringify(k.map(p => p.images)));
    assert(await page.inputValue(`${B} #unSubject`) === '수학', '교과');
    await page.click(`${B} [data-un="back"]`);
    assert(await cards() === 2, '카드 수 ' + await cards());
  }],
  ['예시로 채우기 → 카드 2개 더, 다시 하면 바꿈', async () => {
    await page.click(`${B} [data-un="sample"]`);
    await page.waitForFunction(() => document.querySelectorAll('.unit-box [data-un-open]').length === 4);
    await page.click(`${B} [data-un="sample"]`);
    await page.waitForTimeout(150);
    assert(await cards() === 4, '예시가 겹침');
    assert((await page.textContent(`${B} .un-list`)).includes('마침'), '마침 표시');
  }],
  ['지우기(확인 창)', async () => {
    const id = await page.getAttribute(`${B} [data-un-open]:last-of-type`, 'data-un-open');
    await page.click(`${B} [data-un="del"][data-id="${id}"]`);
    await page.click('#sheetRoot #unDelOk');
    await page.waitForTimeout(100);
    assert(await cards() === 3, '안 지워짐');
  }],
  ['다시 열어도 남고, 단원평가 탭으로 다시 열림', async () => {
    await page.reload(); await page.waitForTimeout(500);
    assert(await page.locator('#menuTabs [data-tab="unit"][aria-current="page"]').count() === 1, '탭');
    assert(await page.isVisible(B), '화면');
    assert(await cards() === 3, '카드');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
