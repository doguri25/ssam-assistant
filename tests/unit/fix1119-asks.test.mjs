/* 2026-11-19 선생님 요청: 쪽지 작성에서 교직원 이름이 새는 것(명단 이름·「미제출: …」), 오늘 화면 기초학력 출석의 결석 덮어쓰기, 이수증은 이수번호만.
   예시 이름은 지어낸 것(남다율·탁보결도 지어낸 이름) */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; };
beforeEach(() => store.useStorage(mem()));

test('이름 가리기: 「미제출: …」「아직 안 낸 분: …」「참석자: …」 뒤 목록, 직함 옆 이름은 쪽지 작성(cleanSheet)에서도', async () => {
  const P = await import('../../web/core/privacy.js');
  const { makeRedactor } = await import('../../web/core/redact.js');
  const { cleanSheet } = await import('../../web/menus/evaluate/activity/activity-read.js');
  for (const s of ['미제출: 남다율, 탁보결', '아직 안 낸 분: 남다율, 탁보결 선생님', '참석자: 남다율, 탁보결', '미이수자 명단: 김솔, 남다율 (2명)']) {
    for (const [tag, out] of [['strip', P.stripNames(s).text], ['redact', makeRedactor().lines([s])[0].text], ['sheet', cleanSheet(s).text]])
      for (const n of ['남다율', '탁보결', '김솔']) assert.ok(!out.includes(n), `${tag}: ${s} → ${out}`);
  }
  for (const s of ['남다율 선생님께 다시 안내', '탁보결님께서 내셨어요']) assert.ok(!/남다율|탁보결/.test(cleanSheet(s).text), cleanSheet(s).text);
  // 사람이 아닌 목록은 그대로
  for (const s of ['미제출: 12월 5일까지 내 주세요', '대상자: 전 교직원', '참석자: 교감, 교무부장, 3학년 담임']) assert.equal(P.stripNames(s).text, s, s);
  assert.equal(cleanSheet('청렴교육 이수증 제출 안내\n미제출: 남다율, 탁보결\n12월 5일까지').names, 2);
});

test('이름 가리기: 연수 현황판 교직원 명단의 이름은 어느 길에서든(조사·호칭이 붙어도), 낱말 속은 아님', async () => {
  const P = await import('../../web/core/privacy.js');
  const { makeRedactor } = await import('../../web/core/redact.js');
  const { maskPersons } = await import('../../web/core/chat-names.js');
  assert.deepEqual(P.knownStaff(), []);
  assert.equal(P.stripNames('탁보결과 남다율이 함께').text, '탁보결과 남다율이 함께', '명단이 없으면 흔한 이름 규칙만');
  store.set('training:board', { staff: [{ id: 'a', name: '남다율', dept: '' }, { id: 'b', name: '탁보결', dept: '' }, { id: 'c', name: '이산', dept: '' }], courses: [], marks: {} });
  assert.deepEqual(P.knownStaff(), ['남다율', '탁보결', '이산']);
  for (const s of ['탁보결과 남다율이 함께', '지난번 남다율님 질문', '탁보결 선생님 안녕하세요', '이산 선생님께']) {
    for (const [tag, out] of [['strip', P.stripNames(s).text], ['staff', P.maskStaff(s).text], ['persons', maskPersons(s).text], ['redact', makeRedactor().lines([s])[0].text]])
      assert.ok(!/남다율|탁보결|이산(?!화)/.test(out), `${tag}: ${s} → ${out}`);
  }
  assert.equal(P.stripNames('이산화탄소 실험').text, '이산화탄소 실험', '이름 뒤에 다른 글자가 붙은 낱말은 아님');
  // 명단을 바꾸면 바로 따라감
  store.set('training:board', { staff: [], courses: [], marks: {} });
  assert.deepEqual(P.knownStaff(), []);
});

test('오늘 화면 기초학력 출석: 결석이 섞인 학생 수(누르기 전에 물을 때)', async () => {
  const H = await import('../../web/menus/home/home-model.js');
  const M = await import('../../web/menus/class/camp-model.js');
  const s1 = M.newSession({ date: '2026-11-19', start: '14:00', end: '14:40' }), s2 = M.newSession({ date: '2026-11-19', start: '14:50', end: '15:30' });
  const camp = { id: 'c', unit: 'period', sessions: [s1, s2], students: [{ id: 'a', name: '김하늘' }, { id: 'b', name: '이바다' }], att: { [s1.id]: { a: 'O', b: 'O' }, [s2.id]: { a: 'X' } } };
  assert.equal(H.absentOn(camp, '2026-11-19', 'a'), 1);
  assert.equal(H.absentOn(camp, '2026-11-19', 'b'), 0, '출석과 빈칸만 섞임 — 묻지 않음');
  assert.deepEqual(H.dayMarks(camp, '2026-11-19').map(s => s.mark), ['mixed', 'mixed']);
});

test('이수번호: 「제 … 호」「이수번호:」·하이픈 꼴을 읽고, 날짜·전화번호는 아님', async () => {
  const T = await import('../../web/menus/training/training-model.js');
  for (const [t, want] of [['이 수 증\n제 중앙교육연수원-유초중-직무-2026-012345 호\n성명: 김하늘', '중앙교육연수원-유초중-직무-2026-012345'],
    ['이수번호: 충남-특직-2026-001\n성명 김하늘', '충남-특직-2026-001'], ['충남 - 특직 - 2026 - 0042\n위 사람은', '충남-특직-2026-0042'],
    ['제 2026-12345 호\n이수증', '2026-12345'], ['중앙교육연수원-유초중-직무-2026-12345호 위 사람은', '중앙교육연수원-유초중-직무-2026-12345'],
    ['이수증\n교육기간 2026-03-01 ~ 2026-12-31\n전화 041-123-4567', ''], ['연수명: 2026 청렴교육(3-2-4)', '']])
    assert.equal(T.certCode(t), want, t);
  assert.equal(T.codeNorm(' 제 충남 - 특직 - 2026 - 7 호 '), '충남-특직-2026-7');
  // 내 필수연수: 이수번호를 넣고(파일 이름은 그대로), 저장값에 남음
  const items = T.withDefaults([]).list;
  const r = T.readCert({ name: 'scan.pdf', text: '이수증\n이수번호: 충남-특직-2026-001\n과정명: 청렴교육(부패방지)\n이수일: 2026. 11. 3.' }, items, '2026-11-19');
  assert.equal(r.code, '충남-특직-2026-001');
  const x = T.applyCert(items.find(i => i.id === r.id), { name: 'scan.pdf', ...r }, '2026-11-19');
  assert.equal(x.certNo, '충남-특직-2026-001'); assert.equal(T.normItem(x).certNo, '충남-특직-2026-001');
  // 현황판: 칸 글·명단표·결과 보고에 이수번호, 구글 폼 「이수번호」 칸
  let b = T.normBoard({ staff: [{ id: 's1', name: '김하늘', dept: '3학년' }], courses: [{ id: 'c1', title: '청렴교육' }], marks: {} });
  b = T.setMark(b, 'c1', 's1', 'sent', { date: '2026-11-03', code: '충남-특직-2026-001' });
  assert.equal(T.normBoard(b).marks.c1.s1.code, '충남-특직-2026-001');
  assert.equal(T.cellText(b, b.courses[0], b.staff[0]), '제출(11. 3.) 충남-특직-2026-001');
  assert.ok(T.boardCsv(b).includes('제출(11. 3.) 충남-특직-2026-001'));
  const rep = T.reportDoc(b, { cids: ['c1'], year: 2026 });
  assert.ok(rep.blocks.some(x => x.type === 'table' && x.rows.some(row => row.includes('이수(11. 3.) 충남-특직-2026-001'))), '결과 보고 명단');
  assert.ok(rep.blocks.some(x => x.text === '붙임  1. 연수별 이수 현황 명단 1부.  끝.'), '보관한 이수증이 없으면 붙임 2 없음');
  const f = T.formResponses([['타임스탬프', '성명', '이수번호'], ['2026/11/06 10:00:00', '김하늘', '제 충남-특직-2026-0009 호']], b);
  assert.deepEqual(f.hits, [{ sid: 's1', cid: 'c1', link: '', date: '2026-11-06', code: '충남-특직-2026-0009' }]);
  // 「이수증 번호」 칸은 파일 칸이 아님
  const g = T.formResponses([['성명', '이수증 번호', '이수증 업로드'], ['김하늘', '충남-특직-2026-0010', 'https://drive.google.com/x']], b);
  assert.deepEqual(g.hits[0], { sid: 's1', cid: 'c1', link: 'https://drive.google.com/x', date: '', code: '충남-특직-2026-0010' });
  assert.ok(T.formGuide(b, 2026).includes('이수번호 (단답형, 필수)'));
});
