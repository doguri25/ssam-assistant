// 문서·소통 › 문서 다듬기(스펙 2026-11-15 1A): 고칠 줄·보낼 글(이름·연락처는 가리고 명단·주민번호 줄·이름만 든 칸은 보내지 않음),
// 묶음(약 12,000자·250줄), AI 답 정리(없는 번호·빈 replace 버림, 이름 되돌림), 바꾸기·지우기·뒤에 더하기, 줄마다·모두 되돌리기, 이어서 고치기,
// 한 단계 되돌리기(최근 10), 날짜·학년도 바꾸기(AI 없이), .hwpx 편집·쌤비서 기본 문서로. 이름은 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHIPS, startItems, payloadOf, batchLines, docPrompt, normChanges, applyChanges, revertOne, revertAll, changesOf, viewOf,
  guessSwap, swapItems, editsOf, plainDoc, pushHist, HIST_MAX
} from '../../web/menus/etc/docedit-model.js';

const L = (text, inBox = false) => ({ text, inBox });
const LINES = [
  L('2026학년도 새싹초등학교 독서교육 운영 계획'), // 0
  L(''), // 1
  L('1. 목적'), // 2
  L('  가. 책 읽는 즐거움을 알게 하고자 함.'), // 3
  L('담당: 교무부장 이바다 선생님(041-123-4567)'), // 4
  L('참석: 김하늘, 이바다, 한가람'), // 5 명단 줄
  L('김하늘 080101-3123456'), // 6 주민번호 줄
  L('구분', true), // 7
  L('김하늘', true), // 8 이름만 든 칸
  L('2026. 3. ~ 2027. 2.', true) // 9
];

test('[docedit-items] 고칠 줄: 빈 줄은 빼고 번호(1부터), 표 칸 표시', () => {
  const it = startItems(LINES);
  assert.equal(it.length, 9);
  assert.deepEqual(it.map(x => x.id), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(it.map(x => x.src), [0, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.ok(it[6].box && !it[0].box);
  assert.ok(it.every(x => x.text === x.orig && !x.del));
});

test('[docedit-send] 보낼 글: 이름·연락처는 자리 표시로, 명단·주민번호 줄과 이름만 든 칸은 보내지 않음, 되돌리기', () => {
  const p = payloadOf(startItems(LINES));
  const ids = p.sent.map(x => x.id), all = p.sent.map(x => x.text).join('\n');
  assert.ok(!ids.includes(5) && !ids.includes(6) && !ids.includes(8), JSON.stringify(ids));
  assert.equal(p.held, 3);
  assert.ok(!/이바다|김하늘|한가람|041-123-4567|080101/.test(all), all);
  const s = p.sent.find(x => x.id === 4);
  assert.match(s.text, /〔이름1〕/); assert.match(s.text, /\{\{1\}\}/);
  assert.equal(p.back(s.text), LINES[4].text);
  assert.ok(p.sent.find(x => x.id === 7).box, '표 칸 표시');
});

test('[docedit-ask] 선생님이 적은 요청의 이름·연락처도 가림(줄과 같은 자리 표시 번호), 명단 같은 요청은 보내지 않음(null)', () => {
  const p = payloadOf(startItems(LINES), '이바다 선생님 줄을 한가람 주무관께 맞게 고쳐 줘. 문의 010-2222-3333');
  assert.ok(p.ask && !/이바다|한가람|010-2222-3333/.test(p.ask), p.ask);
  // 〔이름2〕는 이름만 든 칸의 김하늘(보내지 않는 줄의 이름도 배움)
  assert.equal(p.ask, '〔이름1〕 선생님 줄을 〔이름3〕 주무관께 맞게 고쳐 줘. 문의 {{2}}');
  assert.equal(p.back(p.ask), '이바다 선생님 줄을 한가람 주무관께 맞게 고쳐 줘. 문의 010-2222-3333');
  assert.equal(payloadOf(startItems(LINES), '김하늘 080101-3123456 줄을 지워 줘').ask, null);
  assert.equal(payloadOf(startItems(LINES)).ask, '');
});

test('[docedit-batch] 묶음: 약 12,000자·250줄을 넘으면 앞에서부터 나눔', () => {
  const many = Array.from({ length: 600 }, (_, i) => ({ id: i + 1, text: `${i + 1}번째 줄입니다.` }));
  const b = batchLines(many);
  assert.deepEqual(b.map(x => x.length), [250, 250, 100]);
  const long = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, text: '가'.repeat(5000) }));
  assert.deepEqual(batchLines(long).map(x => x.length), [2, 2, 1]);
  assert.deepEqual(batchLines([]), []);
});

test('[docedit-prompt] 요청·[줄번호] 글·표 칸 번호·답 꼴(JSON), 긴 문서는 몇째 묶음인지', () => {
  const p = payloadOf(startItems(LINES));
  const t = docPrompt({ ask: '공문체로 다듬어 줘', lines: p.sent, part: [1, 2] });
  assert.ok(t.startsWith('[문서 다듬기]'));
  assert.ok(t.includes('공문체로 다듬어 줘') && t.includes('[2] 1. 목적') && t.includes('[3]   가. 책 읽는 즐거움을 알게 하고자 함.'), t);
  assert.ok(/표 칸 줄: 7, 9/.test(t), t);
  assert.ok(t.includes('"changes"') && t.includes('"replace"') && t.includes('"delete"') && t.includes('"after"'));
  assert.ok(t.includes('1/2'));
  assert.ok(!docPrompt({ ask: 'x', lines: [{ id: 1, text: '가' }] }).includes('표 칸 줄'));
});

test('[docedit-norm] AI 답 정리: 보낸 번호만, 빈 replace·같은 글은 버림, 이름 되돌림, 줄바꿈은 뒤에 더하기로, note', () => {
  const p = payloadOf(startItems(LINES)), ids = new Set(p.sent.map(x => x.id));
  const v = { changes: [
    { id: 2, op: 'replace', text: '1. 운영 목적' },
    { id: '[3]', op: 'replace', text: '[3] 가. 책 읽는 즐거움을 알게 함.' },
    { id: 4, op: 'replace', text: '담당: 교무부장 〔이름1〕 선생님({{1}}) 진행' },
    { id: 5, op: 'replace', text: '명단 줄은 보내지 않았음' }, // 보내지 않은 줄
    { id: 99, op: 'delete' }, // 없는 줄
    { id: 9, op: 'replace', text: '   ' }, // 빈 replace
    { id: 7, op: 'remove' },
    { id: 1, op: 'insert', text: '2. 방침\n  가. 날마다 읽음.' },
    { id: 2, op: 'after', text: '' },
    { id: 3, op: 'fly', text: 'x' }
  ], note: '공문체로 바꿨어요. 〔이름1〕 선생님 줄은 그대로' };
  const r = normChanges(v, { ids, back: p.back });
  assert.deepEqual(r.changes, [
    { id: 2, op: 'replace', text: '1. 운영 목적' },
    { id: 3, op: 'replace', text: '가. 책 읽는 즐거움을 알게 함.' },
    { id: 4, op: 'replace', text: '담당: 교무부장 이바다 선생님(041-123-4567) 진행' },
    { id: 7, op: 'delete', text: '' },
    { id: 1, op: 'after', text: '2. 방침' },
    { id: 1, op: 'after', text: '  가. 날마다 읽음.' }
  ]);
  assert.equal(r.note, '공문체로 바꿨어요. 이바다 선생님 줄은 그대로');
  // replace의 줄바꿈: 첫 줄은 바꾸고 나머지는 뒤에 더하기, 배열만 온 답도
  assert.deepEqual(normChanges([{ id: 2, op: 'replace', text: '1. 목적\n2. 방침' }], { ids, back: p.back }).changes,
    [{ id: 2, op: 'replace', text: '1. 목적' }, { id: 2, op: 'after', text: '2. 방침' }]);
  assert.deepEqual(normChanges(null, { ids }).changes, []);
});

test('[docedit-apply] 바꾸기·지우기·뒤에 더하기 → 바뀐 줄(전→후·지움·더함), 앞 공백은 지킴, 줄마다·모두 되돌리기', () => {
  const it0 = startItems(LINES);
  const it1 = applyChanges(it0, [
    { id: 3, op: 'replace', text: '가. 책 읽는 즐거움을 알게 함.' }, // 앞 공백을 빼먹은 답
    { id: 2, op: 'delete' },
    { id: 3, op: 'after', text: '나. 날마다 10분 읽음.' },
    { id: 3, op: 'after', text: '  다. 독서 기록장을 씀.' }
  ]);
  assert.notEqual(it1, it0, '새 목록');
  assert.equal(it0[2].text, LINES[3].text, '앞 목록은 그대로');
  const ch = changesOf(it1);
  assert.deepEqual(ch.map(c => [c.kind, c.before, c.after]), [
    ['del', '1. 목적', ''],
    ['edit', '  가. 책 읽는 즐거움을 알게 하고자 함.', '  가. 책 읽는 즐거움을 알게 함.'],
    ['add', '', '  나. 날마다 10분 읽음.'],
    ['add', '', '  다. 독서 기록장을 씀.']
  ]);
  const added = ch.filter(c => c.kind === 'add').map(c => c.id);
  assert.deepEqual(added, [10, 11], '더한 줄 번호는 이어서');
  // 바뀌지 않은 줄은 묶음으로
  const v = viewOf(it1);
  assert.equal(v[0].type, 'same'); assert.equal(v[0].items.length, 1);
  assert.equal(v[1].type, 'change');
  // 줄마다 되돌리기: 지운 줄은 살아나고, 더한 줄은 빠짐
  const it2 = revertOne(revertOne(it1, 2), 10);
  assert.deepEqual(changesOf(it2).map(c => c.kind), ['edit', 'add']);
  assert.ok(it2.find(x => x.id === 2).text === '1. 목적' && !it2.find(x => x.id === 2).del);
  assert.deepEqual(changesOf(revertAll(it1)), []);
  assert.equal(revertAll(it1).length, it0.length);
});

test('[docedit-iter] 이어서 고치기: 고친 글 위에, 더한 줄도 번호가 있어 다시 고치고 지울 수 있음, 지운 줄은 보내지 않음', () => {
  const it1 = applyChanges(startItems(LINES), [{ id: 2, op: 'delete' }, { id: 3, op: 'after', text: '  나. 날마다 읽음.' }, { id: 4, op: 'replace', text: '담당: 교무부장 이바다 선생님' }]);
  const p = payloadOf(it1);
  assert.ok(!p.sent.some(x => x.id === 2), '지운 줄');
  assert.ok(p.sent.some(x => x.id === 10 && x.text === '  나. 날마다 읽음.'), '더한 줄');
  assert.ok(p.sent.some(x => x.id === 4 && x.text === '담당: 교무부장 〔이름1〕 선생님'), '고친 글 위에');
  const it2 = applyChanges(it1, [{ id: 10, op: 'replace', text: '  나. 날마다 10분 읽음.' }]);
  assert.equal(changesOf(it2).find(c => c.id === 10).after, '  나. 날마다 10분 읽음.');
  assert.ok(!applyChanges(it2, [{ id: 10, op: 'delete' }]).some(x => x.id === 10), '더한 줄을 지우면 빠짐');
});

test('[docedit-hist] 한 단계 되돌리기: 최근 10단계까지', () => {
  let h = [];
  for (let i = 0; i < 13; i++) h = pushHist(h, [{ id: i }]);
  assert.equal(HIST_MAX, 10);
  assert.equal(h.length, 10);
  assert.deepEqual(h[0], [{ id: 3 }]);
  assert.deepEqual(h[9], [{ id: 12 }]);
});

test('[docedit-swap] 날짜·학년도 바꾸기: 문서에서 학년도를 짐작, AI 없이 그 글이 든 줄만(보내지 않는 줄도), 지운 줄은 그대로', () => {
  assert.deepEqual(guessSwap(startItems(LINES)), { from: '2026학년도', to: '2027학년도' });
  assert.deepEqual(guessSwap(startItems([L('2025년 행사 안내')])), { from: '2025년', to: '2026년' });
  assert.deepEqual(guessSwap(startItems([L('행사 안내')])), { from: '', to: '' });
  const lines = [L('2026학년도 계획'), L('2026학년도 2026학년도'), L('김하늘 080101-3123456 2026학년도'), L('관계없는 줄')];
  const it = applyChanges(startItems(lines), [{ id: 4, op: 'delete' }]);
  const r = swapItems(it, '2026학년도', '2027학년도');
  assert.equal(r.n, 3);
  assert.deepEqual(r.items.map(x => x.text), ['2027학년도 계획', '2027학년도 2027학년도', '김하늘 080101-3123456 2027학년도', '관계없는 줄']);
  assert.ok(r.items[3].del);
  assert.equal(swapItems(it, '', 'x').n, 0);
});

test('[docedit-edits] 목록 → .hwpx 편집: 원래 줄 차례마다 글·지우기, 더한 줄은 앞 원래 줄 뒤에 차례대로(본은 그 줄)', () => {
  const it = applyChanges(startItems(LINES), [
    { id: 3, op: 'replace', text: '  가. 즐거움을 알게 함.' }, { id: 2, op: 'delete' },
    { id: 3, op: 'after', text: '  나. 하나' }, { id: 3, op: 'after', text: '  다. 둘' }, { id: 9, op: 'after', text: '(방학 포함)' }
  ]);
  const ed = editsOf(it);
  assert.deepEqual(Object.keys(ed).map(Number).sort((a, b) => a - b), [2, 3, 9]);
  assert.deepEqual(ed[2], { del: true, after: [] });
  assert.deepEqual(ed[3], { text: '  가. 즐거움을 알게 함.', after: [{ text: '  나. 하나', tpl: 3 }, { text: '  다. 둘', tpl: 3 }] });
  assert.deepEqual(ed[9], { after: [{ text: '(방학 포함)', tpl: 9 }] });
});

test('[docedit-plain] 글만 읽은 파일(.hwp·워드·PDF·글) → 쌤비서 기본 문서: 첫 줄은 제목, 탭으로 나뉜 줄은 표, 빈 줄은 하나로', () => {
  const lines = ['가을 운동회 안내', '', '', '1. 일시: 10. 2.(금)', '구분\t내용', '장소\t운동장', '', '끝.'].map(t => L(t));
  const it = applyChanges(startItems(lines), [{ id: 2, op: 'replace', text: '1. 일시: 2026. 10. 2.(금)' }]);
  const d = plainDoc(lines, it);
  assert.equal(d.title, '가을 운동회 안내');
  assert.deepEqual(d.blocks, [
    { type: 'p', text: '' },
    { type: 'p', text: '1. 일시: 2026. 10. 2.(금)' },
    { type: 'table', rows: [['구분', '내용'], ['장소', '운동장']] },
    { type: 'p', text: '' },
    { type: 'p', text: '끝.' }
  ]);
});

test('[docedit-hwpx] 한글 문서 고치기 끝까지: 줄 목록 → 고치기·지우기·더하기·학년도 바꾸기 → .hwpx → 다시 읽으면 바뀐 글, 표 칸 줄 수 그대로', async () => {
  const { makeHwpx } = await import('../../web/core/hwpx.js');
  const { readForm } = await import('../../web/core/hwpx-form.js');
  const { writeHwpx } = await import('../../web/core/hwpx-edit.js');
  const form = await readForm(makeHwpx({ title: '2026학년도 새싹초등학교 독서교육 운영 계획', blocks: [
    { type: 'p', text: '1. 목적' }, { type: 'p', text: '  가. 책 읽는 즐거움을 알게 하고자 함.' },
    { type: 'table', rows: [['구분', '내용'], ['담당', '교무부장 이바다']] }, { type: 'p', text: '붙임  계획서 1부.  끝.' }] }));
  let it = startItems(form.lines);
  const id = t => it.find(x => x.text === t).id;
  it = applyChanges(it, [{ id: id('1. 목적'), op: 'replace', text: '1. 운영 목적' }, { id: id('구분'), op: 'delete' },
    { id: id('  가. 책 읽는 즐거움을 알게 하고자 함.'), op: 'after', text: '나. 날마다 10분 읽음.' }]);
  it = swapItems(it, '2026학년도', '2027학년도').items;
  const out = await readForm(writeHwpx(form, editsOf(it)).bytes), t = out.lines.map(l => l.text);
  assert.deepEqual(t.filter(x => x.trim()), ['2027학년도 새싹초등학교 독서교육 운영 계획', '1. 운영 목적', '  가. 책 읽는 즐거움을 알게 하고자 함.', '  나. 날마다 10분 읽음.', '내용', '담당', '교무부장 이바다', '붙임  계획서 1부.  끝.']);
  assert.equal(out.lines.filter(l => l.inBox).length, form.lines.filter(l => l.inBox).length);
});

/* ---------- 2026-11-15 검토 고침 ---------- */
const NAMES = /김하늘|이바다|한가람|박솔빛/;
const sentOf = p => p.sent.map(x => x.text).join('\n');

test('[docedit-roster] 한 줄에 한 명씩 적힌 명렬표(여러 줄에 걸친 명단)의 이름도 보내지 않음', () => {
  const lines = ['3학년 2반 명렬표', '1 김하늘 남', '2 이바다 여', '3 한가람 남', '4 박솔빛 여'];
  const p = payloadOf(startItems(lines.map(t => L(t))));
  assert.ok(!NAMES.test(sentOf(p)), sentOf(p));
  p.sent.forEach(x => assert.equal(p.back(x.text), lines[x.id - 1]));
});

test('[docedit-known] 한 줄에서 알아낸 이름은 앞·뒤 다른 줄·요청에서도 가림, 이어서 고치기는 이 문서의 원래 글에서 이름을 배움', () => {
  for (const n of ['김하늘', '박솔빛']) {
    for (const lines of [[`${n} 학생이 최우수상을 받았습니다.`, `시상: ${n}(3-2), 12월 2일`], [`시상: ${n}(3-2), 12월 2일`, `${n} 학생이 최우수상을 받았습니다.`]]) {
      const p = payloadOf(startItems(lines.map(t => L(t))));
      assert.equal(p.sent.length, 2);
      assert.ok(!sentOf(p).includes(n), sentOf(p));
      assert.deepEqual(p.sent.map(x => p.back(x.text)), lines);
    }
    // 「이어서 고치기」: AI가 「학생」을 뺀 글 — 원래 글(orig)에 「학생」이 있음
    const it = applyChanges(startItems([L(`3학년 ${n} 학생이 독서 골든벨에서 최우수상을 받았습니다.`)]), [{ id: 1, op: 'replace', text: `독서 골든벨 최우수상: 3학년 ${n}` }]);
    const p2 = payloadOf(it);
    assert.ok(!sentOf(p2).includes(n), sentOf(p2));
    assert.equal(p2.back(p2.sent[0].text), `독서 골든벨 최우수상: 3학년 ${n}`);
  }
  // 요청에서 알아낸 이름도 줄에서 가림(같은 자리 표시)
  const p3 = payloadOf(startItems([L('시상: 박솔빛(3-2), 12월 2일')]), '박솔빛 학생 줄을 짧게 줄여 줘');
  assert.ok(!sentOf(p3).includes('박솔빛') && !p3.ask.includes('박솔빛'), sentOf(p3) + ' / ' + p3.ask);
  assert.equal(p3.sent[0].text.match(/〔이름\d+〕/)[0], p3.ask.match(/〔이름\d+〕/)[0]);
});

test('[docedit-held] 보내지 않는 줄(명단 줄·주민번호 줄·이름만 든 칸)에 있던 이름도 다른 줄에서 가림, 그 줄은 그대로·보내지 않음', () => {
  const lines = [L('참석: 한가람, 이바다, 박솔빛'), L('이름', true), L('김하늘', true), L('박솔빛 발표 준비, 이바다 사회'), L('김하늘 우유 당번')];
  const it = startItems(lines), p = payloadOf(it);
  assert.deepEqual(p.sent.map(x => x.id), [2, 4, 5]);
  assert.equal(p.held, 2);
  assert.ok(!NAMES.test(sentOf(p)), sentOf(p));
  assert.equal(p.back(p.sent.find(x => x.id === 4).text), '박솔빛 발표 준비, 이바다 사회');
  assert.deepEqual(it.map(x => x.text), lines.map(l => l.text), '줄은 그대로');
});

test('[docedit-bad] 자리 표시가 깨진 AI 답(없는 번호·{{1·[이름1])은 버리고 원래 줄을 둠, 버린 줄 수', () => {
  const p = payloadOf(startItems(LINES)), ids = new Set(p.sent.map(x => x.id));
  const tok = p.sent.find(x => x.id === 4).text.match(/〔이름\d+〕/)[0];
  const r = normChanges({ changes: [
    { id: 4, op: 'replace', text: '담당: 교무부장 〔이름7〕 선생님({{1}})' }, // 없는 번호
    { id: 2, op: 'replace', text: '1. 운영 목적' },
    { id: 3, op: 'after', text: '나. {{1 로 연락' }, // 깨진 자리 표시
    { id: 9, op: 'replace', text: '[이름1] 2026. 3. ~' },
    { id: 7, op: 'delete' },
    { id: 4, op: 'after', text: `${tok} 선생님 확인` }
  ] }, { ids, back: p.back, bad: p.bad });
  assert.deepEqual(r.changes, [{ id: 2, op: 'replace', text: '1. 운영 목적' }, { id: 7, op: 'delete', text: '' }, { id: 4, op: 'after', text: '이바다 선생님 확인' }]);
  assert.equal(r.broken, 3);
  assert.equal(normChanges({ changes: [{ id: 2, op: 'replace', text: '1. 운영 목적' }] }, { ids, back: p.back, bad: p.bad }).broken, 0);
});

test('[docedit-br] 문단 안 줄바꿈: ⏎로 보내고(프롬프트에 그대로 두라고), 돌아온 ⏎는 줄바꿈으로, AI가 빼먹으면 원래 자리(앞뒤 낱말 사이 빈칸)에 되살림', () => {
  const it = startItems([L('가정통신문 제2026-15호\n2026. 11. 15.'), L('담당: 교무부장 이바다 선생님\n  (041-123-4567)'), L('한 줄')]);
  const p = payloadOf(it);
  assert.equal(p.sent[0].text, '가정통신문 제2026-15호⏎2026. 11. 15.');
  assert.match(p.sent[1].text, /^담당: 교무부장 〔이름\d+〕 선생님⏎ {2}\(\{\{1\}\}\)$/);
  assert.ok(p.sent.every(x => !x.text.includes('\n')), '보낼 글에 줄바꿈 없음');
  const prompt = docPrompt({ ask: '공문체로', lines: p.sent });
  assert.ok(/⏎/.test(prompt.split('[줄]')[0]), '⏎ 안내');
  assert.ok(!docPrompt({ ask: 'x', lines: [{ id: 1, text: '가' }] }).includes('⏎'), '줄바꿈이 없으면 안내도 없음');
  const ids = new Set(p.sent.map(x => x.id));
  const r = normChanges({ changes: [
    { id: 1, op: 'replace', text: '가정통신문 제2026-15호 ⏎2026. 11. 16.' },
    { id: 2, op: 'replace', text: p.sent[1].text.replace('교무부장', '교무부장님') },
    { id: 3, op: 'replace', text: '한 줄⏎둘째 줄\n새 문단' }
  ], note: '날짜를 고쳤어요.⏎줄바꿈은 그대로' }, { ids, back: p.back, bad: p.bad });
  assert.equal(r.note, '날짜를 고쳤어요. 줄바꿈은 그대로');
  assert.deepEqual(r.changes, [
    { id: 1, op: 'replace', text: '가정통신문 제2026-15호\n2026. 11. 16.' },
    { id: 2, op: 'replace', text: '담당: 교무부장님 이바다 선생님\n  (041-123-4567)' },
    { id: 3, op: 'replace', text: '한 줄\n둘째 줄' },
    { id: 3, op: 'after', text: '새 문단' }
  ]);
  // AI가 ⏎를 빼먹고 빈칸으로 이었으면 원래 자리에(다음 줄 앞 공백도), 앞뒤 낱말이 바뀌었으면 그대로
  const it2 = applyChanges(it, [
    { id: 1, op: 'replace', text: '가정통신문 제2026-15호 2026. 11. 16.' },
    { id: 2, op: 'replace', text: '담당: 교무부장 이바다 선생님 (041-123-4567) 확인' },
    { id: 3, op: 'replace', text: '한 줄입니다' }
  ]);
  assert.deepEqual(it2.map(x => x.text), ['가정통신문 제2026-15호\n2026. 11. 16.', '담당: 교무부장 이바다 선생님\n  (041-123-4567) 확인', '한 줄입니다']);
  assert.equal(applyChanges(it, [{ id: 1, op: 'replace', text: '가정통신문 제15호 11월 16일' }])[0].text, '가정통신문 제15호 11월 16일');
});

test('[docedit-br-hwpx] 문단 안 줄바꿈(<hp:lineBreak/>)이 든 줄을 AI로 고쳐도 내려받은 .hwpx에 줄바꿈이 남음', async () => {
  const { readForm, checkXml } = await import('../../web/core/hwpx-form.js');
  const { writeHwpx } = await import('../../web/core/hwpx-edit.js');
  const { unzip } = await import('../../web/core/zip.js');
  const { PARA, RUN, handForm } = await import('./hwpx-hand.mjs');
  const form = await readForm(await handForm(secPr => PARA(`<hp:run charPrIDRef="0">${secPr}</hp:run>${RUN(0, '가정통신문')}`)
    + PARA('<hp:run charPrIDRef="0"><hp:t>새싹초등학교 제2026-15호<hp:lineBreak/>2026. 11. 15.</hp:t></hp:run>')));
  // AI가 ⏎를 둔 답, 빼먹고 빈칸으로 이은 답(줄바꿈 앞뒤 낱말은 그대로)
  for (const [ai, xml, text] of [['새싹초등학교 제2026-16호⏎2026. 11. 16.', '제2026-16호<hp:lineBreak/>2026. 11. 16.', '새싹초등학교 제2026-16호\n2026. 11. 16.'],
    ['새싹초등학교 제2026-15호 2026. 11. 16.', '제2026-15호<hp:lineBreak/>2026. 11. 16.', '새싹초등학교 제2026-15호\n2026. 11. 16.']]) {
    let it = startItems(form.lines);
    const p = payloadOf(it), x = p.sent.find(s => s.text.includes('⏎'));
    assert.ok(x, JSON.stringify(p.sent));
    it = applyChanges(it, normChanges({ changes: [{ id: x.id, op: 'replace', text: ai }] }, { ids: new Set([x.id]), back: p.back, bad: p.bad }).changes);
    const bytes = writeHwpx(form, editsOf(it)).bytes, sec = new TextDecoder().decode((await unzip(bytes)).get('Contents/section0.xml'));
    assert.doesNotThrow(() => checkXml(sec));
    assert.ok(sec.includes(xml), ai + ' → ' + sec.slice(sec.indexOf('새싹'), sec.indexOf('새싹') + 120));
    assert.ok((await readForm(bytes)).lines.some(l => l.text === text), ai);
  }
});

test('[docedit-chips] 빠른 요청: 공문체·짧게·맞춤법·쉬운 말·날짜 바꾸기(AI 없이)·번호 꼴', () => {
  assert.deepEqual(CHIPS.map(c => c.label), ['공문체로', '짧게(절반쯤)', '맞춤법·띄어쓰기', '쉬운 말로(학부모용)', '날짜·학년도 바꾸기', '번호 꼴 맞추기']);
  assert.ok(CHIPS.filter(c => c.id !== 'swap').every(c => c.ask && c.ask.length > 8));
  assert.ok(!CHIPS.find(c => c.id === 'swap').ask);
});
