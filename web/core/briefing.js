/* 「쌤」 채팅을 열면 맨 위 「오늘 할 일」 (스펙 2026-11-06 E). AI 없이 앱이 셈 — 화면 없이 돌아감(시험).
   채팅 창(chat.js)이 저장소에서 모은 것을 넘기면 줄 [{ kind, text, when, hot, route }]을 돌려줌. route: 누르면 갈 곳 { to, id? } */
import { addDays, weekday, isDate } from './calendar.js';

const DAY = '일월화수목금토';
const md = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const utc = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const diff = (d, today) => Math.round((utc(d) - utc(today)) / 864e5);
const dWhen = n => (n < 0 ? `${-n}일 지남` : n === 0 ? '오늘' : `D-${n}`);
const dayWhen = (d, today) => (d === today ? '오늘' : `${md(d)}(${DAY[weekday(d)]})`);
const live = s => s && !s.skip;
const RECENT = 30; // 단원평가·활동지는 이 날 수 안의 것만(오래전에 멈춘 평가가 늘 남지 않게)
const recent = (x, today) => !isDate(x.date) || (diff(x.date, today) >= -RECENT && diff(x.date, today) <= 1);

/* 출처('event:<id>'·'year:<id>'·그 밖) → 누르면 갈 곳 */
function eventRoute(source) {
  const m = /^event:(.+)$/.exec(String(source || ''));
  if (m) return { to: 'event', id: m[1] };
  if (/^year:/.test(String(source || ''))) return { to: 'year' };
  return { to: 'today' };
}

/* data: { today('YYYY-MM-DD'), docs(공문), events(학사일정), plans(행사계획), units·activities({ id, title, date, done, sample, students }), grs({ id, title, students }), weekly({ started }) } */
export function briefing({ today, docs = [], events = [], plans = [], units = [], activities = [], grs = [], weekly = null } = {}) {
  if (!isDate(today)) return [];
  const out = [];
  // 1. 공문 제출 기한: 지났거나 7일 안(다 한 공문 빼고), 가까운 차례
  docs.filter(d => d && !d.done && isDate(d.due)).map(d => ({ d, n: diff(d.due, today) })).filter(x => x.n <= 7).sort((a, b) => a.n - b.n)
    .forEach(({ d, n }) => out.push({ kind: 'gongmun', text: `공문 「${d.title || d.name || '공문'}」 제출`, when: dWhen(n), hot: n <= 1, route: { to: 'gongmun', id: d.id } }));
  // 2. 학사일정: 오늘~7일(행사계획 날짜 포함, 공문 일정은 위에서). 같은 날 같은 일정은 한 번
  const seen = new Set(), end7 = addDays(today, 7);
  events.filter(e => e && isDate(e.date) && e.source !== 'gongmun' && e.date >= today && e.date <= end7)
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach(e => { const k = e.date + '|' + e.title; if (seen.has(k)) return; seen.add(k); out.push({ kind: 'schedule', text: e.title, when: dayWhen(e.date, today), hot: e.date === today, route: eventRoute(e.source) }); });
  // 3. 날짜가 14일 안인데 확정하지 않은 행사계획
  plans.filter(p => p && p.status !== 'final' && isDate(p.date)).map(p => ({ p, n: diff(p.date, today) })).filter(x => x.n >= 0 && x.n <= 14).sort((a, b) => a.n - b.n)
    .forEach(({ p, n }) => out.push({ kind: 'plan', text: `행사계획 「${p.name || '이름 없는 행사'}」 확정 전`, when: dWhen(n), hot: n <= 3, route: { to: 'event', id: p.id } }));
  // 4. 채점·피드백이 덜 끝난 단원평가·활동지, 평어가 덜 된 평가지 채점
  for (const t of units) {
    if (!t || t.sample || !recent(t, today)) continue;
    const st = (t.students || []).filter(live);
    if (!st.length) continue;
    const left = st.filter(s => s.status !== 'done').length;
    if (!t.done) out.push({ kind: 'unit', text: `단원평가 「${t.title}」 채점${left ? ` ${left}명 남음` : ' 마치기'}`, when: '', route: { to: 'unit', id: t.id } });
    else {
      const fb = st.filter(s => s.status === 'done' && !String(s.good || '').trim() && !String(s.cheer || '').trim()).length;
      if (fb) out.push({ kind: 'unit', text: `단원평가 「${t.title}」 피드백 ${fb}명 남음`, when: '', route: { to: 'unit', id: t.id, step: 4 } });
    }
  }
  for (const a of activities) {
    if (!a || a.sample || a.done || !recent(a, today)) continue;
    const st = (a.students || []).filter(live);
    if (!st.length) continue;
    const left = st.filter(s => s.status !== 'done').length;
    out.push({ kind: 'activity', text: `활동지 「${a.title || '활동지'}」 채점${left ? ` ${left}명 남음` : ' 확정 전'}`, when: '', route: { to: 'activity', id: a.id } });
  }
  for (const g of grs) {
    const st = ((g && g.students) || []).filter(live);
    const left = st.filter(s => !String(s.text || '').trim()).length;
    if (st.length && left) out.push({ kind: 'gr', text: `평가지 채점 「${g.title || '평가지'}」 평어 ${left}명 남음`, when: '', route: { to: 'gr', id: g.id } });
  }
  // 5. 금요일이면 다음 주 주간학습안내
  if (weekday(today) === 5) {
    const mon = addDays(today, 3);
    out.push({ kind: 'weekly', text: weekly && weekly.started ? '다음 주 주간학습안내 확인' : '다음 주 주간학습안내 만들기', when: `${md(mon)}~`, route: { to: 'weekly' } });
  }
  return out;
}
export const EMPTY = '오늘은 급한 일이 없어요';
