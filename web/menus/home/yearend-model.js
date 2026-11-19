/* 학년말 마감 도우미 규칙 (스펙 2026-11-19-yearend-design §1). 화면 없음 — Node 시험에서도 씀. 모으기·시트는 yearend.js.
   d(모은 자료) → 줄 [{ id, label, state: 'done'|'todo'|'none', line, go }]. 선생님이 [했어요]로 표시한 줄(done Set)은 다 됨 */
const won = n => Number(n || 0).toLocaleString('ko-KR');
const nosText = list => { const a = (list || []).slice(0, 6); return a.length ? `${a.join('·')}번${list.length > a.length ? ` 외 ${list.length - a.length}명` : ''}` : ''; };

export const ROWS = [
  ['writers', '생활기록부 글'], ['check', '기재 점검'], ['evals', '평가 마무리'], ['progress', '진도·시수'], ['camp', '기초학력 문서'],
  ['training', '연수'], ['budget', '예산 집행'], ['gongmun', '공문'], ['handover', '인수인계서'], ['backup', '백업'], ['newyear', '새 학년도 준비']
];
/* 학년말(12~2월)인지 — 오늘 화면 카드 */
export const yearendSeason = today => { const m = +String(today || '').slice(5, 7); return m === 12 || m === 1 || m === 2; };

export function yearendRows(d = {}, done = new Set()) {
  const row = (id, state, line, go) => ({ id, label: (ROWS.find(r => r[0] === id) || [id, id])[1], state: state === 'todo' && done.has(id) ? 'done' : state, line, go, marked: done.has(id) });
  const out = [];
  // 1. 생활기록부 글: 글이 없는 학생(곳마다)
  const ck = d.check || null;
  if (!ck || !ck.texts) out.push(row('writers', 'none', '아직 쓴 생활기록부 글이 없어요(교과 평어·창체·행동특성)', { to: 'check' }));
  else {
    const gaps = ck.gaps || [];
    out.push(row('writers', gaps.length ? 'todo' : 'done', gaps.length ? `글이 없는 학생 — ${gaps.slice(0, 3).map(g => `${g.base} ${nosText(g.missing)}`).join(' / ')}${gaps.length > 3 ? ` 외 ${gaps.length - 3}곳` : ''}` : `${ck.writers || 0}명 모두 글이 있어요`, { to: 'check' }));
  }
  // 2. 기재 점검
  if (!ck || !ck.texts) out.push(row('check', 'none', '점검할 글이 없어요', { to: 'check' }));
  else out.push(row('check', ck.open ? 'todo' : 'done', ck.open ? `고칠 곳 ${ck.open}곳(쓰면 안 되는 말·같은 문장·글자 수 등)` : '고칠 곳이 없어요', { to: 'check' }));
  // 3. 평가 마무리
  const ev = (d.evals || []).filter(x => x && !x.closed && x.stage !== 'done');
  out.push(row('evals', !(d.evals || []).length ? 'none' : ev.length ? 'todo' : 'done',
    !(d.evals || []).length ? '평가가 없어요' : ev.length ? `마치지 않은 평가 ${ev.length}개${ev.some(x => x.pending) ? ` · 선생님 차례 ${ev.reduce((n, x) => n + (x.pending || 0), 0)}곳` : ''} — ${ev.slice(0, 2).map(x => `「${x.title}」`).join(', ')}${ev.length > 2 ? ' 등' : ''}` : '모든 평가를 마쳤어요', { to: 'board' }));
  // 4. 진도·시수
  const subs = (d.progress || []).filter(p => p && p.plan > 0);
  // 남은 시수는 진도표·시수 화면과 같은 수(계획 − 실시: 체크 전 실시 + 체크 기록) — 진도 자리(actual)와 따로. left가 없는 예전 자료는 진도 자리로
  const left = subs.reduce((n, p) => n + (p.left != null ? Math.max(0, p.left) : Math.max(0, p.plan - p.actual)), 0), behind = subs.filter(p => p.diff < 0);
  const behindText = behind.length ? `진도가 뒤처진 교과 ${behind.map(p => `${p.name}(${p.diff})`).slice(0, 4).join(', ')}` : '';
  out.push(row('progress', !subs.length ? 'none' : left || behind.length ? 'todo' : 'done',
    !subs.length ? '진도표가 없어요' : left ? `남은 시수 ${left}시간${behindText ? ` · ${behindText}` : ''}` : behindText || '계획 시수를 모두 마쳤어요', { to: 'progress' }));
  // 5. 기초학력 문서
  const camps = d.camps || [];
  const notReady = camps.map(c => ({ name: c.name, left: (c.docs || []).filter(x => x.state !== 'ready') })).filter(c => c.left.length);
  out.push(row('camp', !camps.length ? 'none' : notReady.length ? 'todo' : 'done',
    !camps.length ? '기초학력 프로그램이 없어요' : notReady.length ? notReady.slice(0, 2).map(c => `「${c.name}」 ${c.left.map(x => `${x.label} ${x.note}`).slice(0, 2).join(', ')}`).join(' / ') : '문서가 모두 준비됐어요', { to: 'camp' }));
  // 6. 연수
  const t = d.training || {}, mineLeft = t.mineLeft || 0, boardLeft = t.boardLeft || [];
  out.push(row('training', !t.mineTotal && !(t.boardCourses || 0) ? 'none' : mineLeft || boardLeft.length || t.noStaff ? 'todo' : 'done',
    !t.mineTotal && !(t.boardCourses || 0) ? '연수 기록이 없어요' : [mineLeft ? `내 필수연수 미이수 ${mineLeft}개` : '', boardLeft.length ? `현황판 미제출 — ${boardLeft.slice(0, 2).map(x => `${x.title} ${x.left}명`).join(', ')}` : '',
      t.noStaff ? `연수 현황판에 교직원 명단이 없어요(연수 ${t.boardCourses}개)` : ''].filter(Boolean).join(' · ') || '연수를 모두 챙겼어요',
    { to: 'training', tab: !mineLeft && (boardLeft.length || t.noStaff) ? 'board' : 'mine' }));
  // 7. 예산 집행
  const ps = (d.budget || []).filter(p => p && p.project);
  // 남은 돈(예산 − 집행 − 예정)과 에듀파인에 올리기 전 예정(품의 초안) — 둘 다 0이어야 다 됨
  const money = ps.reduce((n, p) => n + Math.max(0, p.left || 0), 0), plan = ps.reduce((n, p) => n + Math.max(0, p.planned || 0), 0);
  out.push(row('budget', !ps.length ? 'none' : money || plan ? 'todo' : 'done', !ps.length ? '등록한 사업이 없어요'
    : money || plan ? `${[money ? `남은 예산 ${won(money)}원(${ps.filter(p => p.left > 0).length}개 사업)` : '', plan ? `예정 ${won(plan)}원 에듀파인에 올리기 전` : ''].filter(Boolean).join(' · ')} — 불용·이월을 확인하세요` : '사업 예산을 모두 썼어요', { to: 'budget' }));
  // 8. 공문
  const docs = (d.gongmun || []).filter(x => x && !x.done);
  out.push(row('gongmun', !(d.gongmun || []).length ? 'none' : docs.length ? 'todo' : 'done', !(d.gongmun || []).length ? '넣은 공문이 없어요' : docs.length ? `다 하지 않은 공문 ${docs.length}개` : '공문을 모두 처리했어요', { to: 'gongmun' }));
  // 9. 인수인계서: 만든 기록이 없어 [했어요]로만
  out.push(row('handover', 'todo', '다음 담당자에게 넘길 인수인계서(연간계획·행사·예산·공문·기초학력·연수가 모여요)', { to: 'handover' }));
  // 10. 백업
  const days = d.backupAt ? Math.floor(((d.now || Date.now()) - d.backupAt) / 864e5) : null;
  out.push(row('backup', days != null && days <= 30 ? 'done' : 'todo', days == null ? '아직 백업 파일을 만들지 않았어요' : days <= 30 ? `마지막 백업 ${days < 1 ? '오늘' : `${days}일 전`}` : `마지막 백업이 ${days}일 전이에요`, { to: 'settings', tab: 'years' }));
  // 11. 새 학년도 준비
  out.push(row('newyear', d.prepYear ? 'todo' : 'none', d.prepYear ? `${d.prepYear}학년도를 시작하세요(연간계획·학교 정보·명단을 가져가요)` : '1·2월에 새 학년도를 시작해요', { to: 'settings', tab: 'years' }));
  return out;
}
/* 한눈에: 다 된 줄 / 셀 줄(해당 없음 빼고) */
export const yearendScore = rows => { const live = rows.filter(r => r.state !== 'none'); return { done: live.filter(r => r.state === 'done').length, total: live.length }; };
