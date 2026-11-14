// 계획서가 작년(기존) 계획서 양식을 그대로 따름: 연간계획 초안 칸 차례·제목·번호 꼴 = 작년 계획서의 큰 제목(없는 칸은 덧붙임 칸)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
const { yearOutline, normDraft, planDoc, draftText, overlap } = await import('../../web/menus/plan/year-model.js');

const LAST = ['2025학년도 독서교육 운영 계획', 'Ⅰ. 추진 근거', '1. 2025 독서교육 기본계획', 'Ⅱ. 목적', '책을 즐겨 읽는 습관을 기른다.', 'Ⅲ. 운영 방침', '가. 전교생이 참여한다.',
  'Ⅳ. 세부 추진 내용', '1. 아침 독서', '2. 독서 행사', 'Ⅴ. 추진 일정', '3월 계획 수립', 'Ⅵ. 소요 예산', '도서 구입 500,000원', 'Ⅶ. 기대 효과', '독서량이 는다.'].join('\n');

test('작년 계획서의 큰 제목 → 초안 칸 차례(목적·방침·세부·일정·예산·평가에 맞추고, 맞지 않는 제목은 덧붙임 칸), 번호 꼴', () => {
  const o = yearOutline(LAST);
  assert.equal(o.roman, true);
  assert.deepEqual(o.items.map(x => [x.key, x.title]), [['x1', '추진 근거'], ['purpose', '목적'], ['policy', '운영 방침'], ['details', '세부 추진 내용'], ['schedule', '추진 일정'], ['budget', '소요 예산'], ['evaluation', '기대 효과']]);
  const n = yearOutline('1. 사업 개요\n2. 필요성\n3. 추진 계획\n가. 운영\n4. 월별 일정\n5. 평가 및 환류');
  assert.equal(n.roman, false);
  assert.deepEqual(n.items.map(x => x.key), ['x1', 'purpose', 'details', 'schedule', 'evaluation']);
  assert.deepEqual(yearOutline('그냥 글\n제목 없음').items, [], '큰 제목이 셋보다 적으면 앱의 기본 차례');
  assert.deepEqual(yearOutline('').items, []);
});

test('초안에 목차와 덧붙임 칸이 남고(목차에 없는 덧붙임 글은 버림), 글 계산에도 들어감', () => {
  const o = yearOutline(LAST);
  const d = normDraft({ purpose: '목적 글', policy: '방침', details: '세부', evaluation: '효과', schedule: [{ title: '계획 수립', date: '2026-03-10' }], budget: [{ name: '도서', amount: 500000 }], x1: '근거 글', x9: '버릴 글', outline: o.items, roman: o.roman });
  assert.equal(d.x1, '근거 글');
  assert.ok(!('x9' in d));
  assert.equal(d.outline.length, 7);
  assert.ok(draftText(d).includes('근거 글'));
  assert.ok(overlap('근거 글', d) !== null);
  assert.deepEqual(normDraft({ purpose: 'a' }).outline, [], '옛 초안은 목차 없음(기본 차례)');
});

test('문서도 작년 차례·제목·번호 꼴(Ⅰ. Ⅱ.)로, 일정·예산 표는 그 제목 아래', () => {
  const o = yearOutline(LAST);
  const d = normDraft({ purpose: '목적 글', policy: '방침', details: '세부', evaluation: '효과', schedule: [{ title: '계획 수립', date: '2026-03-10' }], budget: [{ name: '도서', amount: 500000 }], x1: '근거 글', outline: o.items, roman: true });
  const doc = planDoc({ year: 2026, name: '독서교육', draft: d });
  const heads = doc.blocks.filter(b => b.type === 'h').map(b => b.text);
  assert.deepEqual(heads, ['Ⅰ. 추진 근거', 'Ⅱ. 목적', 'Ⅲ. 운영 방침', 'Ⅳ. 세부 추진 내용', 'Ⅴ. 추진 일정', 'Ⅵ. 소요 예산', 'Ⅶ. 기대 효과']);
  const i = doc.blocks.findIndex(b => b.text === 'Ⅴ. 추진 일정');
  assert.equal(doc.blocks[i + 1].type, 'table');
  assert.equal(doc.blocks[1].text, '근거 글');
  // 목차가 없으면 앱의 기본 차례 그대로
  const plain = planDoc({ year: 2026, name: '독서교육', draft: normDraft({ purpose: '목적 글' }) });
  assert.equal(plain.blocks[0].text, '1. 목적');
});

test('행사계획: 참고 자료 「작년·기존 계획서」 — 이름으로 알아보고, 계획서 규칙이 그 목차(제목·차례·번호 꼴)를 따름', async () => {
  const E = await import('../../web/menus/plan/event-model.js');
  assert.equal(E.guessKind('2026 작년 운동회 계획서.hwpx'), 'last');
  assert.equal(E.guessKind('기존 학예회 계획.hwp'), 'last');
  assert.equal(E.guessKind('학교 교육계획.hwpx'), 'upper', '그대로');
  const last = { id: 'r1', kind: 'last', name: '2026 운동회 계획서', text: 'Ⅰ. 개요\n1. 일시\nⅡ. 운영 방침\nⅢ. 세부 운영\n가. 경기\nⅣ. 안전 대책\nⅤ. 평가' };
  const r = E.planOutlineRule([last]);
  assert.ok(r.includes('목차를 그대로') && r.includes('Ⅰ. 개요 / Ⅱ. 운영 방침 / Ⅲ. 세부 운영 / Ⅳ. 안전 대책 / Ⅴ. 평가'), r);
  assert.equal(E.planOutlineRule([{ ...last, kind: 'official' }]), '', '작년·기존 계획서가 없으면 빈 글(기본 차례)');
  assert.ok(E.planOutlineRule([{ ...last, text: '그냥 글' }]).includes('짜임·문체'), '목차를 못 찾으면 짜임·문체만');
});
