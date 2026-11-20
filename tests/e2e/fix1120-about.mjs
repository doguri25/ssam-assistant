// 2026-11-20 설정 › 정보: 라이선스(MIT)·한컴 출처 표시·함께 쓴 공개 소프트웨어, [라이선스 전문 보기]·[고지 전체 보기]는 web/licenses 파일을 불러와 펼치고 다시 누르면 접힘
import { open, run, assert, enter } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.goto(url);
await page.waitForTimeout(400);
const S = 'section[data-menu="settings"]';

await run('fix1120-about', [
  ['설정 › 정보: 라이선스·출처 표시·공개 소프트웨어가 보임', async () => {
    await enter(page, 'settings', 'about');
    await page.waitForSelector(`${S} .set-card`);
    const txt = (await page.textContent(S)).replace(/\s+/g, ' ');
    assert(txt.includes('MIT 라이선스'), 'MIT');
    assert(txt.includes('본 제품은 한글과컴퓨터의 한/글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.'), '한컴 출처');
    for (const s of ['pdf.js 3.11.174', 'Pretendard', 'SUIT', 'Tauri 2']) assert(txt.includes(s), s);
  }],
  ['[라이선스 전문 보기]: LICENSE.txt를 펼치고 다시 누르면 접힘', async () => {
    await page.click(`${S} [data-set="lic"][data-k="license"]`);
    await page.waitForFunction(s => { const p = document.querySelector(s + ' .lic-text'); return p && p.textContent.includes('MIT License'); }, S);
    assert((await page.getAttribute(`${S} [data-set="lic"][data-k="license"]`, 'aria-expanded')) === 'true', '펼침 표시');
    await page.click(`${S} [data-set="lic"][data-k="license"]`);
    await page.waitForTimeout(150);
    assert((await page.$$(`${S} .lic-text`)).length === 0, '접힘');
  }],
  ['[고지 전체 보기]: Rust 라이브러리 고지를 불러옴', async () => {
    await page.click(`${S} [data-set="lic"][data-k="notices"]`);
    await page.waitForFunction(s => { const p = document.querySelector(s + ' .lic-text'); return p && /tauri 2\.\d+\.\d+ — /.test(p.textContent); }, S, { timeout: 8000 });
    const t2 = await page.textContent(`${S} .lic-text`);
    assert(t2.includes('Rust 라이브러리') && t2.includes('Apache License'), '고지 내용');
  }],
  ['「쌤」 안내: 「라이선스」로 물으면 라이선스 안내', async () => {
    const r = await page.evaluate(async () => (await import('./core/chat-knowledge.js')).offlineAnswer('라이선스가 뭐야?'));
    assert(r && r.title === '라이선스·저작권', JSON.stringify(r && r.title));
  }],
  ['오류 없음', async () => { assert(errors.length === 0, errors.join('\n')); }]
]);
await t.close();
