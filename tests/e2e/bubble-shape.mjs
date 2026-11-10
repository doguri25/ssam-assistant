// 바탕화면 「쌤」 버튼 창(bubble.html): Windows가 작은 창을 넓히거나(제목 줄 스타일 창의 가장 작은 너비) 낮춰도
// 손그림 원이 창 안에 다 들어오고 가운데에 둥글게 보여야 함 (반원으로 잘리던 것)
import { open, run, assert } from './helpers.mjs';

const { page, url, errors, close } = await open({ width: 72, height: 72 });

const shape = async (w, h) => {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(url + 'bubble.html');
  await page.waitForSelector('#bubble svg.ssam-mark path.sm-t');
  return page.evaluate(() => {
    const r = document.querySelector('#bubble svg.ssam-mark').getBoundingClientRect();
    const b = document.querySelector('#bubble').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, bw: b.width, bh: b.height };
  });
};

const inside = (s, what) => {
  assert(Math.abs(s.w - s.h) < 1, `${what}: 원이 정사각형 안에 (${s.w}×${s.h})`);
  assert(s.x >= 0 && s.y >= 0 && s.x + s.w <= s.vw + 0.5 && s.y + s.h <= s.vh + 0.5, `${what}: 창 안에 다 들어옴 (${JSON.stringify(s)})`);
  assert(Math.abs((s.x + s.w / 2) - s.vw / 2) < 1 && Math.abs((s.y + s.h / 2) - s.vh / 2) < 1, `${what}: 가운데 (${JSON.stringify(s)})`);
  assert(Math.abs(s.bw - s.w) < 1 && Math.abs(s.bh - s.h) < 1, `${what}: 누르는 자리도 그림만큼 (${s.bw}×${s.bh})`);
};

await run('바탕화면 버튼 창 모양', [
  ['116×116(버튼 창, 예전 72의 1.6배): 원 지름 약 93px(예전 58의 1.6배), 배지도 창 안', async () => {
    const s = await shape(116, 116);
    inside(s, '116×116');
    assert(s.w >= 90 && s.w <= 96, `원 크기 (${s.w})`);
    const b = await page.evaluate(() => { const r = document.querySelector('#bubble .badge').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, r: r.right, t: r.top }; });
    assert(b.w >= 28 && b.r <= 116 && b.t >= 0, `배지 (${JSON.stringify(b)})`);
  }],
  ['72×72: 그대로 둥글게', async () => inside(await shape(72, 72), '72×72')],
  ['136×72(Windows가 넓힌 창): 반원으로 잘리지 않음', async () => inside(await shape(136, 72), '136×72')],
  ['108×72·72×41·122×38(배율·제목 줄 높이로 바뀐 창): 잘리지 않음', async () => {
    for (const [w, h] of [[108, 72], [72, 41], [122, 38]]) inside(await shape(w, h), `${w}×${h}`);
  }],
  ['72×136(세로로 긴 창): 잘리지 않음', async () => inside(await shape(72, 136), '72×136')],
  ['페이지 오류 없음', async () => assert(!errors.length, errors.join(' / '))]
]);
await close();
