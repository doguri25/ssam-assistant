// 버그 탐색(11. 4.) 뒤 남은 것: 한글 양식 회신서 칸 나누기(시간 「13:00」), 공문 처리 학년도
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { unzip } from '../../web/core/zip.js';
import { readForm, findRoles, fillForm } from '../../web/core/hwpx-form.js';
import { letterFormHwpx } from '../../scripts/sample-letter-form.mjs';

function mem() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; }
store.useStorage(mem());
const dec = u8 => new TextDecoder().decode(u8);
const cells = xml => [...xml.matchAll(/<hp:tc\b[\s\S]*?<\/hp:tc>/g)].map(m => [...m[0].matchAll(/<hp:t>([^<]*)<\/hp:t>/g)].map(x => x[1]).join(''));

test('[reply-colon-1] 한글 양식(.hwpx) 회신서: 칸 이름의 시간(13:00)에서 나누지 않고 첫 □ 앞에서 나눔', async () => {
  const f = await readForm(await letterFormHwpx());
  const r = await fillForm(f, findRoles(f.lines), { title: 'T', date: '2026-11-04', body: ['본문'],
    reply: { title: '참가 신청서', fields: ['1부(13:00~14:00): □ 신청 □ 미신청', '참가 여부: □ 참가 □ 불참', '하고 싶은 말'], due: '' } });
  const sec = dec((await unzip(r.bytes)).get('Contents/section0.xml'));
  const tbl = sec.slice(sec.lastIndexOf('<hp:tbl'), sec.lastIndexOf('</hp:tbl>'));
  const c = cells(tbl);
  assert.ok(c.includes('1부(13:00~14:00)') && c.includes('□ 신청 □ 미신청'), JSON.stringify(c));
  assert.ok(!c.includes('1부(13'), JSON.stringify(c));
  assert.ok(c.includes('참가 여부') && c.includes('□ 참가 □ 불참') && c.includes('하고 싶은 말'), JSON.stringify(c));
});

// 2차(11. 5.): 이름 가리기 알림은 「다 막았다」고 장담하지 않고 확인을 부탁함(가리지 못하는 꼴이 남아 있음)
import { personalMsg } from '../../web/core/survey.js';
test('[privacy-msg] 개인정보를 뺀 알림은 「학생 이름은 … 보내지도 않아요」라고 장담하지 않음', () => {
  const m = personalMsg({ cols: ['이름'], dropped: 1, masked: 2 });
  assert.ok(m.includes('이름 2개는 ○○○로 가려') && m.includes('확인해 주세요') && !m.includes('보내지도 않아요'), m);
});
