// AI로 보낸 글(스펙 2026-11-13 §2): 이 기기 메모리에만 최근 20개(새것이 앞), 비우기, 바뀌면 알림, 줄 글, 키·머리말은 적지 않음
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../../web/core/ai-log.js';
import { TASKS } from '../../web/core/ai-roles.js';
import { GUIDE, offlineAnswer } from '../../web/core/chat-knowledge.js';
import { INTENT_IDS } from '../../web/core/chat-route.js';

const base = (over = {}) => ({ task: 'grade', role: 'main', provider: 'Gemini', model: 'Gemini 3.8 Flash', text: '[채점] 1번 문항을 채점하세요.', images: [], ...over });

test('적은 것의 모양: 때·업무·AI·보낸 글·글자 수·그림 수(그림 자체는 두지 않음)', () => {
  L.clear();
  const at = new Date(2026, 10, 13, 11, 2).getTime();
  const e = L.add(base({ at, images: [{ mime: 'image/png', b64: 'AAAA' }, { mime: 'image/jpeg', b64: 'BBBB' }] }));
  assert.deepEqual(Object.keys(e).sort(), ['at', 'chars', 'id', 'images', 'model', 'provider', 'role', 'task', 'text', 'thumbs']);
  assert.equal(e.at, at);
  assert.equal(e.task, 'grade'); assert.equal(e.role, 'main');
  assert.equal(e.provider, 'Gemini'); assert.equal(e.model, 'Gemini 3.8 Flash');
  assert.equal(e.text, '[채점] 1번 문항을 채점하세요.');
  assert.equal(e.chars, e.text.length);
  assert.equal(e.images, 2, '그림은 수만');
  assert.deepEqual(e.thumbs, [], 'Node에서는 작은 그림을 만들지 않음');
  assert.ok(!JSON.stringify(e).includes('AAAA') && !JSON.stringify(e).includes('BBBB'), '그림 내용은 적지 않음');
  assert.deepEqual(L.list().map(x => x.id), [e.id]);
});

test('키·인증 머리말처럼 보이는 칸은 받아도 적지 않음', () => {
  L.clear();
  const e = L.add(base({ key: 'sk-ant-test-123', apiKey: 'AIzaTest', headers: { 'x-api-key': 'sk-ant-test-123', authorization: 'Bearer sk-test' }, authorization: 'Bearer sk-test', token: 't0k', url: 'https://api.anthropic.com/v1/messages?key=AIzaTest' }));
  const s = JSON.stringify(L.list());
  for (const bad of ['sk-ant-test-123', 'AIzaTest', 'Bearer', 'sk-test', 't0k', 'x-api-key', 'headers', 'authorization', 'apiKey', 'token', 'url']) assert.ok(!s.includes(bad), `${bad} 적힘: ${s}`);
  assert.ok(!('key' in e) && !('headers' in e));
});

test('최근 20개만(새것이 앞), 21번째부터 옛것이 빠짐', () => {
  L.clear();
  for (let i = 1; i <= 25; i++) L.add(base({ text: `요청 ${i}` }));
  const l = L.list();
  assert.equal(L.MAX, 20);
  assert.equal(l.length, 20);
  assert.equal(l[0].text, '요청 25');
  assert.equal(l[19].text, '요청 6');
  assert.equal(new Set(l.map(x => x.id)).size, 20, 'id는 겹치지 않음');
  l.length = 0;
  assert.equal(L.list().length, 20, 'list()는 사본');
});

test('비우기·바뀌면 알림(onChange는 그만 듣기를 돌려줌)', () => {
  L.clear();
  let n = 0;
  const off = L.onChange(() => { n++; });
  L.add(base());
  L.add(base());
  assert.equal(n, 2);
  L.clear();
  assert.equal(n, 3);
  assert.deepEqual(L.list(), []);
  off();
  L.add(base());
  assert.equal(n, 3, '그만 들은 뒤에는 알리지 않음');
  // 듣는 쪽이 오류를 내도 적기는 됨
  const off2 = L.onChange(() => { throw new Error('x'); });
  assert.doesNotThrow(() => L.add(base()));
  off2();
  L.clear();
});

test('작은 그림은 나중에 붙임(3장까지, 없는 줄은 그냥 둠)', () => {
  L.clear();
  const e = L.add(base({ images: [1, 2, 3, 4, 5].map(i => ({ mime: 'image/png', b64: String(i) })) }));
  let n = 0;
  const off = L.onChange(() => { n++; });
  L.setThumbs(e.id, ['data:image/jpeg;base64,a', 'data:image/jpeg;base64,b', 'data:image/jpeg;base64,c', 'data:image/jpeg;base64,d']);
  assert.deepEqual(L.list()[0].thumbs, ['data:image/jpeg;base64,a', 'data:image/jpeg;base64,b', 'data:image/jpeg;base64,c']);
  assert.equal(L.list()[0].images, 5);
  assert.equal(n, 1);
  L.setThumbs(9999999, ['data:image/jpeg;base64,z']);
  L.setThumbs(e.id, ['https://example.com/x.png']);
  assert.equal(n, 1, '없는 줄·그림 주소가 아닌 것은 넘어감');
  off();
  L.clear();
});

test('줄 글: 「11:02 · 채점 · Gemini 3.8 Flash · 글 1,240자 · 그림 2장」, 그림이 없으면 그림 칸 없음', () => {
  L.clear();
  const at = new Date(2026, 10, 13, 11, 2).getTime();
  const e = L.add(base({ at, text: '가'.repeat(1240), images: [{}, {}] }));
  assert.equal(L.rowText(e), '11:02 · 채점 · Gemini 3.8 Flash · 글 1,240자 · 그림 2장');
  const e2 = L.add(base({ at: new Date(2026, 10, 13, 9, 5).getTime(), task: 'purchase', provider: 'Claude', model: 'Claude Haiku 5.5', text: '품의' }));
  assert.equal(L.rowText(e2), '09:05 · 품의 · Claude Haiku 5.5 · 글 2자');
  L.clear();
});

test('업무 이름: 업무별 AI의 업무 모두, 검토는 「… 검토」, 모르는 업무는 「기타」, 연결 확인', () => {
  for (const [id] of TASKS) assert.ok(L.taskName(id) && L.taskName(id) !== '기타', id);
  assert.equal(L.taskName('grade'), '채점');
  assert.equal(L.taskName('grade', 'review'), '채점 검토');
  assert.equal(L.taskName('', 'review'), '검토');
  assert.equal(L.taskName(''), '기타');
  assert.equal(L.taskName('zzz'), '기타');
  assert.equal(L.taskName('test'), '연결 확인');
});

test('모르는 값도 안전하게(글이 아니면 빈 글, 그림이 배열이 아니면 0장)', () => {
  L.clear();
  const e = L.add({ text: null, images: 'x', task: 7, provider: { a: 1 } });
  assert.equal(e.text, ''); assert.equal(e.chars, 0); assert.equal(e.images, 0);
  assert.equal(e.task, ''); assert.equal(e.provider, '');
  assert.ok(Number.isFinite(e.at));
  L.clear();
});

test('안내: 「AI로 보낸 글」 — 설정 › AI, 최근 20개, 이 기기 메모리에만(다시 켜면 비움·백업에 없음), 키는 적지 않음, 버튼은 그 카드로', () => {
  const g = GUIDE.find(x => x.id === 'ailog');
  assert.ok(g, '안내 없음');
  assert.deepEqual(g.go, ['aiLog']);
  assert.ok(g.go.every(id => INTENT_IDS.includes(id)));
  for (const s of ['설정 › AI', '20개', '메모리', '다시 켜면', '백업', '[비우기]', '키']) assert.ok(g.text.includes(s), s);
  for (const q of ['AI에 보낸 내용 볼 수 있어?', 'AI로 뭘 보냈는지 어디서 봐?', '보낸 글은 어디서 봐요?']) {
    const a = offlineAnswer(q);
    assert.equal(a && a.ids[0], 'ailog', `${q}: ${JSON.stringify(a && a.ids)}`);
  }
  // 개인정보·AI 키 안내는 그대로
  assert.equal(offlineAnswer('개인정보는 안전한가요?').ids[0], 'privacy');
  assert.equal(offlineAnswer('AI 키는 어디에 넣어?').ids[0], 'ai');
});
