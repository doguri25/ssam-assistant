// 단원평가 1단계 단추가 이름대로: [학생 문제지 넣기(스캔한 것)]·[답안 넣기]에 다른 것을 넣어도 맞는 곳으로,
// 한꺼번에 넣기에서 나눈 것을 어디에 넣을지, 떠 있는 버튼이 「답안」 이름의 정답표를 학생 문제지로 보지 않음 — AI 없이
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDocFile, paperFileGoes, keyScanGoes, bundleParts } from '../../web/menus/evaluate/unit/unit-route.js';
import { classify } from '../../web/core/inbox-classify.js';

const fx = name => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
const pg = (extra = {}) => ({ url: 'blob:x', ...extra });

test('한글·글 파일은 스캔이 아님(이름·종류로)', () => {
  assert.equal(isDocFile({ name: '정답.hwp' }), true);
  assert.equal(isDocFile({ name: '정답.HWPX' }), true);
  assert.equal(isDocFile({ name: '정답.txt' }), true);
  assert.equal(isDocFile({ name: '메모', type: 'text/plain' }), true);
  assert.equal(isDocFile({ name: '3반.pdf', type: 'application/pdf' }), false);
  assert.equal(isDocFile({ name: 'IMG_0001.jpg', type: 'image/jpeg' }), false);
});

test('[학생 문제지 넣기]에 넣은 한글·글 파일: 정답표·정답이 붙은 문제지는 답안, 문제만 있는 문제지는 빈 문제지', () => {
  assert.equal(paperFileGoes({ name: '국어 2단원.hwp', text: fx('unit-key.txt') }), 'key');
  assert.equal(paperFileGoes({ name: '도덕.hwp', text: fx('unit-key-inline.txt') }), 'key');
  assert.equal(paperFileGoes({ name: '과학 중간평가.txt', text: fx('unit-combined.txt') }), 'key');
  assert.equal(paperFileGoes({ name: '국어 2단원.hwp', text: fx('unit-paper.txt') }), 'paper');
  assert.equal(paperFileGoes({ name: '도덕 5단원.hwp', text: fx('unit-paper-inline.txt') }), 'paper');
  // 무엇인지 모르는 글 파일도 스캔은 아님: 답안 쪽(AI가 읽음)
  assert.equal(paperFileGoes({ name: '메모.txt', text: '아무 글' }), 'key');
});

test('[학생 문제지 넣기]에 넣은 PDF·사진: 이름이 정답·해설·교사용이면 답안, 아니면 학생 문제지 그대로', () => {
  assert.equal(paperFileGoes({ name: '3반 1~25번.pdf' }), 'scan');
  assert.equal(paperFileGoes({ name: 'IMG_0001.jpg' }), 'scan');
  assert.equal(paperFileGoes({ name: '단원평가 정답.pdf' }), 'key');
  assert.equal(paperFileGoes({ name: '해설.png' }), 'key');
  assert.equal(paperFileGoes({ name: '교사용.pdf' }), 'key');
  assert.equal(paperFileGoes({ name: '모범 답안.jpg' }), 'key');
  // 시연 학생 답안(「…답안-예시.pdf」)·「3반 답안.pdf」는 학생 문제지 그대로
  assert.equal(paperFileGoes({ name: '단원평가-답안-예시.pdf' }), 'scan');
  assert.equal(paperFileGoes({ name: '3반 답안.pdf' }), 'scan');
});

test('[답안 넣기]에 넣은 PDF를 한꺼번에 넣기처럼 나눈 것: 학생 쪽이라는 근거(글자 인식·AI)가 있을 때만 학생 문제지', () => {
  // AI가 앞뒤 쪽을 보고 모두 학생 → 학생 문제지
  const seen = { pages: [pg(), pg(), pg(), pg(), pg()], roles: ['student', 'student', 'student', 'student', 'student'], seen: [0, 1, 3, 4] };
  assert.equal(keyScanGoes(seen), 'papers');
  // 글자 인식된 학생 스캔 묶음(복사기 PDF) → 학생 문제지
  assert.equal(keyScanGoes({ pages: [pg({ ocr: true }), pg({ ocr: true })], roles: ['student', 'student'] }), 'papers');
  // 맨 앞이 정답 쪽이고 나머지는 학생 → 나눠 넣기
  assert.equal(keyScanGoes({ pages: [pg(), pg(), pg(), pg()], roles: ['teacher', 'student', 'student', 'student'], seen: [0, 1, 2, 3] }), 'both');
  // 근거 없는 「학생」(AI를 부르지 않은 한두 쪽, AI가 보지 않은 가운데 쪽) → 이름대로 답안
  assert.equal(keyScanGoes({ pages: [pg(), pg()], roles: ['student', 'student'] }), 'key');
  assert.equal(keyScanGoes({ pages: [pg(), pg(), pg(), pg(), pg()], roles: ['teacher', 'teacher', 'student', 'teacher', 'teacher'], seen: [0, 1, 3, 4] }), 'key');
  // 모두 정답·교사용이거나 쪽이 없으면(글자층 문서) 답안
  assert.equal(keyScanGoes({ pages: [pg(), pg(), pg()], roles: ['teacher', 'teacher', 'teacher'], seen: [0, 1, 2] }), 'key');
  assert.equal(keyScanGoes({ doc: { student: '정답 글' }, pages: [], roles: [] }), 'key');
  assert.equal(keyScanGoes(null), 'key');
  // 빈 문제지 쪽 + 학생 쪽(답안 쪽은 없음)도 학생 문제지가 들어 있음 → 나눠 넣기(빈 쪽은 답안으로 읽지 않음)
  assert.equal(keyScanGoes({ pages: [pg(), pg(), pg()], roles: ['blank', 'student', 'student'], seen: [0, 1, 2] }), 'both');
});

test('[버그] 한꺼번에 넣기: 정답·해설지 앞머리 몇 줄(「정답 및 해설지」 앞)은 빈 문제지 칸에 넣지 않음(넣어 둔 문제지를 덮어쓰지 않게)', () => {
  // 고치기 전: 「/1」 한 줄이 빈 문제지 글로 들어가 넣어 둔 문제지를 덮어씀
  const p = bundleParts({ doc: { student: '/1', teacher: fx('unit-key-inline.txt').split('\n').slice(1).join('\n') }, pages: [], roles: [] });
  assert.equal(p.paperText, '');
  assert.ok(p.keyText.includes('01 ③'), p.keyText.slice(0, 40));
});

test('한꺼번에 넣기: 문제지+정답 한 파일은 문제 부분이 빈 문제지, 정답만 든 학생용 글은 답안, 문제지만이면 빈 문제지', () => {
  const both = fx('unit-combined.txt'), at = both.indexOf('정답 및 해설');
  const a = bundleParts({ doc: { student: both.slice(0, at), teacher: both.slice(at) }, pages: [], roles: [] });
  assert.ok(a.paperText.includes('곤충이 아닌 것') && a.keyText.startsWith('정답 및 해설'), a.paperText.slice(0, 30));
  const b = bundleParts({ doc: { student: fx('unit-key.txt'), teacher: '' }, pages: [], roles: [] });
  assert.ok(b.keyText.includes('문항번호') && b.paperText === '');
  const c = bundleParts({ doc: { student: fx('unit-paper.txt'), teacher: '' }, pages: [], roles: [] });
  assert.ok(!c.keyText && c.paperText.includes('중요한 내용을 적어요'), c.paperText.slice(0, 30));
});

test('[버그] 한꺼번에 넣기: 빈 문제지 쪽은 답안 그림으로 보내지 않음(정답·교사용 쪽만 답안, 학생 쪽은 학생 문제지)', () => {
  const pages = [pg({ n: 0 }), pg({ n: 1 }), pg({ n: 2 }), pg({ n: 3 })];
  const p = bundleParts({ doc: {}, pages, roles: ['blank', 'teacher', 'student', 'student'] });
  assert.deepEqual(p.keyPages.map(x => x.n), [1]);
  assert.deepEqual(p.blankPages.map(x => x.n), [0]);
  assert.deepEqual(p.stuPages.map(x => x.n), [2, 3]);
});

test('[버그] 떠 있는 버튼: 「답안」·「모범 답안」 이름의 정답표 한글 파일은 학생 문제지(스캔)가 아니라 단원평가 답안', () => {
  assert.equal(classify({ name: '수학 3단원 답안.hwp', text: fx('unit-key.txt') }).kind, 'unit-key');
  assert.equal(classify({ name: '3단원 모범 답안.hwp', text: fx('unit-key.txt') }).kind, 'unit-key');
  assert.equal(classify({ name: '도덕 답안.hwp', text: fx('unit-key-inline.txt') }).kind, 'unit-key');
  assert.equal(classify({ name: '과학 답안.hwp', text: fx('unit-combined.txt') }).kind, 'unit-key');
  // 사진·스캔도 이름이 「모범 답안」·「예시 답안」이면 답안
  assert.equal(classify({ name: '모범 답안.jpg', scan: true }).kind, 'unit-key');
  // 학생 스캔은 그대로: 글자 인식된 문제지에 「답안」 이름, 이름 없는 사진
  assert.equal(classify({ name: '단원평가 답안.pdf', text: fx('unit-paper.txt') }).kind, 'unit-scan');
  assert.equal(classify({ name: '3반 답안.pdf', scan: true }).kind, 'unit-scan');
  assert.equal(classify({ name: 'IMG_0001.jpg', scan: true }).kind, 'unit-scan');
});
