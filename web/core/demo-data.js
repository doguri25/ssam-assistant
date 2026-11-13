/* 3분 둘러보기의 체험 자료 (스펙 2026-11-13-miss-tour-check §3). AI 없이 만들고 화면 없이 돌아감(Node 시험).
   모두 지어낸 것: 새싹초등학교 3학년 1반(명단은 번호만), 다 채점한 국어 단원평가 3개(예시 표시 meta.sample 없음 — 「도달하지 못한 학생」에 나옴),
   기초학력 프로그램 1개(김하늘·이바다·한가람 — 결손 학생 번호, 사전 점수는 앞 두 평가, 사후 점수는 프로그램 뒤 평가에서 자동),
   근거가 붙은 교과 평어(문장마다 근거 번호, 근거 없는 문장도 하나씩 섞음), 오늘 수업 시간표·진도(학급 예시와 같음), 공문 기한 2개.
   날짜는 모두 오늘 기준. 앱의 저장 함수를 메모리 저장소에 대고 불러(store.useStorage) 저장 모양이 앱과 똑같고, 진짜 저장소는 건드리지 않음.
   → { 키(ssam: 뺀 것): 저장된 글 } (core/years.js snapshot 모양, 학년도 키만) */
import * as store from './store.js';
import { snapshot } from './years.js';
import { addDays } from './calendar.js';
import { sampleTests } from '../menus/evaluate/unit/unit-sample.js';
import { saveTest, savePyeongeo, graded, contentKey, itemName, levelOf, termOf, makeTitle } from '../menus/evaluate/unit/unit-model.js';
import { studentTotal } from '../menus/evaluate/unit/unit-grade.js';
import { pyeongeoEvidence, evTitle } from '../menus/evaluate/unit/unit-ai.js';
import { gapStudents } from '../menus/evaluate/unit/unit-gap.js';
import { joinSentences } from './evidence.js';
import { sampleData } from '../menus/class/class-sample.js';
import { setInfo, setTimetable, setSubjects } from '../menus/class/class-model.js';
import { newCamp, newSession, saveCamp, setCurrentCamp, expandDates } from '../menus/class/camp-model.js';
import { addGapStudents, applyAutoPost } from '../menus/class/camp-growth.js';
import { putDoc } from '../menus/etc/gongmun-model.js';

export const DEMO_NAMES = ['김하늘', '이바다', '한가람'];
export const DEMO_SCHOOL = '새싹초등학교';
const COUNT = 12; // 학생 수(명단은 번호만)

function memStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
const must = ok => { if (!ok) throw new Error('demo: 저장하지 못함'); return ok; };
const clone = v => JSON.parse(JSON.stringify(v));

/* ---------- 단원평가 ----------
   예시 평가(unit-sample.js)의 학생 답 6가지(채점·확인·잘한 점까지 끝남)를 번호마다 골라 씀.
   답 0: 모두 맞음, 1: 지식 영역이 약함, 2: 이해 영역이 많이 약함, 3·5: 잘함, 4: 이해 영역이 약함.
   2·3·6번은 앞 두 평가에서 기준(60%) 아래 → 기초학력에 넣고, 프로그램 뒤 평가에서 그 영역이 오름 */
const PATTERNS = [
  [0, 1, 2, 3, 5, 4, 3, 0, 5, 3, 0, 5],
  [3, 1, 4, 0, 5, 2, 5, 3, 0, 5, 3, 0],
  [0, 2, 1, 3, 0, 5, 3, 5, 0, 3, 5, 0]
];
const UNITS = [
  { unitNo: 2, unitName: '중요한 내용을 적어요', round: 1, ago: 30 },
  { unitNo: 2, unitName: '중요한 내용을 적어요', round: 2, ago: 23 },
  { unitNo: 3, unitName: '자세하게 소개해요', round: 1, ago: 4 }
];
// 예시 글의 등장인물 이름은 체험 자료에서 지어낸 이름으로(정답과 학생 답을 함께 바꿔 채점은 그대로)
const RENAME = [[/민수/g, '하늘'], [/민지/g, '바다']];
const rename = s => RENAME.reduce((t, [re, to]) => t.replace(re, to), String(s == null ? '' : s));

function unitTests(today, grade) {
  const base = sampleTests()[0]; // 예시 1회: 학생 k가 답 k
  const items = base.key.items.map(it => ({ ...it, answer: rename(it.answer), criteria: rename(it.criteria) }));
  return UNITS.map((u, i) => {
    const date = addDays(today, -u.ago);
    const students = PATTERNS[i].map((k, j) => {
      const s = clone(base.students[k]);
      for (const c of Object.values(s.items)) c.read = rename(c.read);
      return { ...s, no: j + 1 };
    });
    return {
      ...clone(base), id: `demo-u${i + 1}`, key: { ...base.key, items: clone(items) }, students, done: true, createdAt: Date.parse(`${date}T09:00:00Z`),
      meta: { subject: '국어', grade, term: termOf(date, []), unitNo: u.unitNo, unitName: u.unitName, round: u.round, date }
    };
  });
}

/* ---------- 근거가 붙은 교과 평어 (unit-results.js 「교과 평어로 넘기기」와 같은 셈: 평가 내용별 정답률, 잘함 ≥ 80%·보완 < 60%) ---------- */
function contentRates(tests, no) {
  const m = new Map();
  for (const t of tests) {
    const s = graded(t).find(x => x.no === no);
    if (!s) continue;
    for (const it of t.key.items) {
      const k = contentKey(t, it), v = m.get(k) || { pts: 0, max: 0, name: itemName(it), titles: [] };
      v.pts += Number(s.items[it.no] && s.items[it.no].pts) || 0; v.max += Number(it.points) || 0;
      if (!v.titles.includes(evTitle(t.meta))) v.titles.push(evTitle(t.meta));
      m.set(k, v);
    }
  }
  return [...m.values()].filter(v => v.max).map(v => ({ name: v.name, rate: v.pts / v.max, titles: v.titles }));
}
const batchim = w => { const c = String(w).charCodeAt(String(w).length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 !== 0; };
const GOOD = [n => `${n}에서 내용을 정확하게 이해하고 바르게 답함.`, n => `${n}${batchim(n) ? '을' : '를'} 꼼꼼하게 해내 좋은 결과를 보임.`];
const WEAK = n => `${n}${batchim(n) ? '은' : '는'} 차근차근 다시 살펴보며 실력을 키워 가고 있음.`;
const PLAIN = '수업 시간에 바른 자세로 참여하며 친구의 생각을 귀 기울여 들음.'; // 근거가 없는 문장(화면에 「근거 없음」)
const ACADEMY = '방과 후 논술 학원에서 익힌 글쓰기 방법을 수업 시간에 활용함.'; // 근거 없음 + 기재 점검 「사교육」(둘러보기 기재 점검 단계)

function pyeongeo(tests) {
  const nos = [...new Set(tests.flatMap(t => graded(t).map(s => s.no)))].sort((a, b) => a - b);
  const students = {};
  for (const no of nos) {
    const ps = tests.map(t => { const s = graded(t).find(x => x.no === no); return s ? studentTotal(t, s).pct : null; }).filter(v => v != null);
    const avg = Math.round(ps.reduce((a, b) => a + b, 0) / ps.length * 10) / 10;
    const rates = contentRates(tests, no);
    let good = rates.filter(r => r.rate >= 0.8).sort((a, b) => b.rate - a.rate).slice(0, 2);
    const weak = rates.filter(r => r.rate < 0.6).sort((a, b) => a.rate - b.rate).slice(0, 1);
    if (!good.length && !weak.length) good = rates.sort((a, b) => b.rate - a.rate).slice(0, 1);
    const used = [...good, ...weak], list = pyeongeoEvidence(used);
    const id = r => (list[used.indexOf(r)] || {}).id;
    const sentences = [...good.map((r, i) => ({ t: GOOD[i](r.name), src: [id(r)] })), ...weak.map(r => ({ t: WEAK(r.name), src: [id(r)] }))].filter(s => s.src[0]);
    if (no % 3 === 1) sentences.push({ t: PLAIN, src: [] });
    if (no === nos[1]) sentences.push({ t: ACADEMY, src: [] }); // 기재 점검이 찾을 글(사교육)
    students[no] = { level: levelOf(avg), text: joinSentences(sentences), manual: false, ev: { list, sentences } };
  }
  return { off: [], cuts: { top: 95, high: 80, mid: 60 }, students };
}

/* ---------- 기초학력 ---------- */
const CAMP_TOPICS = ['중심 문장 찾기', '낱말의 뜻 짐작하기', '글 간추리기', '소리 내어 읽기', '읽고 생각 말하기'];
const OBS = ['낱말 카드로 뜻을 익힌 뒤 문장에서 바르게 씀.', '중심 문장에 밑줄을 그으며 읽는 습관이 생김.', '글을 소리 내어 읽은 뒤 내용을 간추려 말함.'];
function demoCamp(today, info, tests) {
  const before = tests.filter(t => t.meta.date < addDays(today, -18)), titles = Object.fromEntries(tests.map(t => [t.id, makeTitle(t.meta)]));
  const gaps = gapStudents(before).slice(0, DEMO_NAMES.length);
  let camp = newCamp({ name: `${info.grade}학년 ${info.room}반 국어 기초학력 교실`, target: `${info.grade}학년`, subjects: ['국어'], unit: 'period' });
  camp = addGapStudents(camp, gaps, { grade: info.grade, cls: info.room, date: addDays(today, -20), titles }).camp;
  camp.students = camp.students.map((s, i) => ({ ...s, name: DEMO_NAMES[i] || '' }));
  camp.sessions = expandDates(addDays(today, -18), addDays(today, 10)).map((date, i) => newSession({ date, start: '15:00', end: '15:40', subject: '국어', content: CAMP_TOPICS[i % CAMP_TOPICS.length] }));
  const past = camp.sessions.filter(s => s.date < today);
  camp.att = Object.fromEntries(past.map((s, i) => [s.id, Object.fromEntries(camp.students.map((st, j) => [st.id, i === 1 && j === 1 ? 'X' : 'O']))]));
  camp.obs = Object.fromEntries(camp.students.map((st, j) => [st.id, OBS[j % OBS.length]]));
  return applyAutoPost(camp, tests, { info }).camp;
}

/* ---------- 공문 기한 ---------- */
const DOCS = [
  { id: 'demo-gm1', title: '안전 교육 실적 제출', got: -3, due: 1, summary: '학급 안전 교육 실적을 서식에 맞춰 내요.', tasks: [{ text: '안전 교육 실적 서식 채우기', due: 0 }] },
  { id: 'demo-gm2', title: '독서 행사 운영 계획 제출', got: -1, due: 5, summary: '학년 독서 행사 계획을 모아 내요.', tasks: [] }
];

function build(today, now) {
  const cls = sampleData(today, []); // 학급 예시와 같은 시간표·진도표(오늘 기준 진도)
  const info = { grade: cls.info.grade, room: cls.info.room };
  must(store.set('school', { name: DEMO_SCHOOL, classes: 3, students: 72, breaks: [] }));
  must(store.set('class', { count: COUNT, except: [], at: now }));
  must(setInfo(info) && setTimetable(cls.timetable) && setSubjects(cls.subjects));
  const tests = unitTests(today, info.grade);
  for (const t of tests) must(saveTest(t));
  must(savePyeongeo('국어', pyeongeo(tests)));
  const camp = must(saveCamp(demoCamp(today, info, tests)));
  must(setCurrentCamp(camp.id));
  DOCS.forEach((d, i) => must(putDoc({ id: d.id, name: '', title: d.title, from: '', no: '', date: addDays(today, d.got), due: addDays(today, d.due), dueNote: '', summary: d.summary,
    tasks: d.tasks.map(x => ({ text: x.text, due: addDays(today, x.due), done: false })), kinds: [], text: '', at: now - i, done: false, read: true })));
}

/* today: 'YYYY-MM-DD'. 저장하지 못하면(저장이 멈춤 등) 오류를 던짐 */
export function demoSnapshot(today, { now = Date.now() } = {}) {
  const mem = memStorage();
  const prev = store.useStorage(mem);
  try { build(today, now); } finally { store.useStorage(prev); }
  return snapshot(mem);
}
