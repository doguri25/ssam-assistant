// 가정통신문 번역본(스펙 2026-11-06 K): 줄 머리·그대로 둘 줄, 개인정보 가리기, 보낼 계획·저장(원문 글이 열쇠), 원문과 나란히 문서, 학교 양식 채우기
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { LANGS, langOf, splitMarker, keepAsIs, shape, guard, trSources, planTr, pruneUnits, batches, trPrompt, normAnswers, trPairs, missingCount, bilingualLetter }
  from '../../web/menus/etc/letter-translate.js';
import { plainLetterDoc, defaultPlain } from '../../web/menus/etc/letter-ai.js';
import { readForm, findRoles, fillForm, checkXml } from '../../web/core/hwpx-form.js';
import { letterFormHwpx } from '../../scripts/sample-letter-form.mjs';
import { unzip } from '../../web/core/zip.js';

function mem() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; }
store.useStorage(mem());
const { saveCurrent, getCurrent, pushLetter, listLetters } = await import('../../web/menus/etc/letter-model.js');

const OUT = {
  title: '2026학년도 가을 현장체험학습 안내', date: '2026-11-06',
  body: ['안녕하십니까?', '', '1. 일시: 2026. 11. 12.(목) 09:00~15:00', '  가. 준비물: 도시락, 물', '2026. 11. 12.(목)', '☎ 031-123-4567', '| 시간 | 내용 |', '| 09:00 | 학교 출발 |', '| 15:00 | 15:00 |', '문의: 교무실 031-123-4567', ''],
  replyOn: true, reply: { title: '참가 동의서', fields: ['참가 여부: □ 참가합니다  □ 참가하지 않습니다'], due: '11. 7.(금)까지 제출해 주세요.' },
  short: '11월 12일 현장체험학습이 있어요.\n010-1234-5678'
};
/* 가짜 AI: 보낸 글 앞에 「VI:」 */
const fake = jobs => Object.fromEntries(jobs.map(j => [j.id, `VI: ${j.text}`]));

test('언어: 4개(베트남어·중국어 간체·러시아어·영어), 이름·코드 모두 알아들음', () => {
  assert.deepEqual(LANGS.map(l => l.id), ['vi', 'zh', 'ru', 'en']);
  assert.deepEqual(['vi', '베트남어', 'Vietnamese', 'zh-CN', '중국어(간체)', 'Russian', '러시아어', 'EN', '영어', '일본어', ''].map(langOf), ['vi', 'vi', 'vi', 'zh', 'zh', 'ru', 'ru', 'en', 'en', '', '']);
});

test('줄 머리(1.·가.·1)·□·※)는 앱이 지키고, 전화번호·날짜·시간·숫자만 있는 글은 그대로', () => {
  assert.deepEqual(splitMarker('  가. 준비물: 도시락'), { lead: '  ', mark: '가. ', text: '준비물: 도시락' });
  assert.deepEqual(splitMarker('1. 일시'), { lead: '', mark: '1. ', text: '일시' });
  assert.deepEqual(splitMarker('    1) 상담 시간'), { lead: '    ', mark: '1) ', text: '상담 시간' });
  assert.deepEqual(splitMarker('※ 우천 시 연기'), { lead: '', mark: '※ ', text: '우천 시 연기' });
  assert.equal(splitMarker('1.5배 늘어요').mark, '', '「1.5배」는 머리가 아님');
  assert.equal(splitMarker('11. 7.(금)까지 제출해 주세요.').mark, '', '날짜 「11. 7.」은 머리가 아님');
  assert.equal(splitMarker('1. 12월 일정').mark, '1. ');
  assert.equal(splitMarker('가정에서 지도해 주세요').mark, '');
  for (const t of ['2026. 11. 12.(목)', '☎ 031-123-4567', '09:00~15:00', '11월 12일(목)', '1.', '', '(02) 123-4567', 'a@b.kr', '2026년 3월 3일 목요일']) assert.ok(keepAsIs(t), t);
  for (const t of ['3,000원', '오전 9시', '학교 출발', '일시: 11. 12.']) assert.ok(!keepAsIs(t), t);
});

test('글 → 보낼 조각: 머리 뺀 글, 표는 칸마다(숫자 칸은 그대로), 여러 줄은 줄마다, 그대로 둘 줄은 보내지 않음', () => {
  const a = shape('  가. 준비물: 도시락, 물');
  assert.deepEqual(a.parts, ['준비물: 도시락, 물']);
  assert.equal(a.build(['Đồ dùng: cơm hộp, nước']), '  가. Đồ dùng: cơm hộp, nước');
  const r = shape('| 09:00 | 학교 출발 |');
  assert.deepEqual(r.parts, ['학교 출발']);
  assert.equal(r.build(['Xuất phát | từ trường']), '| 09:00 | Xuất phát / từ trường |', '칸 안 「|」는 「/」로(표가 깨지지 않게)');
  assert.deepEqual(shape('| 15:00 | 15:00 |').parts, []);
  assert.equal(shape('| --- | --- |').build([]), '| --- | --- |');
  const m = shape('현장체험학습이 있어요.\n010-1234-5678\n동의서를 보내 주세요.');
  assert.deepEqual(m.parts, ['현장체험학습이 있어요.', '동의서를 보내 주세요.']);
  assert.equal(m.build(['A', 'B']), 'A\n010-1234-5678\nB');
  assert.deepEqual(shape('2026. 11. 12.(목)').parts, []);
});

test('개인정보: 전화번호·이메일은 {{n}}로 가리고 되돌림, 이름은 ○○○로 가리고 되돌림, 명단 줄은 보내지 않음', () => {
  const g = guard('문의: 교무실 031-123-4567, ssam@school.kr');
  assert.equal(g.text, '문의: 교무실 {{1}}, {{2}}');
  assert.equal(g.back('Liên hệ: văn phòng {{1}}, {{2}}'), 'Liên hệ: văn phòng 031-123-4567, ssam@school.kr');
  assert.equal(g.back('Liên hệ: văn phòng'), 'Liên hệ: văn phòng 031-123-4567 ssam@school.kr', 'AI가 표시를 빼먹으면 끝에 붙임');
  const n = guard('담임 김민수 선생님께 제출');
  assert.ok(!n.text.includes('김민수') && n.text.includes('○○○'), n.text);
  assert.equal(n.back('Nộp cho giáo viên ○○○'), 'Nộp cho giáo viên 김민수');
  assert.equal(guard('정우진, 강민준, 이서연'), null, '명단 줄');
  assert.equal(guard('이름: 김하늘'), null, '이름 칸(이름을 지우는 줄)은 되돌릴 수 없어 보내지 않음');
  assert.equal(guard('안녕하십니까?').text, '안녕하십니까?');
});

test('보낼 계획: 제목·본문·회신서·알림 글만, 그대로 둘 줄·숫자 칸·전화번호는 보내지 않고, 같은 조각은 한 번', () => {
  assert.deepEqual(trSources(OUT).slice(0, 3), ['2026학년도 가을 현장체험학습 안내', '안녕하십니까?', '1. 일시: 2026. 11. 12.(목) 09:00~15:00']);
  assert.ok(trSources(OUT).includes('참가 동의서') && trSources(OUT).includes(OUT.short));
  assert.ok(!trSources({ ...OUT, replyOn: false }).includes('참가 동의서'), '회신서를 끄면 보내지 않음');
  const plan = planTr(OUT);
  const sent = plan.jobs.map(j => j.text).join('\n');
  assert.ok(!sent.includes('031-123-4567') && !sent.includes('010-1234-5678'), sent);
  assert.ok(!plan.jobs.some(j => j.text === '2026. 11. 12.(목)' || j.text === '09:00' || j.text === '15:00'), sent);
  assert.ok(plan.jobs.some(j => j.text === '학교 출발') && plan.jobs.some(j => j.text === '문의: 교무실 {{1}}'), sent);
  assert.ok(plan.jobs.some(j => j.text === '일시: 2026. 11. 12.(목) 09:00~15:00'), '머리를 뺀 글');
  const twice = planTr({ title: '안내', body: ['부탁드립니다.', '부탁드립니다.'] });
  assert.equal(twice.jobs.filter(j => j.text === '부탁드립니다.').length, 1);
  const prompt = trPrompt(plan.jobs, 'vi');
  assert.ok(prompt.startsWith('[가정통신문 번역]') && prompt.includes('베트남어') && prompt.includes('[1] 2026학년도 가을 현장체험학습 안내'), prompt.slice(0, 200));
  assert.ok(prompt.includes('[글쓰기 원칙]'), '한국어 글쓰기 원칙을 덧붙이지 않게');
  assert.ok(trPrompt(plan.jobs, 'zh').includes('简体中文') && trPrompt(plan.jobs, 'ru').includes('러시아어'));
});

test('번역 받기: 머리·표 짜임·전화번호를 되살리고, 못 받은 줄은 빠진 줄로 셈', () => {
  const plan = planTr(OUT), r = plan.finish(fake(plan.jobs));
  assert.equal(r.miss, 0);
  assert.equal(r.units['  가. 준비물: 도시락, 물'], '  가. VI: 준비물: 도시락, 물');
  assert.equal(r.units['| 09:00 | 학교 출발 |'], '| 09:00 | VI: 학교 출발 |');
  assert.equal(r.units['| 시간 | 내용 |'], '| VI: 시간 | VI: 내용 |');
  assert.equal(r.units['문의: 교무실 031-123-4567'], 'VI: 문의: 교무실 031-123-4567');
  assert.equal(r.units[OUT.short], 'VI: 11월 12일 현장체험학습이 있어요.\n010-1234-5678');
  assert.ok(!('2026. 11. 12.(목)' in r.units), '그대로 둘 줄은 저장하지 않음');
  const part = plan.finish({ 1: 'VI title' });
  assert.equal(part.units['2026학년도 가을 현장체험학습 안내'], 'VI title');
  assert.ok(part.miss > 0 && !('안녕하십니까?' in part.units));
  // AI 답 꼴 여러 가지
  const jobs = [{ id: '1', text: 'a' }, { id: '2', text: 'b' }];
  assert.deepEqual(normAnswers({ 1: 'A', 2: 'B' }, jobs), { 1: 'A', 2: 'B' });
  assert.deepEqual(normAnswers({ translations: { 1: 'A', 2: 'B' } }, jobs), { 1: 'A', 2: 'B' });
  assert.deepEqual(normAnswers(['A', 'B'], jobs), { 1: 'A', 2: 'B' });
  assert.deepEqual(normAnswers([{ id: 2, text: 'B' }], jobs), { 2: 'B' });
  assert.deepEqual(normAnswers({ '[1]': 'A' }, jobs), { 1: 'A' });
  assert.equal(batches(Array.from({ length: 130 }, (_, i) => ({ id: String(i + 1), text: 'x' }))).length, 3);
  assert.equal(batches([{ id: '1', text: 'x'.repeat(3000) }, { id: '2', text: 'y'.repeat(3000) }]).length, 2);
});

test('저장(원문 글이 열쇠): 다시 만들면 저장해 둔 줄은 보내지 않고, 원문을 고친 줄만 다시, 지금 원문에 없는 번역은 버림', () => {
  const units = planTr(OUT).finish(fake(planTr(OUT).jobs)).units;
  assert.equal(planTr(OUT, units).jobs.length, 0, '모두 저장돼 있으면 AI 안 부름');
  const changed = { ...OUT, body: OUT.body.map(l => (l === '안녕하십니까?' ? '안녕하세요?' : l)) };
  const again = planTr(changed, units);
  assert.deepEqual(again.jobs.map(j => j.text), ['안녕하세요?']);
  const p = trPairs(changed, units);
  assert.equal(missingCount(p), 1);
  assert.equal(p.body[0].tr, null);
  assert.equal(p.body[4].fixed, true);
  assert.equal(p.body[4].tr, '2026. 11. 12.(목)');
  const pruned = pruneUnits({ ...units, ...again.finish(fake(again.jobs)).units }, changed);
  assert.ok(!('안녕하십니까?' in pruned) && pruned['안녕하세요?'] === 'VI: 안녕하세요?');
  assert.equal(missingCount(trPairs(changed, pruned)), 0);
});

test('가정통신문마다·언어마다 저장: 새로 열어도 남고, 최근 가정통신문에도', () => {
  const units = planTr(OUT).finish(fake(planTr(OUT).jobs)).units;
  const x = { id: 'lt1', sources: [], memo: '', out: OUT, tr: { vi: { units, at: 5 }, ko: { units: { a: 'b' } }, zh: 'x' } };
  saveCurrent(x);
  const g = getCurrent();
  assert.deepEqual(Object.keys(g.tr), ['vi'], '모르는 언어·꼴은 버림');
  assert.equal(g.tr.vi.units['| 09:00 | 학교 출발 |'], '| 09:00 | VI: 학교 출발 |');
  pushLetter(x);
  assert.equal(listLetters()[0].tr.vi.at, 5);
});

test('원문과 나란히: 제목 한국어+번역, 줄마다 한국어 뒤에 번역(같은 머리), 그대로 둔 줄은 한 번, 표는 한국어 표 뒤 번역 표, 회신서 칸 두 말', () => {
  const units = planTr(OUT).finish(fake(planTr(OUT).jobs)).units;
  const b = bilingualLetter(OUT, units, 'vi');
  assert.equal(b.title, '2026학년도 가을 현장체험학습 안내');
  assert.equal(b.subTitle, 'VI: 2026학년도 가을 현장체험학습 안내');
  assert.deepEqual(b.body.slice(0, 7), ['안녕하십니까?', 'VI: 안녕하십니까?', '', '1. 일시: 2026. 11. 12.(목) 09:00~15:00', '1. VI: 일시: 2026. 11. 12.(목) 09:00~15:00', '  가. 준비물: 도시락, 물', '  가. VI: 준비물: 도시락, 물']);
  assert.deepEqual(b.body.slice(7, 9), ['2026. 11. 12.(목)', '☎ 031-123-4567'], '날짜·전화번호 줄은 한 번');
  assert.deepEqual(b.body.slice(9, 16), ['| 시간 | 내용 |', '| 09:00 | 학교 출발 |', '| 15:00 | 15:00 |', '', '| VI: 시간 | VI: 내용 |', '| 09:00 | VI: 학교 출발 |', '| 15:00 | 15:00 |']);
  assert.deepEqual(b.body.slice(16, 18), ['문의: 교무실 031-123-4567', 'VI: 문의: 교무실 031-123-4567']);
  assert.equal(b.reply.title, '참가 동의서');
  assert.equal(b.reply.subTitle, 'VI: 참가 동의서');
  assert.deepEqual(b.reply.rows[0], ['학년 반 번호\nLớp / Số thứ tự', '      학년        반        번']);
  assert.deepEqual(b.reply.rows[1], ['학생 이름\nHọ tên học sinh', '']);
  assert.deepEqual(b.reply.rows[2], ['참가 여부\nVI: 참가 여부', '□ 참가합니다  □ 참가하지 않습니다'], '번역이 같은 칸은 한 번');
  const field = OUT.reply.fields[0];
  assert.deepEqual(bilingualLetter(OUT, { ...units, [field]: 'Tham gia: □ Có  □ Không' }, 'vi').reply.rows[2], ['참가 여부\nTham gia', '□ 참가합니다  □ 참가하지 않습니다\n□ Có  □ Không']);
  assert.deepEqual(b.reply.due, ['11. 7.(금)까지 제출해 주세요.', 'VI: 11. 7.(금)까지 제출해 주세요.']);
  assert.ok(b.reply.sign.startsWith('2026 .') && b.reply.sign.includes('Phụ huynh') && b.reply.sign.includes('Ký tên'));
  assert.equal(b.missing, 0);
  const none = bilingualLetter(OUT, {}, 'en');
  assert.equal(none.subTitle, '');
  assert.ok(none.missing > 0 && none.body.length === OUT.body.length, '번역이 없으면 한국어만');
  assert.equal(bilingualLetter({ ...OUT, replyOn: false }, units, 'vi').reply, null);
});

test('기본 양식 문서(한글·워드·PDF): 번역 제목·회신서 번역 제목·두 말 칸·제출 안내 두 줄·보호자 줄', () => {
  const units = planTr(OUT).finish(fake(planTr(OUT).jobs)).units;
  const doc = plainLetterDoc(defaultPlain('새싹초등학교'), bilingualLetter(OUT, units, 'vi'));
  const cs = doc.blocks.filter(x => x.type === 'c' && x.bold).map(x => x.text);
  assert.ok(cs.indexOf('2026학년도 가을 현장체험학습 안내') + 1 === cs.indexOf('VI: 2026학년도 가을 현장체험학습 안내'), cs.join(' | '));
  assert.ok(cs.includes('VI: 참가 동의서'));
  const ps = doc.blocks.filter(x => x.type === 'p').map(x => x.text);
  assert.ok(ps.indexOf('안녕하십니까?') + 1 === ps.indexOf('VI: 안녕하십니까?'));
  assert.ok(ps.includes('VI: 11. 7.(금)까지 제출해 주세요.'));
  const tables = doc.blocks.filter(x => x.type === 'table');
  assert.equal(tables.length, 3, '본문 표·번역 표·회신서 표');
  assert.deepEqual(tables[1].rows[1], ['09:00', 'VI: 학교 출발']);
  assert.equal(tables[2].rows[1][0], '학생 이름\nHọ tên học sinh');
  assert.ok(doc.blocks.some(x => x.type === 'c' && x.text.includes('보호자(Phụ huynh)')));
});

test('학교 양식(.hwpx): 머리·로고·학교장 줄 그대로, 제목 아래 번역 제목(같은 모양), 한국어 문단 뒤 번역 문단, 회신서 칸은 두 문단', async () => {
  const f = await readForm(await letterFormHwpx());
  const units = planTr(OUT).finish(fake(planTr(OUT).jobs)).units;
  const { bytes, warn } = await fillForm(f, findRoles(f.lines), bilingualLetter(OUT, units, 'vi'));
  assert.deepEqual(warn, []);
  const sec = new TextDecoder().decode((await unzip(bytes)).get('Contents/section0.xml'));
  assert.doesNotThrow(() => checkXml(sec), '잘 짜인 XML');
  assert.ok(sec.includes('가 정 통 신 문') && sec.includes('교장 : 김새싹') && sec.includes('새 싹 초 등 학 교 장') && sec.includes('binaryItemIDRef="image1"'), '양식 머리');
  const at = s => sec.indexOf(`>${s}<`);
  assert.ok(at('2026학년도 가을 현장체험학습 안내') > 0 && at('2026학년도 가을 현장체험학습 안내') < at('VI: 2026학년도 가을 현장체험학습 안내'), '번역 제목');
  const titleP = t => { const i = at(t); return sec.slice(sec.lastIndexOf('<hp:p ', i), i).replace(/ id="\d+"/, ''); };
  assert.equal(titleP('VI: 2026학년도 가을 현장체험학습 안내').replace(/<hp:run[\s\S]*$/, ''), titleP('2026학년도 가을 현장체험학습 안내').replace(/<hp:run[\s\S]*$/, ''), '번역 제목도 제목 모양');
  assert.ok(at('안녕하십니까?') < at('VI: 안녕하십니까?') && at('VI: 안녕하십니까?') < at('1. 일시: 2026. 11. 12.(목) 09:00~15:00'));
  assert.ok(at('  가. VI: 준비물: 도시락, 물') > 0, '같은 머리');
  assert.ok(at('학생 이름') > 0 && at('Họ tên học sinh') > at('학생 이름') && at('VI: 참가 동의서') > 0, '회신서');
  assert.ok(!sec.includes('학부모 상담 주간 안내'), '옛 제목');
  assert.equal((sec.match(/colCnt="2"/g) || []).length >= 3, true, '본문 표·번역 표·회신서 표');
});
