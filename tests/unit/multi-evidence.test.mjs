// 기타 › 다면평가 근거자료(스펙 2026-11-11): 공문·이수증 글에서 「제목 [번호, 날짜.]」(제목 줄, ○○학교-1234·[1234,·제1234호, 시행 날짜),
// 모자라면 있는 것만, 아무것도 없으면 파일 이름(확장자 뺌), 비고 칸 글(• 줄마다), 넣을 수 있는 파일
import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceLabel, composeLabel, isComplete, notesText, okEvidenceFile, EVIDENCE_ACCEPT, MAX_EVIDENCE } from '../../web/menus/etc/multi-evidence.js';

const GONGMUN = `새싹초등학교
수신  내부결재
(경유)
제목  2025학년도 학교 교육과정(수정)
1. 관련: 새싹초등학교-1200(2025. 3. 1.)
2. 2025학년도 학교 교육과정을 붙임과 같이 수정하고자 합니다.
붙임  학교 교육과정(수정) 1부.  끝.
교사 한가람  교감 ○○○  교장 ○○○
시행  새싹초등학교-9959 (2025. 7. 22.)  접수
우 12345 어느시 어느로 1`;

test('공문: 제목 줄 · 시행 문서 번호 · 시행 날짜(관련 공문 날짜가 아님) → 「제목 [번호, 날짜.]」', () => {
  const r = evidenceLabel(GONGMUN, '교육과정 수정.pdf');
  assert.deepEqual(r, { title: '2025학년도 학교 교육과정(수정)', no: '9959', date: '2025.07.22.', label: '2025학년도 학교 교육과정(수정) [9959, 2025.07.22.]' });
  assert.ok(isComplete(r));
});

test('표로 읽힌 공문(제목 | …), 「제 목 :」, 문서 번호 [1234, · 제1234호, 날짜 2025년 4월 3일', () => {
  assert.equal(evidenceLabel('수신 | 내부결재\n제목 | 학습공동체 운영 계획\n시행 | 새싹초등학교-321 | 2025. 3. 14.', 'a.hwp').label, '학습공동체 운영 계획 [321, 2025.03.14.]');
  assert.equal(evidenceLabel('제 목 : 수업 공개의 날 운영\n시행 2025.04.10.', 'x.hwpx').label, '수업 공개의 날 운영 [2025.04.10.]', '번호가 없으면 날짜만');
  const b = evidenceLabel('동료장학 계획 [1234, 2025.03.05.]', '동료장학.pdf');
  assert.equal(b.no, '1234'); assert.equal(b.date, '2025.03.05.');
  assert.equal(b.label, '동료장학 [1234, 2025.03.05.]', '제목이 없으면 파일 이름 + 번호·날짜');
  const c = evidenceLabel('상 장\n제1234호\n위 학생은 …\n2025년 4월 3일\n새싹초등학교장', '교내 상장.jpg');
  assert.equal(c.no, '1234'); assert.equal(c.date, '2025.04.03.');
  assert.ok(!isComplete(c), '제목이 없으면 다 갖추지 않음');
});

test('아무것도 못 찾으면 파일 이름(확장자 뺌), 이상한 날짜는 버림, 긴 제목은 줄임', () => {
  assert.deepEqual(evidenceLabel('', '직무연수 이수증.pdf'), { title: '', no: '', date: '', label: '직무연수 이수증' });
  assert.equal(evidenceLabel('2025. 13. 40. 아무 글', '사진.png').date, '');
  assert.equal(evidenceLabel(null, '').label, '근거자료');
  const long = evidenceLabel('제목 ' + '가'.repeat(200), 'f.pdf');
  assert.ok(long.title.length <= 81 && long.title.endsWith('…'), long.title);
});

test('라벨 짓기·비고 칸 글(• 줄마다, 빈 라벨은 뺌)', () => {
  assert.equal(composeLabel({ title: '연수 이수증', no: '', date: '2025.08.01.' }, 'f.pdf'), '연수 이수증 [2025.08.01.]');
  assert.equal(composeLabel({ title: '', no: '', date: '' }, '상담 기록.hwpx'), '상담 기록');
  assert.equal(notesText([{ label: '학교 교육과정(수정) [9959, 2025.07.22.]' }, { label: ' ' }, { label: '연수 이수증' }]), '• 학교 교육과정(수정) [9959, 2025.07.22.]\n• 연수 이수증');
  assert.equal(notesText([]), '');
  assert.equal(notesText(null), '');
});

test('넣을 수 있는 근거자료: PDF·한글·워드·사진, 5MB까지', () => {
  assert.equal(MAX_EVIDENCE, 5 * 1024 * 1024);
  for (const n of ['a.pdf', 'b.hwp', 'c.HWPX', 'd.docx', 'e.jpg', 'f.jpeg', 'g.png', 'h.webp', 'i.heic']) assert.equal(okEvidenceFile({ name: n, size: 10 }), '', n);
  assert.equal(okEvidenceFile({ name: 'x.exe', size: 10 }), 'type');
  assert.equal(okEvidenceFile({ name: 'x.pdf', size: MAX_EVIDENCE + 1 }), 'size');
  assert.ok(EVIDENCE_ACCEPT.includes('.pdf') && EVIDENCE_ACCEPT.includes('.hwp'));
});
