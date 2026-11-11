// 기타 › 다면평가: 검토에서 나온 것 — 채팅 길 빼앗기, 고른 지표가 다른 지표로 넘어감, 근거자료 항목 맞추기,
// 짧은 학교 이름·「성명 ○○○」 가리기, 「20~22시간 미만」, 수 쓰기(1,5·.5·음수), 6개월·감점 말 꼴, 근거자료 제목 줄, 기초 자료 칸 이름 빈칸
// 학교·사람 이름은 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import { routeText } from '../../web/core/chat-route.js';
import { searchGuide } from '../../web/core/chat-knowledge.js';
import { maskFor } from '../../web/menus/etc/multi-ai.js';
import { parseTier, parseDeduct, toNum, itemScore, deriveItem, defaultQuant, allItems } from '../../web/menus/etc/multi-quant.js';
import { remapQuant, shiftPick } from '../../web/menus/etc/multi-model.js';
import { evidenceLabel } from '../../web/menus/etc/multi-evidence.js';
import { normReport, parseQualText, DEFAULT_QUAL } from '../../web/menus/etc/multi-qual.js';

test('채팅: 다면평가 낱말이 들어도 쪽지·가정통신문·단원평가·평어·결과 보고서 부탁은 그 탭으로', () => {
  for (const [t, want] of [['쪽지: 다면평가 자료 제출 안내', 'message'], ['다면평가 위원회 개최 안내 쪽지 써 줘', 'message'], ['가정통신문 정량평가 안내', 'letter'],
    ['단원평가 정량평가 문항 만들어 줘', 'unit'], ['정성 평가 결과 보고서 써 줘', 'report']]) assert.equal(routeText(t).intent, want, t);
  assert.notEqual(routeText('교과 평어 정성평가로 써 줘').intent, 'multi');
  for (const t of ['다면평가', '자기실적평가서 써 줘', '교사 다면평가 정량평가 점수 계산']) assert.equal(routeText(t).intent, 'multi', t);
  for (const q of ['품의 증빙 서류는?', '결과 보고 근거자료 넣는 법']) assert.notEqual((searchGuide(q)[0] || {}).id, 'multi', q);
});

test('가리기: 내 정보 학교의 짧은 이름(푸른솔초·푸른솔초-555·푸른솔 초등학교)과 「성명 ○○○」·「확인자 … 성명 ○ ○ ○」', () => {
  const info = { school: '푸른솔초등학교', name: '한가람' };
  const s = maskFor('소속: 푸른솔초 / 문서 푸른솔초-555 / 푸른솔 초등학교 / 푸른솔중 / 성명 마루한 서명(인) / 확인자 : 직위 교감 성명 도 담 비 서명(인)', info);
  for (const w of ['푸른솔', '마루한', '도 담 비']) assert.ok(!s.includes(w), `${w}: ${s}`);
  assert.ok(s.includes('555'), '문서 번호는 그대로');
});

test('지표 「20시간~22시간 미만」: 20 이상 22 미만(19시간은 이 지표가 아님)', () => {
  const t = parseTier('20시간~22시간 미만', 24);
  assert.deepEqual([t.min, t.minInc, t.max, t.maxInc], [20, true, 22, false]);
  const it = deriveItem({ id: 'q', name: '주당 수업시수', max: 25, tiers: [{ label: '22시간 이상', points: 25 }, { label: '20시간~22시간 미만', points: 24 }, { label: '20시간 미만', points: 23 }] });
  assert.deepEqual([19, 20, 21.9, 22].map(v => itemScore(it, { v: String(v) })), [23, 24, 24, 25]);
});

test('수 쓰기: 「1,5」·「22,8」은 소수, 「.5」는 0.5, 「1,000」은 천, 수 넣는 칸의 음수는 빈칸', () => {
  assert.deepEqual(['1,5', '22,8', '.5', '1,000', '22.8시간'].map(toNum), [1.5, 22.8, 0.5, 1000, 22.8]);
  const it = deriveItem({ id: 'q', name: '주당 수업시수', max: 25, tiers: [{ label: '22시간 이상', points: 25 }, { label: '22시간 미만', points: 23 }] });
  assert.equal(itemScore(it, { v: '-1' }), null);
});

test('「6개월 이하」·감점 말 꼴 여럿', () => {
  for (const l of ['통합학급 (근무 6개월 이하 4.5점)', '통합학급 (6개월 미만 4.5점)', '통합학급 (6개월이하:4.5점)', '통합학급(6개월 이하는 4.5점)']) assert.equal(parseTier(l, 5).short, 4.5, l);
  assert.deepEqual(parseDeduct('※ 휴직 기간은 1개월당 0.2점씩 감점'), { per: 0.2, unit: '개월', label: '휴직 기간' });
  assert.deepEqual(parseDeduct('※ 휴직은 매월 0.2점씩 감점'), { per: 0.2, unit: '개월', label: '휴직' });
});

test('기준을 바꿔도 고른 지표는 지표 글로 찾아 옮기고(없으면 비움), 「[통합학급 유무]」 같은 괄호·빈칸이 달라도 같은 항목', () => {
  const old = defaultQuant();
  const duty = allItems(old).find(i => /업무\s*곤란/.test(i.name)), gl = allItems(old).find(i => /생활지도\s*곤란/.test(i.name));
  const pick = duty.tiers.findIndex(t => /연구부장/.test(t.label));
  assert.ok(pick > 0);
  const quant = { criteria: old, values: { [duty.id]: { v: String(pick) }, [gl.id]: { v: '0' } }, evidence: { [gl.id]: [{ id: 'e1', fileId: 'f1', name: 'a.pdf', label: 'a' }] }, notes: {}, notesEdited: {} };
  const neu = JSON.parse(JSON.stringify(old));
  const nd = allItems(neu).find(i => /업무\s*곤란/.test(i.name));
  nd.tiers.unshift({ ...nd.tiers[0], label: '교감 대행' }); // 앞에 지표가 하나 더 생김
  const ng = allItems(neu).find(i => /생활지도\s*곤란/.test(i.name));
  ng.name = '생활지도 곤란도 [통합학급 유무]';
  for (const it of allItems(neu)) it.id = it.id + '-n';
  const { quant: q, dropped } = remapQuant(quant, neu);
  assert.ok(/연구부장/.test(nd.tiers[+q.values[nd.id].v].label), JSON.stringify(q.values[nd.id]));
  assert.ok(q.evidence[ng.id] && q.evidence[ng.id].length === 1, '괄호가 붙어도 같은 항목');
  assert.equal(dropped.length, 0);
  nd.tiers = nd.tiers.filter(t => !/연구부장/.test(t.label));
  assert.equal(remapQuant(quant, neu).quant.values[nd.id].v, undefined, '같은 지표가 없으면 비움');
});

test('지표를 지우면 고른 차례를 당기고, 지운 지표를 골랐으면 비움', () => {
  const values = { a: { v: '2' }, b: { v: '1' }, c: { v: '0', deduct: '1' } };
  shiftPick(values, 'a', 1); shiftPick(values, 'b', 1); shiftPick(values, 'c', 3);
  assert.deepEqual(values, { a: { v: '1' }, b: {}, c: { v: '0', deduct: '1' } });
});

test('근거자료 제목 줄: 시행이 줄 가운데여도 시행 번호·날짜(관련 공문 번호가 아님), COVID-19는 번호 아님, 「제 2025-12345 호」', () => {
  const a = evidenceLabel('제목 교원 연수 안내\n1. 관련: 교육지원과-12345(2025. 2. 10.)\n협조자 | 시행 푸른솔초등학교-7777 (2025. 4. 10.)', 'x.pdf');
  assert.deepEqual([a.no, a.date], ['7777', '2025.04.10.']);
  const b = evidenceLabel('제목 COVID-19 예방 교육 결과', 'y.pdf');
  assert.equal(b.no, '');
  const c = evidenceLabel('제목 표창장\n제 2025-12345 호', 'z.pdf');
  assert.equal(c.no, '2025-12345');
});

test('정성 기준이 바뀌어도 기초 자료는 칸 이름의 빈칸을 무시하고 옮김', () => {
  const p = JSON.parse(JSON.stringify(parseQualText('') || DEFAULT_QUAL));
  const i = p.basics.findIndex(b => /수업\s*공개/.test(b));
  const old = p.basics[i];
  p.basics[i] = '연간 수업 공개 실적';
  const r = normReport({ basics: { [old.replace(/\s/g, '').replace('수업공개', '수업공개')]: '2회', [old]: '2회' } }, p);
  assert.equal(r.basics['연간 수업 공개 실적'], '2회');
});

test('정성 기준이 바뀌면 고친 칸 표시도 새 칸 이름으로(빈칸 무시), 없는 칸은 버림', async () => {
  const { remapFilled } = await import('../../web/menus/etc/multi-qual.js');
  const p = JSON.parse(JSON.stringify(DEFAULT_QUAL));
  const i = p.basics.findIndex(b => /수업\s*공개/.test(b)), old = p.basics[i];
  p.basics[i] = old.replace('수업공개', '수업 공개');
  const learn = p.sections.find(s => s.key === 'learn');
  const out = remapFilled({ [`basics.${old}`]: true, [`sections.learn.${learn.parts[0]}`]: true, 'basics.없는 칸': true, 'self.노력도': true }, p);
  assert.deepEqual(Object.keys(out).sort(), [`basics.${p.basics[i]}`, `sections.learn.${learn.parts[0]}`, 'self.노력도'].sort());
});
