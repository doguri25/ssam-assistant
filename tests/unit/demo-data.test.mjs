// 3분 둘러보기(스펙 2026-11-13-miss-tour-check §3)의 체험 자료: AI 없이 만들고, 학년도 키만(공통 키 없음), 이름은 지어낸 것만,
// 다 채점한 단원평가(예시 표시 meta.sample 없음 — 「도달하지 못한 학생」에 학생이 나옴), 기초학력 사전·사후 점수, 근거가 붙은 교과 평어,
// 오늘 수업 시간표·진도, 공문 기한. 만들 때 진짜 저장소는 건드리지 않음
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { demoSnapshot, DEMO_NAMES } from '../../web/core/demo-data.js';
import { isYearKey, GLOBAL, DEMO_YEAR } from '../../web/core/years.js';
import { gapStudents } from '../../web/menus/evaluate/unit/unit-gap.js';
import { normCamp, sessionsOn } from '../../web/menus/class/camp-model.js';
import { growthChange } from '../../web/menus/class/camp-growth.js';
import { dueSoon } from '../../web/menus/etc/gongmun-ai.js';
import { slotsOn, normTimetable } from '../../web/menus/class/class-model.js';
import { joinSentences } from '../../web/core/evidence.js';
import { maskPersons } from '../../web/core/chat-names.js';

const T = '2026-11-13'; // 금요일
const P = (snap, k) => JSON.parse(snap[k]);
const tests = snap => P(snap, 'unit:list').map(s => P(snap, 'unit:t:' + s.id));

test('학년도 키만, 값은 저장된 글(JSON) 그대로', () => {
  const snap = demoSnapshot(T);
  const keys = Object.keys(snap);
  assert.ok(keys.length >= 8, keys.join(','));
  for (const k of keys) {
    assert.ok(isYearKey(k), `공통 키: ${k}`);
    assert.ok(!GLOBAL.includes(k) && !k.startsWith('ssam:') && !k.startsWith('mig:'), k);
    assert.equal(typeof snap[k], 'string', k);
    JSON.parse(snap[k]);
  }
  for (const k of ['class', 'class:info', 'class:timetable', 'class:subjects', 'camp', 'gongmun:list', 'unit:list', 'unit:pyeongeo:국어', 'school']) assert.ok(k in snap, `없음: ${k}`);
});

test('학급 명단은 번호만(학생 수), 학급 정보는 학년·반, 학교 이름은 지어낸 「새싹초등학교」', () => {
  const snap = demoSnapshot(T);
  const c = P(snap, 'class');
  assert.ok(Number.isInteger(c.count) && c.count >= 6 && c.count <= 30, JSON.stringify(c));
  assert.deepEqual(Object.keys(c).sort(), ['at', 'count', 'except']);
  const info = P(snap, 'class:info');
  assert.ok(info.grade >= 1 && info.grade <= 6 && info.room >= 1, JSON.stringify(info));
  assert.equal(P(snap, 'school').name, '새싹초등학교');
});

test('단원평가 2~3개: 다 채점, 예시 표시(meta.sample) 없음 → 「도달하지 못한 학생」에 학생이 나옴', () => {
  const snap = demoSnapshot(T), ts = tests(snap);
  assert.ok(ts.length >= 2 && ts.length <= 3, String(ts.length));
  for (const t of ts) {
    assert.ok(t.done, t.id);
    assert.ok(!t.meta.sample, `예시 표시: ${t.id}`);
    assert.ok(t.meta.date <= T, t.meta.date);
    assert.ok(t.students.length >= 6 && t.students.every(s => s.status === 'done' && !s.skip), t.id);
  }
  const list = P(snap, 'unit:list');
  assert.ok(list.every(s => s.done && !s.sample && s.n > 0), JSON.stringify(list));
  const gaps = gapStudents(ts);
  assert.ok(gaps.length >= 2, JSON.stringify(gaps));
  assert.ok(gaps.every(g => g.areas.every(a => a.pct < 60)));
});

test('기초학력 프로그램 1개: 지어낸 이름(김하늘·이바다·한가람), 번호는 결손 학생, 사전·사후 점수(사후는 뒤 단원평가로 자동)', () => {
  const snap = demoSnapshot(T), camp = P(snap, 'camp'), ts = tests(snap);
  assert.equal(camp.camps.length, 1);
  const c = camp.camps[0];
  assert.equal(camp.current, c.id);
  assert.deepEqual(normCamp(c).students, c.students, '저장 모양이 앱과 같음');
  const info = P(snap, 'class:info');
  assert.equal(c.students.length, 3);
  for (const s of c.students) {
    assert.ok(DEMO_NAMES.includes(s.name), s.name);
    assert.equal(s.grade, info.grade); assert.equal(s.cls, info.room);
  }
  const gapNos = new Set(gapStudents(ts.filter(t => t.meta.date < c.sessions.map(x => x.date).sort()[0])).map(g => g.no));
  for (const s of c.students) {
    assert.ok(gapNos.has(s.no), `결손 학생이 아님: ${s.no}`);
    const g = c.growth[s.id];
    assert.ok(g && g.subject && g.area, JSON.stringify(g));
    assert.ok(g.pre.pct != null && g.pre.pct < 60 && g.pre.source === 'auto' && g.pre.tests.length, JSON.stringify(g.pre));
    assert.ok(g.post && g.post.source === 'auto' && g.post.pct != null && g.post.tests.length === 1, JSON.stringify(g.post));
    assert.ok(growthChange(g) > 0, `오르지 않음: ${s.no}`);
  }
  // 오늘(평일)도 수업이 있어 「오늘」 화면에 출석 카드가 보이고, 지난 수업은 출석 체크가 있음
  assert.ok(sessionsOn(c, T).length >= 1, '오늘 수업 없음');
  const past = c.sessions.filter(x => x.date < T);
  assert.ok(past.length >= 3 && past.every(x => c.att[x.id]), '지난 출석');
  assert.ok(!sessionsOn(c, T).some(x => c.att[x.id]), '오늘은 아직 체크 안 함');
});

test('근거가 붙은 교과 평어: 학생마다 글·근거 목록·문장(근거 번호), 근거 없는 문장도 하나 이상', () => {
  const snap = demoSnapshot(T), py = P(snap, 'unit:pyeongeo:국어');
  const nos = Object.keys(py.students);
  assert.ok(nos.length >= 6, nos.join(','));
  let bare = 0;
  for (const no of nos) {
    const s = py.students[no];
    assert.ok(s.text && s.ev && Array.isArray(s.ev.list) && s.ev.list.length && Array.isArray(s.ev.sentences), no);
    assert.equal(joinSentences(s.ev.sentences), s.text, `글과 문장이 다름: ${no}`);
    const ids = new Set(s.ev.list.map(e => e.id));
    for (const x of s.ev.sentences) for (const id of x.src) assert.ok(ids.has(id), `없는 근거 ${id}`);
    assert.ok(s.ev.sentences.some(x => x.src.length), `근거 없음뿐: ${no}`);
    bare += s.ev.sentences.filter(x => !x.src.length).length;
    assert.ok(['top', 'high', 'mid', 'low'].includes(s.level), s.level);
  }
  assert.ok(bare >= 1, '근거 없는 문장이 없음');
});

test('오늘 수업 시간표·진도(오늘이 평일이면 수업이 있음)', () => {
  const snap = demoSnapshot(T);
  const tt = normTimetable(P(snap, 'class:timetable')), subs = P(snap, 'class:subjects');
  assert.ok(subs.length >= 2 && subs.every(s => s.lessons.length), '진도표');
  assert.ok(slotsOn({ tt, subjects: subs, log: {}, breaks: [], today: T }, T).length >= 3, '오늘 수업');
});

test('공문 기한 1~2개: 오늘부터 7일 안, 학사일정에도', () => {
  const snap = demoSnapshot(T), docs = P(snap, 'gongmun:list');
  assert.ok(docs.length >= 1 && docs.length <= 2, String(docs.length));
  assert.ok(dueSoon(docs, T).length >= 1, '가까운 기한 없음');
  assert.ok(P(snap, 'calendar').some(e => e.source === 'gongmun'), '달력');
});

test('이름처럼 보이는 말은 지어낸 이름뿐', () => {
  const snap = demoSnapshot(T);
  const leaves = [];
  const walk = v => { if (typeof v === 'string') leaves.push(v); else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x); };
  for (const v of Object.values(snap)) walk(JSON.parse(v));
  for (const s of leaves) {
    const left = [...DEMO_NAMES, '새싹초등학교'].reduce((t, n) => t.split(n).join(''), s);
    const m = maskPersons(left);
    assert.equal(m.masked, 0, `이름처럼 보임: ${s.slice(0, 80)} → ${m.text.slice(0, 80)}`);
  }
  const all = Object.values(snap).join('\n');
  for (const n of ['민수', '민지']) assert.ok(!all.includes(n), n);
});

test('만들 때 진짜 저장소는 그대로(저장소를 잠깐 바꿨다 되돌림)', () => {
  const m = new Map([['ssam:hk', '{"students":[]}']]);
  const real = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
  const prev = store.useStorage(real);
  try {
    demoSnapshot(T);
    assert.deepEqual([...m.entries()], [['ssam:hk', '{"students":[]}']]);
    assert.ok(store.set('x:after', 1), '저장소가 되돌아오지 않음');
    assert.equal(m.get('ssam:x:after'), '1');
  } finally { store.useStorage(prev); }
});

test('다른 날(1학기 봄)에 열어도: 날짜는 오늘 기준, 결손 학생·사후 점수가 나옴', () => {
  const day = '2027-04-07';
  const snap = demoSnapshot(day), ts = tests(snap), c = P(snap, 'camp').camps[0];
  assert.ok(ts.every(t => t.meta.date <= day));
  assert.ok(gapStudents(ts).length >= 2);
  assert.ok(c.students.every(s => c.growth[s.id].post && growthChange(c.growth[s.id]) > 0));
  assert.ok(dueSoon(P(snap, 'gongmun:list'), day).length >= 1);
});

test('체험용 학년도 번호는 진짜 학년도와 겹치지 않음', () => {
  assert.ok(Number.isInteger(DEMO_YEAR) && DEMO_YEAR > 2100 && DEMO_YEAR <= 9999, String(DEMO_YEAR));
  assert.deepEqual(DEMO_NAMES, ['김하늘', '이바다', '한가람']);
});
