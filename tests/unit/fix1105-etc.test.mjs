// 2026-11-05 고침(기타 › 쪽지·가정통신문 회신서): 회신서 선택지 구분 글자(/·,), 최근 쪽지 5개·지우기
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { replyOptions, replyPrompt, normReply, fitAnswers, tally } from '../../web/menus/etc/reply-collect.js';
import { listMessages, pushMessage, removeMessage } from '../../web/menus/etc/message-model.js';

function mem() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; }

test('[reply-opt-sep-1] 「□ 참가 / □ 불참」·「□ 동의, □ 미동의」는 선택지 끝의 구분 글자를 뗌', () => {
  const opts = replyOptions(['참가 여부: □ 참가 / □ 불참', '동의 여부: □ 동의, □ 미동의', '급식: □ 먹음 | □ 안 먹음', '도시락 □ 싸 옴 · □ 급식']);
  assert.deepEqual(opts, [
    { name: '참가 여부', options: ['참가', '불참'] },
    { name: '동의 여부', options: ['동의', '미동의'] },
    { name: '급식', options: ['먹음', '안 먹음'] },
    { name: '도시락', options: ['싸 옴', '급식'] }]);
  // 선택지 안의 글자는 그대로
  assert.deepEqual(replyOptions(['시간: □ 9:00/10:00 □ 오후·저녁'])[0].options, ['9:00/10:00', '오후·저녁']);
  // 프롬프트·AI 답도 「참가」로 맞음
  assert.ok(replyPrompt(opts).includes('- 참가 여부: 참가 / 불참'), replyPrompt(opts));
  const r = normReply({ no: 3, answers: { '참가 여부': '참가', '동의 여부': '미동의', '급식': '먹음', '도시락': '급식' } }, opts);
  assert.deepEqual(r, { no: 3, answers: { '참가 여부': '참가', '동의 여부': '미동의', '급식': '먹음', '도시락': '급식' }, unsure: [] });
});

test('[reply-opt-sep-1] 예전 판이 「참가 /」·「동의,」로 저장한 회신서 표 답은 지금 선택지로 맞춤(빈칸이 되지 않게)', () => {
  const opts = replyOptions(['참가 여부: □ 참가 / □ 불참', '동의 여부: □ 동의, □ 미동의']);
  const rows = [{ no: 1, answers: { '참가 여부': '참가 /', '동의 여부': '동의,' }, unsure: [] }, { no: 2, answers: { '참가 여부': '불참', '동의 여부': '' }, unsure: ['동의 여부'] }, { no: 3, answers: { '참가 여부': '모름' }, unsure: [] }];
  fitAnswers(rows, opts);
  assert.deepEqual(rows.map(r => r.answers), [{ '참가 여부': '참가', '동의 여부': '동의' }, { '참가 여부': '불참', '동의 여부': '' }, { '참가 여부': '모름' }]);
  assert.deepEqual(tally(rows, opts)[0].counts, [['참가', 1], ['불참', 1]]);
});

const item = (i, at = 1000 + i) => ({ id: 'k' + i, at, title: '쪽지 ' + i, kind: 'etc', m: {}, len: 'base', attach: [] });

test('[쪽지 5개] 6개를 넣으면 늦은 5개만 남음', () => {
  store.useStorage(mem());
  for (let i = 0; i < 6; i++) pushMessage(item(i));
  const l = listMessages();
  assert.deepEqual(l.map(x => x.id), ['k5', 'k4', 'k3', 'k2', 'k1']);
  assert.equal(store.get('msg:list').length, 5);
});

test('[쪽지 5개] 예전에 20개 저장된 목록도 늦은 5개만 보이고 저장도 5개로 줄어듦', () => {
  store.useStorage(mem());
  // 예전 판(20개까지)이 저장한 그대로
  store.set('msg:list', Array.from({ length: 20 }, (_, i) => ({ ...item(i), attachNames: [] })).reverse());
  const l = listMessages();
  assert.deepEqual(l.map(x => x.id), ['k19', 'k18', 'k17', 'k16', 'k15']);
  assert.equal(store.get('msg:list').length, 5);
  assert.deepEqual(store.get('msg:list').map(x => x.id), ['k19', 'k18', 'k17', 'k16', 'k15']);
});

test('[쪽지 지우기] removeMessage: 그 쪽지만 빠지고 나머지는 차례 그대로, 없는 id는 그대로', () => {
  store.useStorage(mem());
  for (let i = 0; i < 4; i++) pushMessage(item(i));
  assert.equal(removeMessage('k2'), true);
  assert.deepEqual(listMessages().map(x => x.id), ['k3', 'k1', 'k0']);
  assert.deepEqual(store.get('msg:list').map(x => x.id), ['k3', 'k1', 'k0']);
  removeMessage('없는 쪽지');
  assert.deepEqual(listMessages().map(x => x.id), ['k3', 'k1', 'k0']);
});
