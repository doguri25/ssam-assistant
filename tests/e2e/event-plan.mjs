// 계획 › 행사계획: 1 행사 정보 → 2 구성안 → 3 문서 → 4 설문·결과 (PRD 5.4)
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, ctx, url, errors } = t;
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const prompts = [];
const opt = (label, act) => ({ label, summary: label + ' 한 줄', timetable: [{ time: '09:00', activity: act, place: '운동장' }, { time: '10:00', activity: '줄다리기', place: '운동장' }], pros: ['참여가 넓음', '안전함'], staffNeed: '교사 8명', budget: [{ name: '상품', amount: 300000 }, { name: '현수막', amount: 90000 }] });
await mockClaude(page, ({ prompt }) => {
  prompts.push(prompt);
  if (prompt.startsWith('[행사 구성안]')) {
    const withLast = !prompt.includes('보완안은 만들지 마세요');
    return JSON.stringify({ options: withLast ? [opt('보완안', '개회식(대기 줄임)'), opt('새로운 안', '가족 릴레이'), opt('새로운 안', '놀이 부스')] : [opt('새로운 안', '가족 릴레이'), opt('새로운 안', '놀이 부스')] });
  }
  if (prompt.startsWith('[행사 문서]')) return JSON.stringify({
    plan: '1. 운영 방침\n학년별로 나누어 운영한다.', safety: '- 응급 처치 인원 배치\n- 그늘막 설치', letter: '가을 운동회 안내\n일시: 2027년 5월 6일\n준비물: 물병\n복장: 체육복', rain: '',
    roles: [{ name: '김교사', roles: ['사회', '음향', '안전', '기록', '시상'] }, { name: '이교사', roles: ['안전'] }, { name: '박교사', roles: ['기록'] }, { name: '없는 교사', roles: ['x'] }]
  });
  return '{}';
});
const V = 'section[data-menu="plan"]';
const go = async () => { await page.click('nav.app-side [data-menu-go="plan"]'); await page.click('#menuTabs [data-tab="event"]'); };
await page.goto(url);
await page.waitForTimeout(500);
await go();

await run('event-plan', [
  ['처음: 단계 4개, 종류 4개, 연간계획 화면은 안 보임', async () => {
    const steps = await page.locator(`${V} .ev-box ol.steps li`).allInnerTexts();
    assert(steps.length === 4 && steps.join('|').replace(/\s+/g, '').includes('행사정보') && steps.at(-1).includes('설문'), '단계: ' + steps.join('|'));
    assert(await page.locator(`${V} [data-kind]`).count() === 4, '종류 수');
    assert(!(await page.isVisible(`${V} .yp-box`)), '연간계획 화면이 보임');
  }],
  ['필수 칸이 비면 다음으로 안 감', async () => {
    await page.click(`${V} [data-e="next"]`);
    for (const id of ['#evName', '#evDate', '#evGrades', '#evPlace']) assert(await page.locator(`${V} ${id}.bad`).count() === 1, id + ' 빨갛지 않음');
  }],
  ['어린이날을 고르면 겹침 안내와 추천, 추천을 누르면 바뀜', async () => {
    await page.fill(`${V} #evName`, '가을 운동회');
    await page.fill(`${V} #evPurpose`, '협동심과 체력 기르기');
    await page.fill(`${V} #evGrades`, '전교생');
    await page.fill(`${V} #evPlace`, '운동장');
    await page.click(`${V} [data-outdoor="1"]`);
    await page.fill(`${V} #evDate`, '2027-05-05');
    await page.waitForSelector(`${V} #evDateWarn`);
    assert((await page.textContent(`${V} #evDateWarn`)).includes('공휴일(어린이날)'), '안내');
    const sug = await page.locator(`${V} #evDateWarn button[data-suggest]`).evaluateAll(bs => bs.map(b => b.dataset.suggest));
    assert(sug.join(',') === '2027-05-06,2027-05-04', '추천: ' + sug);
    await page.click(`${V} #evDateWarn button[data-suggest="2027-05-06"]`);
    assert(await page.inputValue(`${V} #evDate`) === '2027-05-06', '날짜');
    assert(await page.locator(`${V} #evDateWarn`).count() === 0, '안내가 남음');
  }],
  ['작년 설문을 넣고 다음 → 구성안 3개, 보완안이 첫째', async () => {
    await page.fill(`${V} textarea#evLast`, '작년 운동회 만족도 3.8점, 대기 시간이 길었음');
    await page.click(`${V} [data-e="next"]`);
    await page.waitForSelector(`${V} .ev-opt[data-opt]`, { timeout: 8000 });
    assert(await page.locator(`${V} .ev-opt[data-opt]`).count() === 3, '안 수');
    assert((await page.textContent(`${V} .ev-opt[data-opt="0"]`)).includes('보완안'), '첫째가 보완안 아님');
    assert(prompts.at(-1).startsWith('[행사 구성안]') && prompts.at(-1).includes('대기 시간이 길었음'), '프롬프트');
  }],
  ['안을 고르고 시간표를 고치면 새로고침해도 남음', async () => {
    await page.click(`${V} [data-pick="1"]`);
    assert(await page.locator(`${V} .ev-opt[data-opt="1"].picked`).count() === 1, '고른 표시');
    await page.fill(`${V} [data-tt="0"][data-f="activity"]`, '가족 릴레이(학년별)');
    await page.reload(); await page.waitForTimeout(500);
    assert(await page.inputValue(`${V} [data-tt="0"][data-f="activity"]`) === '가족 릴레이(학년별)', '시간표가 사라짐');
  }],
  ['작년 설문 없이 만든 행사는 보완안을 만들지 않게 함', async () => {
    await page.click(`${V} [data-e="new"]`);
    await page.click(`${V} [data-kind="arts"]`);
    await page.fill(`${V} #evName`, '학예회');
    await page.fill(`${V} #evGrades`, '전교생');
    await page.fill(`${V} #evDate`, '2027-12-17');
    await page.fill(`${V} #evPlace`, '강당');
    await page.click(`${V} [data-e="next"]`);
    await page.waitForSelector(`${V} .ev-opt[data-opt]`, { timeout: 8000 });
    assert(prompts.at(-1).includes('보완안은 만들지 마세요'), '프롬프트');
    assert(await page.locator(`${V} .ev-opt[data-opt]`).count() === 2, '안 수');
  }],
  ['3단계 문서: 4개 탭, 역할이 많은 사람 표시', async () => {
    await page.click(`${V} #evList [data-ev]:has-text("가을 운동회")`);
    await page.click(`${V} ol.steps [data-step="1"]`);
    for (const [i, n, d] of [[0, '김교사', '체육부'], [1, '이교사', '보건'], [2, '박교사', '6학년']]) {
      await page.click(`${V} [data-e="staffAdd"]`);
      await page.fill(`${V} [data-staff="${i}"][data-f="name"]`, n); await page.fill(`${V} [data-staff="${i}"][data-f="duty"]`, d);
    }
    await page.click(`${V} ol.steps [data-step="2"]`);
    await page.click(`${V} [data-e="next"]`);
    await page.click(`${V} [data-e="docs"]`);
    await page.waitForSelector(`${V} [data-doc="roles"]`, { timeout: 8000 });
    assert(await page.locator(`${V} [data-doc]`).count() === 4, '문서 탭 수');
    const pr = prompts.at(-1);
    assert(pr.startsWith('[행사 문서]') && pr.includes('김교사') && pr.includes('가족 릴레이(학년별)'), '프롬프트');
    await page.click(`${V} [data-doc="roles"]`);
    assert(await page.locator(`${V} #evRoles [data-role]`).count() === 3, '명단에 없는 사람이 들어감');
    assert(await page.locator(`${V} #evRoles [data-role="0"].ev-over`).count() === 1, '김교사 표시 없음');
  }],
  ['가정통신문: 문의처가 빠지면 [완성]이 꺼지고, 더하면 켜짐', async () => {
    await page.click(`${V} [data-doc="letter"]`);
    assert((await page.textContent(`${V} #evLetterMissing`)).includes('문의처'), '빠진 항목 표시');
    assert(await page.isDisabled(`${V} [data-e="letterDone"]`), '[완성]이 켜져 있음');
    const ta = `${V} textarea[data-docf="letter"]`;
    await page.fill(ta, (await page.inputValue(ta)) + '\n문의: 교무실 000-0000');
    assert(await page.locator(`${V} #evLetterMissing`).count() === 0 || await page.isHidden(`${V} #evLetterMissing`), '빠진 항목이 남음');
    assert(await page.isEnabled(`${V} [data-e="letterDone"]`), '[완성]이 꺼져 있음');
    await page.click(`${V} [data-e="letterDone"]`);
  }],
  ['문서마다 한글 파일·복사', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${V} [data-e="hwpx"]`)]);
    assert(dl.suggestedFilename() === '가을 운동회 안내.hwpx', '이름: ' + dl.suggestedFilename());
    await page.click(`${V} [data-e="copyDoc"]`);
    await page.waitForTimeout(150);
    assert((await page.evaluate(() => navigator.clipboard.readText())).includes('문의: 교무실 000-0000'), '클립보드');
  }],
  ['품의로 이어 가기: 행사 운영 품의에 칸과 예산 줄이 채워짐', async () => {
    await page.click(`${V} [data-e="purchase"]`);
    assert(await page.textContent('header.app-top h1') === '품의', '품의로 안 감');
    const P = 'section[data-menu="purchase"]';
    assert(await page.getAttribute(`${P} [data-pctype="event"]`, 'aria-pressed') === 'true', '종류');
    assert(await page.inputValue(`${P} #pcProject`) === '가을 운동회', '사업명');
    assert(await page.inputValue(`${P} #pcDate`) === '2027-05-06' && await page.inputValue(`${P} #pcTarget`) === '전교생' && await page.inputValue(`${P} #pcPlace`) === '운동장', '일시·대상·장소');
    assert(await page.inputValue(`${P} [data-item="0"][data-f="name"]`) === '상품' && await page.inputValue(`${P} [data-item="0"][data-f="price"]`) === '300000', '품목');
    await go();
  }],
  // (Task 6 시험이 여기 이어짐)
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
