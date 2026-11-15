// 문서 다듬기(스펙 2026-11-15 1A, 방식 가): 한글 문서(.hwpx)를 문단 단위로 고침 — 고칠 줄 고르기, 바꾸기(바뀐 글자만 바꾸고 둘레 글자 모양·탭은 그대로,
// 못 하면 첫 글자 모양), 지우기(표 칸 밖은 문단을 지우고 표 칸·구역 설정 문단은 글만 비움), 뒤에 더하기(그 문단을 본으로 복제), 다시 열리는 .hwpx.
// 양식은 makeHwpx·손으로 쓴 XML(hwpx-hand.mjs), 글은 모두 지어낸 것(새싹초등학교·이바다)
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHwpx } from '../../web/core/hwpx.js';
import { unzip } from '../../web/core/zip.js';
import { readForm, checkXml } from '../../web/core/hwpx-form.js';
import { editableLines, writeHwpx, finalLines } from '../../web/core/hwpx-edit.js';
import { RUN, PARA, TBL, TPARA, handForm, D } from './hwpx-hand.mjs';

const dec = u8 => new TextDecoder().decode(u8);
const texts = f => f.lines.map(l => l.text);
const at = (f, t) => f.lines.findIndex(l => l.text === t);
const secOf = async bytes => dec((await unzip(bytes)).get('Contents/section0.xml'));
const paraWith = (xml, text) => (xml.match(/<hp:p\b[^>]*>(?:(?!<hp:p\b)[\s\S])*?<\/hp:p>/g) || []).find(p => p.includes(text)) || '';

const PLAN = {
  title: '2026학년도 새싹초등학교 독서교육 운영 계획',
  blocks: [
    { type: 'p', text: '1. 목적' },
    { type: 'p', text: '  가. 책 읽는 즐거움을 알게 한다.' },
    { type: 'p', text: '' },
    { type: 'table', head: true, rows: [['구분', '내용'], ['기간', '2026. 3. ~ 2027. 2.'], ['담당', '교무부장 이바다']] },
    { type: 'p', text: '붙임  계획서 1부.  끝.' }
  ]
};
/* 손으로 쓴 문서: 구역 설정 + 굵은 조각(1)·보통 조각(0)이 섞인 제목, 탭이 든 줄, 그림만 있는 줄, 빈 줄, 표(이름 칸) */
const handDoc = () => handForm(secPr => PARA(`<hp:run charPrIDRef="0">${secPr}</hp:run>${RUN(1, '제목: ')}${RUN(0, '2026학년도 운영 계획')}`)
  + PARA('<hp:run charPrIDRef="0"><hp:t>붙임<hp:tab width="4000" leader="0" type="1"/>계획서 1부.</hp:t></hp:run>')
  + PARA('<hp:run charPrIDRef="0"><hp:pic id="77"/><hp:t/></hp:run>')
  + PARA(RUN(0, ''))
  + TPARA(TBL([[D('국어', 0), D('김하늘', 1)]], 2, 1200)));

test('[hwpx-edit-lines] 고칠 줄: 빈 줄·그림만 있는 줄은 빼고 문서 차례대로(표 칸 줄은 box)', async () => {
  const f = await readForm(await handDoc());
  const ed = editableLines(f.lines);
  assert.deepEqual(ed.map(x => x.text), ['제목: 2026학년도 운영 계획', '붙임\t계획서 1부.', '국어', '김하늘']);
  assert.deepEqual(ed.map(x => x.box), [false, false, true, true]);
  assert.deepEqual(ed.map(x => f.lines[x.i].text), ed.map(x => x.text), 'i는 form.lines 차례');
});

test('[hwpx-edit-replace] 바꾸기: 바뀐 글자만 바꾸고 굵은 조각·보통 조각·구역 설정은 그대로, 줄 배치 기억은 지움', async () => {
  const src = await handDoc(), f = await readForm(src), i = at(f, '제목: 2026학년도 운영 계획');
  const { bytes } = writeHwpx(f, { [i]: { text: '제목: 2027학년도 운영 계획' } });
  const sec = await secOf(bytes), p = paraWith(sec, '제목: ');
  assert.doesNotThrow(() => checkXml(sec));
  assert.ok(p.includes('<hp:run charPrIDRef="1"><hp:t>제목: </hp:t></hp:run>'), p);
  assert.ok(p.includes('<hp:t>2027학년도 운영 계획</hp:t>') && /charPrIDRef="0"><hp:t>2027학년도/.test(p), p);
  assert.ok(p.includes('<hp:secPr') && !p.includes('linesegarray'), '구역 설정 남고 줄 배치는 지움');
  const g = await readForm(bytes);
  assert.equal(g.lines[i].text, '제목: 2027학년도 운영 계획');
  // 글을 통째로 바꾸면 첫 글자 모양으로(문단 모양·구역 설정 그대로)
  const all = await readForm(writeHwpx(f, { [i]: { text: '학교 독서 계획' } }).bytes);
  assert.equal(all.lines[i].text, '학교 독서 계획');
});

test('[hwpx-edit-tab] 탭이 든 줄: 탭은 그대로 남고 둘레 글만, 새로 넣은 탭은 한글 탭으로', async () => {
  const f = await readForm(await handDoc()), i = at(f, '붙임\t계획서 1부.');
  const sec = await secOf(writeHwpx(f, { [i]: { text: '붙임\t계획서 2부.' } }).bytes);
  assert.doesNotThrow(() => checkXml(sec));
  assert.ok(paraWith(sec, '붙임').includes('<hp:t>붙임<hp:tab width="4000" leader="0" type="1"/>계획서 2부.</hp:t>'), paraWith(sec, '붙임'));
  const g = await readForm(writeHwpx(f, { [i]: { text: '붙임\t계획서 1부.\t끝.' } }).bytes);
  assert.equal(g.lines[i].text, '붙임\t계획서 1부.\t끝.');
});

test('[hwpx-edit-delete] 지우기: 표 칸 밖 문단은 지우고, 표 칸 안은 글만 비움(칸·줄 수 그대로), 구역 설정이 든 첫 문단은 글만 지움', async () => {
  const src = makeHwpx(PLAN), f = await readForm(src);
  const iGoal = at(f, '1. 목적'), iCell = at(f, '기간'), iTitle = at(f, PLAN.title);
  const { bytes } = writeHwpx(f, { [iGoal]: { del: true }, [iCell]: { del: true }, [iTitle]: { del: true } });
  const sec = await secOf(bytes), g = await readForm(bytes), t = texts(g);
  assert.doesNotThrow(() => checkXml(sec));
  assert.ok(!t.includes('1. 목적') && !t.includes('기간') && !t.includes(PLAN.title), t.join(' | '));
  assert.equal(g.lines.length, f.lines.length - 1, '표 칸 밖 문단 하나만 빠짐');
  assert.equal(g.lines.filter(l => l.inBox).length, f.lines.filter(l => l.inBox).length, '표 칸 줄 수 그대로');
  assert.ok(sec.includes('<hp:secPr') && /rowCnt="3"/.test(sec) && /colCnt="2"/.test(sec), '구역 설정·표 모양 그대로');
  assert.ok(t.includes('2026. 3. ~ 2027. 2.') && t.includes('  가. 책 읽는 즐거움을 알게 한다.'));
});

test('[hwpx-edit-after] 뒤에 더하기: 그 문단(문단 모양·글자 모양)을 본으로 바로 뒤에, 번호(id)는 겹치지 않음, 표 칸 안에도', async () => {
  const src = makeHwpx(PLAN), f = await readForm(src);
  const iGa = at(f, '  가. 책 읽는 즐거움을 알게 한다.'), iTerm = at(f, '2026. 3. ~ 2027. 2.');
  const { bytes } = writeHwpx(f, { [iGa]: { after: [{ text: '  나. 날마다 10분 책을 읽는다.' }, { text: '  다. 독서 기록장을 쓴다.' }] }, [iTerm]: { after: [{ text: '(방학 포함)' }] } });
  const sec = await secOf(bytes), g = await readForm(bytes), t = texts(g);
  assert.doesNotThrow(() => checkXml(sec));
  const k = t.indexOf('  가. 책 읽는 즐거움을 알게 한다.');
  assert.deepEqual(t.slice(k, k + 3), ['  가. 책 읽는 즐거움을 알게 한다.', '  나. 날마다 10분 책을 읽는다.', '  다. 독서 기록장을 쓴다.']);
  const kt = t.indexOf('2026. 3. ~ 2027. 2.');
  assert.equal(t[kt + 1], '(방학 포함)');
  assert.ok(g.lines[kt + 1].inBox && g.lines[kt + 1].box === g.lines[kt].box, '같은 표 칸 안');
  const tpl = paraWith(dec((await unzip(src)).get('Contents/section0.xml')), '  가. 책 읽는'), np = paraWith(sec, '  나. 날마다');
  const attr = (p, a) => (new RegExp(`\\b${a}="([^"]*)"`).exec(p) || [])[1];
  assert.equal(attr(np, 'paraPrIDRef'), attr(tpl, 'paraPrIDRef'));
  assert.equal(attr(np, 'charPrIDRef'), attr(tpl, 'charPrIDRef'));
  const ids = [...sec.matchAll(/<hp:p\b[^>]*\sid="(\d+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, '문단 번호가 겹침');
});

test('[hwpx-edit-zip] 결과는 다시 열리는 .hwpx: 파일 차례 그대로(mimetype 먼저), 구역 XML이 잘 짜임, 미리 보기 글도 새 글, 고칠 것이 없으면 글이 같음', async () => {
  const src = makeHwpx(PLAN), f = await readForm(src), iGoal = at(f, '1. 목적');
  const { bytes, warn } = writeHwpx(f, { [iGoal]: { text: '1. 운영 목적' } });
  assert.deepEqual(warn, []);
  const z = await unzip(bytes);
  assert.deepEqual([...z.keys()], [...(await unzip(src)).keys()]);
  assert.equal([...z.keys()][0], 'mimetype');
  assert.doesNotThrow(() => checkXml(dec(z.get('Contents/section0.xml'))));
  assert.ok(dec(z.get('Preview/PrvText.txt')).includes('1. 운영 목적'));
  const same = await readForm(writeHwpx(f, {}).bytes);
  assert.deepEqual(texts(same), texts(f));
});

test('[hwpx-edit-final] 고친 뒤 줄 글(미리 보기·기본 문서용): 지운 줄은 빼고(표 칸은 빈 글), 더한 줄은 그 뒤에', () => {
  const lines = [{ text: '가' }, { text: '나', inBox: true }, { text: '' }, { text: '다' }];
  assert.deepEqual(finalLines(lines, { 0: { text: '가가', after: [{ text: '가2' }] }, 1: { del: true }, 3: { del: true } }), ['가가', '가2', '', '']);
});
