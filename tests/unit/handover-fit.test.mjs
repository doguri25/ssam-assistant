// 업무 인수인계서 「몇 쪽으로」(2026-11-10): 쪽 수 어림(줄 수), fitPages가 줄이는 차례(빈 항목 → 일 없는 달 → 긴 표 → 긴 메모 → 표 더 → 달마다 할 일 → 업무 목표),
// 품의 합계는 그대로, 「1. 맡은 업무 한눈에」는 늘 남김, 알림 글, 「다음 담당자에게」 AI 줄 수, 학교 인수인계서 양식(.hwpx) 자리
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHandover, handoverText, handoverPrompt, normNote, noteRange, formRoles, formRolesOk } from '../../web/menus/etc/handover-model.js';
import { PAGES, PAGE_LINES, LINE_CHARS, CAP_ROWS, normPages, textLines, colChars, blockLines, docLines, estPages, oneLine, mergeEmptyMonths, fitPages, fitNotice } from '../../web/menus/etc/handover-fit.js';
import { makeHwpx } from '../../web/core/hwpx.js';
import { readForm, fillForm } from '../../web/core/hwpx-form.js';
import { docToLetter } from '../../web/core/body-table.js';
import { unzip } from '../../web/core/zip.js';

const MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];
const iso = (m, d) => `${m >= 3 ? 2026 : 2027}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const won = n => Number(n).toLocaleString('ko-KR');
/* 고른 자료(pickData 꼴): 품의 n개(작성일 차례, 금액 1,000·2,000…), 공문(짝수 번째는 끝냄), 행사·결과 보고, 학사일정은 달마다 하나(everyMonth) */
function data({ purchases = 8, docs = 4, events = 2, reports = 1, everyMonth = true, duties = 2, goal = '목표', eventMemo = '', taskCount = 0 } = {}) {
  return {
    year: 2026, school: '한빛초등학교', names: [],
    duties: Array.from({ length: duties }, (_, i) => ({ name: `업무 ${i + 1}`, goal, schedule: [] })),
    events: Array.from({ length: events }, (_, i) => ({ name: `행사 ${i + 1}`, date: '', status: '준비 중', memo: eventMemo })),
    purchases: Array.from({ length: purchases }, (_, i) => ({ title: `품의 ${i + 1}`, kind: '물품 구입', amount: 1000 * (i + 1), date: iso(3 + (i % 9), 1 + i) })),
    docs: Array.from({ length: docs }, (_, i) => ({ title: `공문 ${i + 1}`, due: '', dueNote: '', done: i % 2 === 0, tasks: Array.from({ length: taskCount }, (_, k) => ({ text: `할 일 ${k + 1} 챙기기`, due: '' })) })),
    reports: Array.from({ length: reports }, (_, i) => ({ title: `보고 ${i + 1}`, date: '', summary: '' })),
    calendar: everyMonth ? MONTHS.map(m => ({ date: iso(m, 15), title: '학사 일정' })) : []
  };
}
const doc = (o, note = '- 3월에 계획부터 확정해요.') => buildHandover(data(o), { note, today: '2026-11-06' });
const part = (d, p) => d.blocks.find(b => b.part === p && b.type === 'table');
const heads = d => d.blocks.filter(b => b.type === 'h').map(b => b.text);
const ZERO = { empty: 0, months: 0, memos: 0, purchases: 0, docs: 0, events: 0, reports: 0, monthItems: 0, goals: 0, over: false };
const cutOf = c => Object.fromEntries(Object.keys(ZERO).map(k => [k, c[k]]));
/* 품의 표: 보이는 금액(남긴 줄 + 「외 n건 합계」)의 합 = 맨 아래 합계. 다 뺐으면 표 대신 「품의 n건 · 합계 ○원」 한 줄 */
function budgetOk(d, total, count) {
  const t = part(d, 'budget');
  if (!t) {
    const p = d.blocks.find(b => b.part === 'budget' && b.type === 'p');
    assert.equal(p && p.text, `품의 ${count}건 · 합계 ${won(total)}원`);
    return;
  }
  const rows = t.rows, last = rows[rows.length - 1];
  assert.equal(last[0], '합계', '합계 줄이 없음');
  assert.equal(last[2], won(total), '합계 금액');
  const shown = rows.slice(1, -1).reduce((s, r) => s + Number(String(r[2]).replace(/,/g, '')), 0);
  assert.equal(shown, total, `보이는 금액 합 ${shown} ≠ ${total}`);
  const more = rows.find(r => /^외 \d+건 합계$/.test(r[0]));
  if (count != null) assert.equal(rows.length - 3 + (more ? +more[0].match(/\d+/)[0] : 1), count, '건수');
}
const sum = n => (n * (n + 1) / 2) * 1000;

test('쪽 수·줄 수 어림: 상수, 글 줄(한글 1·영문 0.55), 표 칸 너비, 쪽 수 고르기', () => {
  assert.equal(PAGE_LINES, 38); assert.equal(LINE_CHARS, 44); assert.equal(CAP_ROWS, 5);
  assert.deepEqual(PAGES, [1, 2, 3, 4, 5]);
  assert.deepEqual([1, 5, '2', 0, 6, -1, 2.5, null, '', 'x'].map(normPages), [1, 5, 2, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(textLines(''), 1);
  assert.equal(textLines('가'.repeat(44)), 1);
  assert.equal(textLines('가'.repeat(45)), 2);
  assert.equal(textLines('a'.repeat(80)), 1); // 80 × 0.55 = 44
  assert.equal(textLines('첫 줄\n둘째 줄\n'), 3);
  assert.equal(colChars(2), 21); assert.equal(colChars(4), 10); assert.equal(colChars(40), 4);
  assert.equal(blockLines({ type: 'h', text: '1. 맡은 업무' }), 1.7);
  assert.equal(blockLines({ type: 'table', rows: [['월', '할 일'], ['3월', '가\n나']] }), 1.25 + 2.25 + 0.5);
  assert.equal(blockLines({ type: 'table', rows: [] }), 0);
  assert.equal(docLines({ title: 'x', blocks: [] }), 2.5);
  assert.equal(estPages({ title: 'x', blocks: [] }), 1);
  assert.equal(estPages({ title: 'x', blocks: [{ type: 'p', text: Array(36).fill('줄').join('\n') }] }), 2); // 2.5 + 36 = 38.5
});

test('제한 없음(0)이거나 이미 들어가면 그대로(같은 문서), 알림은 어림 쪽 수', () => {
  const d = doc({ purchases: 3 });
  for (const p of [0, '', undefined, 9]) {
    const r = fitPages(d, p);
    assert.equal(r.doc, d); assert.deepEqual(cutOf(r.cut), ZERO); assert.equal(r.cut.pages, 0);
    assert.equal(fitNotice(r.cut), `쪽 수 제한 없이 만들어요(지금 약 ${estPages(d)}쪽).`);
  }
  const r = fitPages(d, 5);
  assert.equal(r.doc, d); assert.deepEqual(cutOf(r.cut), ZERO);
  assert.equal(fitNotice(r.cut), `5쪽 안에 들어가요(약 ${estPages(d)}쪽).`);
  assert.equal(fitPages(null, 2).doc, null);
});

test('빈 자료: 1쪽에 그대로 들어가고, 넘치게 해도 「1. 맡은 업무 한눈에」·「4. 예산 집행」은 남김', () => {
  const empty = buildHandover({ year: 2026, duties: [], events: [], purchases: [], docs: [], reports: [], calendar: [] }, {});
  assert.ok(docLines(empty) <= PAGE_LINES);
  const r = fitPages(empty, 1);
  assert.equal(r.doc, empty); assert.equal(fitNotice(r.cut), '1쪽 안에 들어가요(약 1쪽).');
  // 업무가 많아 넘치면: 없는 항목(월별·행사·공문·빈 「다음 담당자에게」)은 빼고 번호를 다시, 예산은 「(없음)」이어도 남김
  const many = buildHandover({ year: 2026, duties: Array.from({ length: 22 }, (_, i) => ({ name: `업무 ${i + 1}`, goal: '', schedule: [] })), events: [], purchases: [], docs: [], reports: [], calendar: [] }, {});
  assert.ok(docLines(many) > PAGE_LINES);
  const f = fitPages(many, 1);
  assert.deepEqual(heads(f.doc), ['1. 맡은 업무 한눈에', '2. 예산 집행']);
  assert.equal(f.cut.empty, 4); assert.equal(f.cut.over, false);
  assert.equal(part(f.doc, 'duties').rows.length, 23, '업무 줄을 뺌');
  assert.ok(f.doc.blocks.some(b => b.part === 'budget' && b.text === '(없음)'));
  assert.equal(fitNotice(f.cut), '1쪽에 맞추느라 없는 항목은 뺐어요.');
  assert.equal(heads(many).length, 6, '원래 문서를 고침');
});

test('딱 들어가면 그대로, 한 줄 넘치면 오래된 품의만 조금 「외 n건 합계」로(합계는 그대로)', () => {
  let n = 1;
  while (docLines(doc({ purchases: n + 1 })) <= 2 * PAGE_LINES) n++;
  const fit = doc({ purchases: n }), over = doc({ purchases: n + 1 });
  assert.ok(docLines(fit) <= 2 * PAGE_LINES && docLines(over) > 2 * PAGE_LINES && docLines(over) - docLines(fit) === 1.25, '한 줄 차이');
  const a = fitPages(fit, 2);
  assert.equal(a.doc, fit); assert.deepEqual(cutOf(a.cut), ZERO);
  const before = JSON.stringify(over);
  const b = fitPages(over, 2);
  assert.equal(JSON.stringify(over), before, '원래 문서를 고침');
  assert.ok(docLines(b.doc) <= 2 * PAGE_LINES, String(docLines(b.doc)));
  assert.deepEqual(cutOf(b.cut), { ...ZERO, purchases: 2 }); // 한 건만 빼면 「외 1건 합계」 줄이 생겨 줄지 않음 → 두 건
  const rows = part(b.doc, 'budget').rows;
  assert.deepEqual(rows[1].slice(0, 3), ['품의 3', '물품 구입', '3,000'], '가장 오래된 둘이 빠져야 함');
  assert.deepEqual(rows.at(-2), ['외 2건 합계', '', '3,000', '']);
  budgetOk(b.doc, sum(n + 1), n + 1);
  assert.equal(fitNotice(b.cut), '2쪽에 맞추느라 품의 2건을 줄였어요.');
  assert.equal(b.cut.before, 3); assert.equal(b.cut.after, 2);
});

test('긴 표는 줄이 많은 표부터 5줄까지(품의는 오래된 것, 공문은 끝낸 것부터), 합계·건수가 맞음', () => {
  const d = doc({ purchases: 30, docs: 12 });
  const r = fitPages(d, 2);
  assert.equal(r.cut.over, false);
  assert.ok(docLines(r.doc) <= 2 * PAGE_LINES);
  budgetOk(r.doc, sum(30), 30);
  const b = part(r.doc, 'budget').rows, kept = b.slice(1, -2);
  assert.ok(kept.length >= CAP_ROWS && kept.every((x, i) => i === 0 || +x[0].slice(3) > +kept[i - 1][0].slice(3)), '최근 것이 남고 차례 그대로');
  assert.equal(kept.at(-1)[0], '품의 30');
  assert.equal(b.at(-2)[0], `외 ${30 - kept.length}건 합계`);
  assert.equal(r.cut.purchases, 30 - kept.length);
  // 줄이 많은 표부터 번갈아: 품의 30 → 9, 공문 12 → 10(끝낸 1·3번째가 먼저 빠짐)
  assert.deepEqual(cutOf(r.cut), { ...ZERO, purchases: 21, docs: 2 });
  const g = part(r.doc, 'docs').rows;
  assert.deepEqual(g.at(-1), ['외 2건', '', '', '완료']);
  assert.deepEqual(g.slice(1, 3).map(x => x[0]), ['공문 2', '공문 4']);
  assert.equal(g.length - 2, 10);
  assert.equal(fitNotice(r.cut), '2쪽에 맞추느라 품의 21건·공문 2건을 줄였어요.');
});

test('없는 항목 먼저 빼고 일 없는 달은 합침(5·6월, 7~9월), 번호는 다시', () => {
  const ms = mergeEmptyMonths(MONTHS.map(m => ({ label: `${m}월`, items: [3, 4, 10, 11].includes(m) ? ['일'] : [], more: 0 })));
  assert.deepEqual(ms.map(m => m.label), ['3월', '4월', '5~9월', '10월', '11월', '12~2월']);
  assert.deepEqual(mergeEmptyMonths([{ label: '3월', items: [], more: 0 }, { label: '4월', items: [], more: 0 }, { label: '5월', items: ['x'], more: 0 }]).map(m => m.label), ['3·4월', '5월']);
  assert.deepEqual(mergeEmptyMonths([{ label: '3월', items: [], more: 0 }]).map(m => m.label), ['3월']);
  // 학사일정이 3·4월에만: 행사·공문 없음, 품의 많음 → 빈 항목 빼기 → 달 합치기 → 그래도 넘치면 품의
  const d = buildHandover({ ...data({ purchases: 26, docs: 0, events: 0, everyMonth: false }), calendar: [{ date: '2026-03-02', title: '입학식' }, { date: '2026-04-21', title: '과학의 날' }] }, { note: '- 메모' });
  const r = fitPages(d, 1);
  assert.deepEqual(heads(r.doc), ['1. 맡은 업무 한눈에', '2. 월별 할 일', '3. 예산 집행', '4. 다음 담당자에게']);
  assert.ok(r.cut.empty === 2 && r.cut.months === 9, JSON.stringify(r.cut));
  assert.deepEqual(part(r.doc, 'months').rows.map(x => x[0]), ['월', '3월', '4월', '5~2월']);
  assert.ok(r.cut.purchases > 0 && !r.cut.over);
  budgetOk(r.doc, sum(26), 26);
  // 「다음 담당자에게」는 번호가 바뀌어도 AI 글에서 빠짐
  const t = handoverText(r.doc);
  assert.ok(t.includes('외 ') && !t.includes('다음 담당자에게') && !t.includes('- 메모'), t.slice(-200));
  // 품의만 조금 넘치면(빈 항목·달 합치기로 들어감) 품의는 그대로
  const small = buildHandover({ ...data({ purchases: 4, docs: 0, events: 0, everyMonth: false }), calendar: [{ date: '2026-03-02', title: '입학식' }] }, { note: '' });
  const lines = docLines(small);
  const pages = Math.ceil(lines / PAGE_LINES);
  const s = fitPages(small, pages);
  assert.equal(s.doc, small, '이미 들어가는데 고침');
});

test('긴 메모(행사 고칠 점·공문 할 일)는 긴 표를 5줄로 줄인 뒤에도 넘칠 때 한 줄로(「…」)', () => {
  const memo = '점심시간을 늘려요. 방송 장비를 미리 점검해요. 비 오는 날 계획도 세워 둬요. 학부모 자리는 그늘로 옮겨요.';
  const d = doc({ purchases: 6, docs: 3, events: 6, taskCount: 3, eventMemo: memo });
  const lim = Math.ceil(docLines(d) / PAGE_LINES) - 1;
  const r = fitPages(d, lim);
  assert.ok(r.cut.memos > 0, JSON.stringify(r.cut));
  const ev = part(r.doc, 'events').rows.slice(1).filter(x => x[0].startsWith('행사'));
  const short = ev.filter(x => x[3].endsWith('…'));
  assert.ok(short.length > 0 && short.every(x => textLines(x[3], colChars(4)) === 1), JSON.stringify(short));
  assert.equal(oneLine('- 참가 학생 조사 (11. 13.)\n- 신청서 제출', 30), '참가 학생 조사 (11. 13.) · 신청서 제출');
  assert.equal(oneLine('가'.repeat(30), 10), `${'가'.repeat(9)}…`);
  assert.equal(oneLine('짧은 글', 10), '짧은 글');
  assert.match(fitNotice(r.cut), /긴 메모 \d+개를 줄였어요\.$/);
});

test('1쪽 극단: 많은 자료도 1쪽에(맡은 업무 줄·예산 합계는 남김), 업무만으로 넘치면 over', () => {
  const memo = '내년에는 준비를 일찍 시작하고 역할을 미리 나눠요. 장소 예약도 먼저 해요.';
  const big = buildHandover({
    ...data({ purchases: 40, docs: 15, events: 8, reports: 4, duties: 3, eventMemo: memo, taskCount: 3, goal: '탐구하는 즐거움을 느끼고 스스로 묻고 답하는 학생을 길러요' }),
    calendar: [3, 4, 5, 9, 10, 12].flatMap(m => [1, 8, 15, 22].map(d => ({ date: iso(m, d), title: `학사 일정 ${d}일` })))
  }, { note: '- 3월에 계획부터 확정해요.\n- 공문철은 교무실에 있어요.', today: '2026-11-06' });
  assert.ok(estPages(big) >= 4, String(estPages(big)));
  const r = fitPages(big, 1);
  assert.equal(r.cut.over, false, JSON.stringify(r.cut));
  assert.ok(docLines(r.doc) <= PAGE_LINES, String(docLines(r.doc)));
  assert.equal(r.cut.after, 1);
  assert.equal(heads(r.doc)[0], '1. 맡은 업무 한눈에');
  assert.deepEqual(part(r.doc, 'duties').rows.slice(1).map(x => x[0]), ['업무 1', '업무 2', '업무 3']);
  budgetOk(r.doc, sum(40), 40);
  assert.ok(r.doc.blocks.some(b => b.part === 'note' && b.text.includes('공문철')), '「다음 담당자에게」를 줄임');
  assert.ok(r.cut.purchases + r.cut.docs + r.cut.events + r.cut.reports > 0 && r.cut.monthItems > 0, JSON.stringify(r.cut));
  assert.match(fitNotice(r.cut), /^1쪽에 맞추느라 품의 \d+건·.*줄였어요\.$/);
  // 맡은 업무만으로도 1쪽을 넘으면 업무 줄은 빼지 않고 over
  const duties = buildHandover({ ...data({ duties: 40, purchases: 3 }) }, { note: '- 메모' });
  const o = fitPages(duties, 1);
  assert.equal(o.cut.over, true);
  assert.equal(part(o.doc, 'duties').rows.length, 41);
  budgetOk(o.doc, sum(3), 3);
  assert.equal(fitNotice(o.cut), `1쪽에 다 넣지 못했어요(줄여도 약 ${o.cut.after}쪽). 넣을 것을 더 빼 주세요.`);
});

test('알림 글: 줄인 것만, 받침에 맞는 조사', () => {
  const c = { pages: 2, before: 3, after: 2, ...ZERO };
  assert.equal(fitNotice({ ...c, purchases: 7, docs: 3 }), '2쪽에 맞추느라 품의 7건·공문 3건을 줄였어요.');
  assert.equal(fitNotice({ ...c, memos: 2 }), '2쪽에 맞추느라 긴 메모 2개를 줄였어요.');
  assert.equal(fitNotice({ ...c, events: 1, goals: 1, empty: 2 }), '2쪽에 맞추느라 행사 1건·업무 목표 1개를 줄였어요.');
  assert.equal(fitNotice({ ...c, months: 4 }), '2쪽에 맞추느라 일 없는 달은 줄였어요.');
  assert.equal(fitNotice({ ...c, months: 4, empty: 1 }), '2쪽에 맞추느라 없는 항목은 빼고 일 없는 달은 줄였어요.');
  assert.equal(fitNotice({ ...c, over: true, after: 3, purchases: 9 }), '2쪽에 다 넣지 못했어요(줄여도 약 3쪽). 넣을 것을 더 빼 주세요.');
  assert.equal(fitNotice(null), '');
});

test('「다음 담당자에게」 AI: 1~2쪽이면 줄 수를 줄여 부탁하고 그만큼만 받음', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 0].map(noteRange), [[2, 3], [3, 4], [3, 5], [3, 6], [3, 6], [3, 6]]);
  assert.ok(handoverPrompt('글').includes('3~6줄') && !handoverPrompt('글').includes('쪽에 맞추므로'));
  const p1 = handoverPrompt('글', { pages: 1 });
  assert.ok(p1.includes('2~3줄') && p1.includes('1쪽에 맞추므로 3줄을 넘기지 않습니다') && p1.endsWith('글'));
  assert.ok(handoverPrompt('글', { pages: 2 }).includes('3~4줄'));
  const lines = { lines: ['하나', '둘', '셋', '넷', '다섯', '여섯', '일곱'] };
  assert.equal(normNote(lines).length, 6);
  assert.deepEqual(normNote(lines, [], noteRange(1)[1]), ['하나', '둘', '셋']);
  assert.equal(normNote(lines, [], 0).length, 1);
});

test('학교 인수인계서 양식(.hwpx): 제목·본문 자리(결재란·인계자 줄·학교장 줄은 그대로), {본문} 표시, 채우기', async () => {
  const form = async blocks => readForm(makeHwpx({ title: '업무 인수인계서', blocks }));
  const a = await form([{ type: 'table', rows: [['결재', '담당', '부장', '교감']] }, { type: 'p', text: '인계자: 교사 (서명)' }, { type: 'p', text: '인수자: 교사 (서명)' },
    { type: 'p', text: '1. 맡은 업무' }, { type: 'p', text: '2. 넘길 것' }, { type: 'p', text: '2027. 2. 26.' }, { type: 'p', text: '새싹초등학교장' }]);
  const r = formRoles(a.lines);
  assert.deepEqual(r, { title: 0, bodyStart: 7, bodyEnd: 8, date: 9, sign: -1, reply: -1 });
  assert.ok(formRolesOk(r));
  const d = fitPages(doc({ purchases: 30 }), 2).doc;
  const { bytes, warn } = await fillForm(a, r, { ...docToLetter(d), date: '2026-11-06', reply: null });
  assert.deepEqual(warn, []);
  const x = new TextDecoder().decode((await unzip(bytes)).get('Contents/section0.xml'));
  for (const w of ['2026학년도 업무 인수인계서', '맡은 업무 한눈에', '외 ', '합계', '결재', '인계자: 교사 (서명)', '새싹초등학교장', '2026. 11. 6.']) assert.ok(x.includes(w), w);
  assert.ok(!x.includes('2. 넘길 것') && !x.includes('2027. 2. 26.'), '옛 본문·날짜가 남음');
  // {제목}·{본문}·{날짜} 표시
  const b = await form([{ type: 'p', text: '{제목}' }, { type: 'p', text: '{본문}' }, { type: 'p', text: '인계일: {날짜}' }]);
  assert.deepEqual(formRoles(b.lines), { title: 1, bodyStart: 2, bodyEnd: 2, date: 3, sign: -1, reply: -1 });
  const c = await form([{ type: 'p', text: '{본문}' }]);
  assert.deepEqual(formRoles(c.lines), { title: 0, bodyStart: 1, bodyEnd: 1, date: -1, sign: -1, reply: -1 });
  // 표뿐인 양식은 못 찾음(양식 맞추기) — 제목만
  const t = await form([{ type: 'table', rows: [['업무명', ''], ['추진 현황', '']] }]);
  const rt = formRoles(t.lines);
  assert.ok(rt.title === 0 && rt.bodyStart < 0 && !formRolesOk(rt), JSON.stringify(rt));
  assert.deepEqual(formRoles([]), { title: -1, bodyStart: -1, bodyEnd: -1, date: -1, sign: -1, reply: -1 });
  // 자리 검사: 제목 < 본문 시작 ≤ 끝, 날짜는 없거나 본문 밖(머리의 인계일도 됨)
  assert.ok(formRolesOk({ title: 0, bodyStart: 2, bodyEnd: 4, date: 1 }));
  assert.ok(!formRolesOk({ title: 0, bodyStart: 2, bodyEnd: 4, date: 3 }));
  assert.ok(!formRolesOk({ title: 0, bodyStart: 2, bodyEnd: 4, date: 0 }));
  assert.ok(!formRolesOk({ title: 3, bodyStart: 2, bodyEnd: 4, date: -1 }));
  assert.ok(!formRolesOk({ title: 0, bodyStart: 4, bodyEnd: 2 }));
  assert.ok(!formRolesOk(null));
});

test('양식: 본문 줄 사이의 인계자·인수자 표·서명 줄은 지우지 않음(본문은 이어진 글 줄만, 맨 아래 쪽 묶음)', async () => {
  const f = await readForm(makeHwpx({ title: '새싹초 업무 인수인계서', blocks: [
    { type: 'p', text: '다음과 같이 업무를 인계·인수합니다.' },
    { type: 'table', rows: [['인계자', '김가람'], ['인수자', '이솔']] },
    { type: 'p', text: '1. 맡은 업무' }, { type: 'p', text: '2. 넘길 일' },
    { type: 'p', text: '2026. 2. 27.' }, { type: 'p', text: '새싹초등학교장' }] }));
  const r = formRoles(f.lines);
  assert.ok(formRolesOk(r), JSON.stringify(r));
  for (let k = r.bodyStart; k <= r.bodyEnd; k++) assert.ok(!f.lines[k].inBox, `본문 자리에 표 칸(${k}: ${f.lines[k].text})`);
  const { bytes } = await fillForm(f, r, { ...docToLetter(fitPages(doc({ purchases: 3 }), 0).doc), date: '2026-11-10', reply: null });
  const x = new TextDecoder().decode((await unzip(bytes)).get('Contents/section0.xml'));
  for (const w of ['인계자', '김가람', '인수자', '이솔', '새싹초등학교장', '맡은 업무 한눈에']) assert.ok(x.includes(w), w);
  assert.ok(!x.includes('2. 넘길 일'), '옛 본문이 남음');
  // 본문 사이에 「인계자: (서명)」 줄이 끼어도 그 줄은 남김
  const g = await readForm(makeHwpx({ title: '업무 인수인계서', blocks: [
    { type: 'p', text: '가. 머리말' }, { type: 'p', text: '인계자: 교사 (서명)' }, { type: 'p', text: '1. 맡은 업무' }, { type: 'p', text: '2. 넘길 일' }] }));
  const rg = formRoles(g.lines);
  for (let k = rg.bodyStart; k <= rg.bodyEnd; k++) assert.ok(!/인계자/.test(g.lines[k].text), '서명 줄이 본문 자리에');
});
