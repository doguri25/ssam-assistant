/* 「쌤」 채팅 — 앱 자료로 바로 답하기 (스펙 2026-11-14-chat-smarter §1).
   묻는 글(dataQuestion)이면 AI를 부르지 않고 이 컴퓨터의 자료로 셈해 답함: 단원평가 평균·학생 점수·도달하지 못한 학생·진도·시간표·기초학력 출석률·남은 공문 기한.
   학생은 번호로만(이름은 쓰지 않음). answer*는 미리 모은 자료로 글만 만드는 순수 함수(Node 시험), answerFor가 저장된 자료를 모음(필요한 모델만 그때 읽음) */

const r1 = n => Math.round(n * 10) / 10;
const pctText = n => `${r1(Number(n) || 0)}%`;
const DAY = '일월화수목금토';
const SUBJECTS = ['국어', '수학', '사회', '과학', '영어', '도덕', '음악', '미술', '체육', '실과', '바른 생활', '슬기로운 생활', '즐거운 생활', '통합', '창체'];

/* ---------- 날짜 (UTC로 셈 — 시간대와 상관없이) ---------- */
const toD = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fromD = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = toD(s); d.setUTCDate(d.getUTCDate() + n); return fromD(d); };
const wday = s => toD(s).getUTCDay();
const diffDays = (a, b) => Math.round((toD(b) - toD(a)) / 86400000);
const md = s => `${+s.slice(5, 7)}월 ${+s.slice(8, 10)}일(${DAY[wday(s)]})`;
const mdShort = s => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
const relWord = (date, today) => ({ 0: '오늘', 1: '내일', 2: '모레' }[diffDays(today, date)] || '');

/* ---------- 묻는 글 알아보기 ---------- */
// 묻는 꼴(이게 있어야 자료 질문)
const ASK = /[?？]|몇|얼마|어때|어땠|어떤가|어떻게\s*(?:돼|되)|알려|보여|뭐(?:야|예요|에요|지|임|\s*있|\s*남)|누구|누가|어디까지|남았|남은|있어|있나|있니|있을까|나왔|나갔|궁금|됐어|됐나|볼래/;
// 하는 법·만들기·명령(자료를 묻는 게 아님)
const NOT = /어떻게(?!\s*(?:돼|되))|어떡|방법|하는\s*법|요령|양식|서식|만들|뽑아|뽑는|채점\s*해|넣어|넣는|넣을|바꾸|바꿔|고치|고쳐|처리\s*해|정리|써\s*줘|써줘|쓰는|작성|결과지|결과표|출석부|확인서|보고서|내려받|인쇄|체크/;
const DAYW = [['오늘', 0], ['내일', 1], ['모레', 2], ['글피', 3]];
const WEEK = [['일요일', 0], ['월요일', 1], ['화요일', 2], ['수요일', 3], ['목요일', 4], ['금요일', 5], ['토요일', 6]];
function dayOf(t, today) {
  for (const [w, n] of DAYW) if (t.includes(w)) return addDays(today, n);
  for (const [w, n] of WEEK) if (t.includes(w) || t.includes(w.slice(0, 1) + '욜')) return addDays(today, (n - wday(today) + 7) % 7);
  return today;
}
const subjectOf = (t, extra = []) => [...extra, ...SUBJECTS].find(s => s && t.includes(s)) || '';
// 학생 번호(「3번 문항」「3번 문제」는 아님)
const nosOf = t => [...new Set([...t.matchAll(/(\d{1,2})\s*번(?!\s*(?:문항|문제|째))/g)].map(m => +m[1]).filter(n => n >= 1 && n <= 60))];

/* text → { kind, subject, nos, day, period } 또는 null. subjects: 진도표의 교과 이름(더 찾을 것) */
export function dataQuestion(text, { today = '', subjects = [] } = {}) {
  const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (!t || t.length > 80 || NOT.test(t)) return null;
  const ask = ASK.test(t), short = t.length <= 12;
  const subject = subjectOf(t, subjects), nos = nosOf(t);
  const base = { subject, nos };
  if (/출석|결석|출결/.test(t) && ask) return { kind: 'attendance', ...base };
  if (/공문/.test(t) && /기한|마감|남|밀린|급한|언제|몇|뭐/.test(t) && ask) return { kind: 'gongmun', ...base };
  if ((/시간표|\d\s*교시/.test(t) && (ask || short)) || (/(?:오늘|내일|모레|글피|[월화수목금]요일)\s*수업/.test(t) && ask)) {
    const p = t.match(/(\d)\s*교시/);
    return { kind: 'timetable', ...base, day: dayOf(t, today), period: p ? +p[1] : 0 };
  }
  if (!ask) return null;
  if (/도달\s*(?:하지\s*)?못|미도달|도달\s*안|결손|부진|기초\s*학력\s*(?:에\s*)?(?:들어갈|넣을|대상|갈)|기준\s*(?:미만|아래|안\s*되)/.test(t)) return { kind: 'gap', ...base };
  if (nos.length && /점수|성적|결과|몇\s*점|어때|어땠|잘\s*봤|평가|단원/.test(t)) return { kind: 'student', ...base };
  if (/진도/.test(t)) return { kind: 'progress', ...base };
  if (/단원\s*평가|단평|시험|평균|정답률|성적/.test(t) && /평균|점수|결과|몇\s*점|정답률|어땠|어때|성적|잘\s*봤|나왔/.test(t)) return { kind: 'unit', ...base };
  return null;
}

/* ---------- 답 글 (순수) ---------- */
const sameSub = (a, b) => { const x = String(a || '').replace(/\s+/g, ''), y = String(b || '').replace(/\s+/g, ''); return !!x && !!y && (x.includes(y) || y.includes(x)); };
const out = (text, go) => ({ text, go });

/* units: [{ id, title, subject, date, n(채점한 학생), avg(%), low: [{ no, rate }], sample }] */
export function answerUnit(q, units = []) {
  const pool = (units || []).filter(u => u && u.n > 0), real = pool.filter(u => !u.sample);
  let list = real.length ? real : pool;
  if (!list.length) return out('아직 채점한 단원평가가 없어요. 평가 › 단원평가에서 채점하면 여기서 바로 알려 드려요.', 'unit');
  if (q.subject) {
    list = list.filter(u => sameSub(u.subject, q.subject) || String(u.title || '').includes(q.subject));
    if (!list.length) return out(`${q.subject} 단원평가는 아직 채점한 것이 없어요.`, 'unit');
  }
  const top = list.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 3);
  const lines = top.map(u => `- 「${u.title}」 평균 ${r1(u.avg)}점(${u.n}명 채점)${(u.low || []).length ? ` · 정답률 낮은 문항 ${u.low.map(x => `${x.no}번 ${Math.round(x.rate * 100)}%`).join(', ')}` : ''}`);
  return out([`${q.subject ? q.subject + ' ' : ''}단원평가(최근 ${top.length}개, 100점으로 환산)`, ...lines].join('\n'), 'unit');
}

/* list: [{ no, rows: [{ title, score, total, pct, classAvg }](최근 것부터), domains: [{ name, rate }] }] */
export function answerStudent(q, list = []) {
  const parts = (list || []).map(s => {
    if (!s.rows || !s.rows.length) return `${s.no}번 학생은 채점한 단원평가가 없어요${q.subject ? `(${q.subject})` : ''}.`;
    const rows = s.rows.slice(0, 3).map(r => `- 「${r.title}」 ${r.score}/${r.total}점(${pctText(r.pct)})${r.classAvg != null ? ` · 반 평균 ${pctText(r.classAvg)}` : ''}`);
    const low = (s.domains || []).slice().sort((a, b) => a.rate - b.rate)[0];
    return [`${s.no}번 학생 단원평가(최근 ${rows.length}개${q.subject ? ` · ${q.subject}` : ''})`, ...rows, ...(low ? [`가장 낮은 영역: ${low.name} ${Math.round(low.rate * 100)}%`] : [])].join('\n');
  });
  return out(parts.join('\n\n') || '그 번호의 학생을 찾지 못했어요.', 'unit');
}

/* list: gapStudents 결과([{ no, areas: [{ name, subject, pct }] }]) 또는 null(채점한 평가 없음), cut: 기준 % */
export function answerGap(q, list, cut = 60) {
  if (list == null) return out('아직 채점한 단원평가가 없어요. 채점을 마치면 도달하지 못한 학생을 찾아 드려요.', 'unit');
  let rows = list.map(g => ({ no: g.no, areas: (g.areas || []).filter(a => !q.subject || sameSub(a.subject, q.subject)) })).filter(g => g.areas.length);
  if (!rows.length) return out(`${q.subject ? q.subject + '에서 ' : ''}기준(${cut}%)보다 낮은 학생이 없어요.`, 'unit');
  const shown = rows.slice(0, 10).map(g => { const a = g.areas[0]; return `${g.no}번(${a.subject ? a.subject + ' ' : ''}${a.name} ${pctText(a.pct)})`; });
  return out([`도달하지 못한 학생 ${rows.length}명(영역 점수율 ${cut}% 아래${q.subject ? ` · ${q.subject}` : ''}):`, shown.join(', ') + (rows.length > 10 ? ` 외 ${rows.length - 10}명` : ''),
    '기초학력에 넣으려면 평가 › 단원평가 › 결과 모아 보기의 「도달하지 못한 학생」에서 골라요.'].join('\n'), 'unit');
}

/* rows: [{ name, actual, plan, expected, diff, started, next: { unit, title, no } | null }] */
export function answerProgress(q, rows = []) {
  let list = (rows || []).filter(r => r && r.plan > 0);
  if (!list.length) return out('진도표가 아직 없어요. 학급 › 진도표·시수에서 진도표를 넣으면 교과마다 어디까지 했는지 알려 드려요.', 'progress');
  if (q.subject) {
    list = list.filter(r => sameSub(r.name, q.subject));
    if (!list.length) return out(`${q.subject} 진도표가 없어요. 학급 › 진도표·시수에서 넣어 주세요.`, 'progress');
  }
  const line = r => {
    const done = r.actual >= r.plan;
    const nx = !done && r.next ? ` · 다음 「${[r.next.unit, r.next.title].filter(Boolean).join(' · ')}${r.next.no ? `(${r.next.no})` : ''}」` : '';
    const gap = !r.started || done ? '' : r.diff < 0 ? ` · 진도표보다 ${-r.diff}차시 늦어요` : r.diff > 0 ? ` · 진도표보다 ${r.diff}차시 빨라요` : ' · 진도표대로예요';
    return `- ${r.name} ${r.actual}/${r.plan}차시${done ? ' · 다 했어요' : ''}${nx}${gap}`;
  };
  return out(['진도(한 차시/전체):', ...list.slice(0, 10).map(line)].join('\n'), 'progress');
}

/* view: { date, has(시간표가 있나), off(쉬는 까닭), slots: [{ period, subject, lesson: { title } | null }] } */
export function answerTimetable(q, view, today) {
  if (!view || !view.has) return out('시간표가 아직 없어요. 학급 › 진도표·시수에서 시간표를 넣어 주세요.', 'progress');
  const rel = relWord(view.date, today), label = `${rel ? rel + ' ' : ''}${md(view.date)}`;
  if (view.off) return out(`${label}은 수업이 없어요(${view.off}).`, 'today');
  const one = s => `${s.subject}${s.lesson && s.lesson.title ? `(${s.lesson.title})` : ''}`;
  if (q.period) {
    const s = view.slots.find(x => x.period === q.period);
    return out(s ? `${label} ${q.period}교시는 ${one(s)}이에요.` : `${label} ${q.period}교시는 수업이 없어요.`, 'today');
  }
  if (!view.slots.length) return out(`${label}은 시간표에 수업이 없어요.`, 'today');
  return out([`${label} 시간표`, ...view.slots.map(s => `- ${s.period}교시 ${one(s)}`)].join('\n'), 'today');
}

/* camp: { name, sessions(수업 수), students: [{ label, no, present, absent, marked }] } 또는 null */
export function answerAttendance(q, camp) {
  if (!camp) return out('기초학력 프로그램이 아직 없어요. 학급 › 기초학력에서 만들면 출석을 세어 드려요.', 'camp');
  const pct = s => (s.marked ? Math.round(s.present / s.marked * 100) : null);
  if (q.nos && q.nos.length) {
    const ss = camp.students.filter(s => q.nos.includes(s.no));
    if (!ss.length) return out(`「${camp.name}」에 ${q.nos.join('·')}번 학생이 없어요.`, 'camp');
    return out([`「${camp.name}」 출석(체크한 수업 기준)`, ...ss.map(s => `- ${s.label}: 출석 ${s.present}번 · 결석 ${s.absent}번(체크한 수업 ${s.marked}번 · 전체 ${camp.sessions}번)`)].join('\n'), 'camp');
  }
  const present = camp.students.reduce((n, s) => n + s.present, 0), marked = camp.students.reduce((n, s) => n + s.marked, 0);
  if (!marked) return out(`「${camp.name}」은 아직 출석을 체크한 수업이 없어요.`, 'camp');
  const low = camp.students.filter(s => s.marked && pct(s) < 80).sort((a, b) => pct(a) - pct(b));
  return out([`「${camp.name}」 출석률 ${Math.round(present / marked * 100)}%(체크한 수업 기준 · 학생 ${camp.students.length}명 · 수업 ${camp.sessions}번)`,
    low.length ? `출석이 낮은 학생: ${low.slice(0, 8).map(s => `${s.label} ${s.present}/${s.marked}`).join(', ')}` : '출석률이 80%보다 낮은 학생은 없어요.'].join('\n'), 'camp');
}

/* docs: [{ title, due, done }] */
export function answerGongmun(q, docs = [], today) {
  const left = (docs || []).filter(d => d && !d.done);
  if (!left.length) return out('남은 공문이 없어요.', 'gongmun');
  const dated = left.filter(d => d.due).sort((a, b) => a.due.localeCompare(b.due)), none = left.length - dated.length;
  const when = d => { const n = diffDays(today, d.due); return n < 0 ? `기한 지남(${mdShort(d.due)})` : n === 0 ? `오늘까지(${mdShort(d.due)})` : `D-${n}(${mdShort(d.due)})`; };
  return out([`남은 공문 ${left.length}개`, ...dated.slice(0, 6).map(d => `- 「${d.title || '제목 없는 공문'}」 ${when(d)}`),
    ...(dated.length > 6 ? [`- 그 밖에 ${dated.length - 6}개`] : []), ...(none ? [`기한 없는 공문 ${none}개`] : [])].join('\n'), 'gongmun');
}

/* ---------- 저장된 자료 모아 답하기 (필요한 모델만 그때 읽음) ---------- */
const UNIT = '../menus/evaluate/unit/unit-model.js';
async function unitTests(subject) {
  const M = await import(UNIT);
  const sums = M.listTests().filter(s => s.n > 0), real = sums.filter(s => !s.sample), pool = (real.length ? real : sums).slice(0, 20);
  const tests = pool.map(s => M.getTest(s.id)).filter(Boolean).filter(t => !subject || sameSub(t.meta && t.meta.subject, subject));
  return { M, sums: pool, tests };
}
export async function answerFor(q, { today }) {
  if (q.kind === 'unit') {
    const { M, sums } = await unitTests('');
    return answerUnit(q, sums.slice(0, 10).map(s => { const t = M.getTest(s.id); return { ...s, low: t ? M.reteach(t).slice(0, 3).map(x => ({ no: x.no, rate: x.rate })) : [] }; }));
  }
  if (q.kind === 'student') {
    const { M, tests } = await unitTests(q.subject);
    return answerStudent(q, q.nos.slice(0, 3).map(no => { const h = M.studentHistory(tests, no); return { no, rows: h.rows.slice().reverse(), domains: h.domains }; }));
  }
  if (q.kind === 'gap') {
    const { M, tests } = await unitTests('');
    if (!tests.length) return answerGap(q, null);
    const G = await import('../menus/evaluate/unit/unit-gap.js'), cut = G.normCut(M.getSet().gapCut);
    return answerGap(q, G.gapStudents(tests, { cut }), cut);
  }
  if (q.kind === 'progress' || q.kind === 'timetable') {
    const C = await import('../menus/class/class-model.js'), ctx = C.makeCtx(today);
    if (q.kind === 'progress') {
      return answerProgress(q, C.summary(ctx).map(p => {
        const l = p.sub.lessons[p.actual];
        return { name: p.sub.name, actual: p.actual, plan: p.plan, expected: p.expected, diff: p.diff, started: p.started, next: l ? { unit: l.unit, title: l.title, no: l.no } : null };
      }));
    }
    const v = C.dayView(ctx, q.day);
    return answerTimetable(q, { date: q.day, has: C.hasTimetable(ctx.tt), off: v.off || '', slots: v.slots.map(s => ({ period: s.period, subject: s.subject, lesson: s.lesson })) }, today);
  }
  if (q.kind === 'attendance') {
    const P = await import('../menus/class/camp-model.js');
    const camp = P.getCamp(P.currentCampId()) || P.listCamps()[0] || null;
    if (!camp) return answerAttendance(q, null);
    return answerAttendance(q, {
      name: camp.name || '기초학력', sessions: camp.sessions.length,
      students: camp.students.map((s, i) => { const a = P.attStats(camp, s.id); return { label: s.no ? `${s.grade && s.cls ? `${s.grade}-${s.cls} ` : ''}${s.no}번` : P.aliasOf(i), no: s.no, present: a.present, absent: a.absent, marked: a.marked }; })
    });
  }
  if (q.kind === 'gongmun') {
    const G = await import('../menus/etc/gongmun-model.js');
    return answerGongmun(q, G.listDocs(), today);
  }
  return null;
}
