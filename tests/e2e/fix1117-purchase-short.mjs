// 2026-11-17 선생님 요청(품의 짧게): 구입 품목 3개 이상은 「○○ 외 2개」, 붙임은 「기타:」 바로 아래(빈 줄 없음),
// 2. 첫 문장은 한두 줄의 한 문장(「… 운영 물품을 구매하고자 합니다.」 — AI가 길게 써도 첫 문장만, 「다음과 같이」 뺌),
// 1. 관련은 저장된 학교 이름으로 「새싹초등학교-xxxxx(올해. xx. xx.)」, 계획서를 넣으면 그 뒤에 「계획서 제목」.
// 예전(0.34)에 손으로 고친 초안은 열기만 해서는 바뀌지 않음
import { open, run, assert, mockClaude } from './helpers.mjs';
import { emptyForm, reasonTailV2, relatedLineV1 } from '../../web/menus/purchase/rules.js';

const t = await open();
const { page, errors } = t;
const Y = new Date().getFullYear();
const prompts = [];
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  if (prompt.startsWith('[품의 초안]')) return JSON.stringify({ title: '과학 탐구 동아리 물품 구입', intro: '2. 과학 탐구 동아리 운영을 위하여 실험 재료를 다음과 같이 구매하고자 합니다. 이 재료는 모둠 실험에 씁니다.', fields: { purpose: '탐구 활동' } });
  if (prompt.startsWith('[품의 검토]')) return JSON.stringify({ items: [] });
  return '{}';
});
const P = 'section[data-menu="purchase"]';
const reason = () => page.inputValue(`${P} #pcReason`);
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:purchase:current') || 'null'));
const chips = () => page.textContent(`${P} #pcChips`);

async function reset(keys = {}) {
  await page.evaluate(k => {
    for (const x of Object.keys(localStorage)) if (x.startsWith('ssam:purchase')) localStorage.removeItem(x);
    localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
    localStorage.setItem('ssam:purchase:view', JSON.stringify('full'));
    localStorage.setItem('ssam:school', JSON.stringify({ name: '새싹초등학교' }));
    for (const [x, v] of Object.entries(k)) localStorage.setItem('ssam:' + x, JSON.stringify(v));
  }, keys);
  await page.reload({ timeout: 20000 });
  await page.waitForTimeout(300);
  await page.click('nav.app-side [data-menu-go="purchase"]');
  await page.click('#menuTabs [data-tab="new"]');
  await page.waitForSelector(`${P} #pcIntake`);
}
async function go(text) {
  await page.fill(`${P} #pcIntake`, text);
  await page.click(`${P} [data-pc="go"]`);
  await page.waitForFunction(s => (document.querySelector(`${s} #pcTitle`) || {}).value, P);
  await page.waitForTimeout(200);
}

await page.goto(t.url);
await run('fix1117-purchase-short', [
  ['품목 3개: 「비커 외 2개」, 「기타:」 바로 아래 붙임, 관련은 「새싹초등학교-xxxxx(올해. xx. xx.)」, 첫 문장은 한 문장', async () => {
    await reset();
    await go('비커 8개 4500원\n유리 막대 8개 1200원\n전자저울 4개 23000원');
    const r = await reason(), lines = r.split('\n');
    assert(lines[0] === `1. 관련: 새싹초등학교-xxxxx(${Y}. xx. xx.)`, lines[0]);
    assert(lines[1] === '2. 과학 탐구 동아리 운영을 위하여 실험 재료를 구매하고자 합니다.', lines[1]);
    assert(/구입 품목: 비커 외 2개\n/.test(r) && !r.includes('×'), r);
    assert(/  [가-하]\. 기타:\n붙임  1\. 지출품의서 1부\./.test(r) && !r.includes('\n\n'), r);
    assert((await chips()).includes('관련 · 문서 번호·날짜 채우기'), await chips());
    assert((await page.getAttribute(`${P} #pcRelated`, 'placeholder')) === `비우면 「새싹초등학교-xxxxx(${Y}. xx. xx.)」`, '관련 칸 안내');
    const p = prompts.find(x => x.startsWith('[품의 초안]'));
    assert(p.includes('한두 줄(40자 안팎)') && p.includes('운영 물품을 구매하고자 합니다') && !/다음과 같이 (?:구입|구매)하고자/.test(p), '초안 AI 지시');
  }],
  ['사유 첫 줄의 xxxxx·날짜를 채우면 관련 칸으로 옮겨지고 칩이 사라짐(손으로 고친 사유로 보지 않음)', async () => {
    const r = await reason();
    await page.fill(`${P} #pcReason`, r.replace(`새싹초등학교-xxxxx(${Y}. xx. xx.)`, `새싹초등학교-567(${Y}. 3. 5.)`));
    await page.waitForTimeout(200);
    const s = await state();
    assert(s.form.related === `새싹초등학교-567(${Y}. 3. 5.)` && s.draft.edited === false, JSON.stringify([s.form.related, s.draft.edited]));
    assert(!(await chips()).includes('관련 · 문서 번호'), '칩이 남음');
    assert((await page.inputValue(`${P} #pcRelated`)) === `새싹초등학교-567(${Y}. 3. 5.)`, '관련 칸');
  }],
  ['계획서 글을 넣으면 관련은 「새싹초등학교-xxxxx(올해. xx. xx.) 「계획서 제목」」, 품목 2개는 산출 근거 그대로', async () => {
    await reset();
    await go('2026학년도 과학 탐구 동아리 운영 계획\n1. 목적\n가. 탐구 활동으로 과학적 사고력을 기른다.\n2. 소요 예산\n비커 8개 4500원\n유리 막대 8개 1200원');
    const s = await state(), lines = (await reason()).split('\n');
    assert(s.form.related === `새싹초등학교-xxxxx(${Y}. xx. xx.) 「2026학년도 과학 탐구 동아리 운영 계획」`, s.form.related);
    assert(lines[0] === `1. 관련: ${s.form.related}`, lines[0]);
    // 품목 2개는 산출 근거 그대로
    assert(lines.some(l => /구입 품목: 비커 4,500원 × 8개 = 36,000원, 유리 막대 1,200원 × 8개 = 9,600원$/.test(l)), JSON.stringify(lines));
    assert((await chips()).includes('관련 · 문서 번호·날짜 채우기'), await chips());
  }],
  ['예전(0.34)에 손으로 고친 초안: 열어도 관련 첫 줄·빈 줄 붙임은 그대로, [사유 다시 맞추기]도 뜨지 않음 — 품목이 바뀌면 뜸', async () => {
    const form = { ...emptyForm('goods'), purpose: '과학 실험', items: [1, 2, 3, 4].map(i => ({ name: '물품' + i, spec: '', unit: '', qty: '1', price: '1000', vendor: '' })) };
    const tail = reasonTailV2(form), rel = relatedLineV1(form, 2026);
    // 0.34 꼴: 관련은 예전 기본값, 가~ 줄은 reasonTailV2(4개부터 「외 3건」, 붙임 앞 빈 줄), 목적 줄을 손으로 고침
    const old = `1. 관련: ${rel}\n2. 과학 실험을 위하여 실험 재료를 다음과 같이 구입하고자 합니다.\n${tail.replace('  가. 목적: 과학 실험', '  가. 목적: 과학 실험(손으로)')}`;
    await reset({ 'purchase:current': { id: 'pc034', form, draft: { title: '과학 실험 재료 구입', intro: '과학 실험을 위하여 실험 재료를 다음과 같이 구입하고자 합니다.', reason: old, edited: true, tail, rel } } });
    await page.waitForTimeout(300);
    assert((await reason()) === old, '예전 사유가 바뀜:\n' + await reason());
    assert((await state()).draft.reason === old, '저장된 사유가 바뀜');
    assert((await page.textContent(`${P} #pcResyncBox`)).trim() === '', '다시 맞추기가 뜸: ' + await page.textContent(`${P} #pcResyncBox`));
    await page.fill(`${P} [data-item="0"][data-f="qty"]`, '2');
    await page.waitForTimeout(200);
    assert((await page.textContent(`${P} #pcResyncBox`)).includes('사유 다시 맞추기'), '품목이 바뀌어도 안 뜸');
    await page.click(`${P} [data-pc="resync"]`);
    await page.waitForTimeout(200);
    const r = await reason();
    assert(r.split('\n')[0] === `1. 관련: 새싹초등학교-xxxxx(${Y}. xx. xx.)` && r.includes('구입 품목: 물품1 외 3개\n') && r.includes('기타:\n붙임'), r);
  }],
  ['예전(0.34)에 손대지 않은 초안은 열면 새 꼴로 다시 맞춤(첫 문장은 그대로)', async () => {
    const form = { ...emptyForm('goods'), purpose: '과학 실험', items: [1, 2, 3].map(i => ({ name: '물품' + i, spec: '', unit: '', qty: '1', price: '1000', vendor: '' })) };
    const intro = '과학 실험을 위하여 실험 재료를 다음과 같이 구입하고자 합니다.';
    const old = `1. 관련: ${relatedLineV1(form, 2026)}\n2. ${intro}\n${reasonTailV2(form)}`;
    await reset({ 'purchase:current': { id: 'pc034b', form, draft: { title: '과학 실험 재료 구입', intro, reason: old, edited: false, tail: reasonTailV2(form), rel: relatedLineV1(form, 2026) } } });
    await page.waitForTimeout(300);
    const r = await reason();
    assert(r.startsWith(`1. 관련: 새싹초등학교-xxxxx(${Y}. xx. xx.)\n2. ${intro}\n`) && r.includes('구입 품목: 물품1 외 2개\n') && r.includes('기타:\n붙임'), r);
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
