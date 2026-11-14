// 학교 계획서 양식: 제목 바로 아래 결재란(표)을 본문 자리로 고르지 않음 — 표 아래 글이 본문(계획서 양식은 거의 다 결재란이 있음)
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHwpx } from '../../web/core/hwpx.js';
import { readForm, findRoles, fillForm } from '../../web/core/hwpx-form.js';

const FORM = makeHwpx({ title: '새싹초 업무 계획서', blocks: [
  { type: 'table', rows: [['결재', '담당', '부장', '교감']] }, { type: 'p', text: '옛 본문: 목적을 적어요' }, { type: 'p', text: '옛 본문: 추진 내용을 적어요' },
  { type: 'p', text: '2026. 3. 2.' }, { type: 'p', text: '새싹초등학교장' }] });

test('결재란 표 아래 글이 본문 자리, 결재란은 그대로 남음', async () => {
  const f = await readForm(FORM);
  const r = findRoles(f.lines);
  assert.equal(f.lines[r.title].text, '새싹초 업무 계획서');
  assert.equal(f.lines[r.bodyStart].text, '옛 본문: 목적을 적어요');
  assert.equal(f.lines[r.bodyEnd].text, '옛 본문: 추진 내용을 적어요');
  const { bytes } = await fillForm(f, r, { title: '2027학년도 독서교육 운영 계획', body: ['Ⅰ. 목적', '책을 즐겨 읽는 습관을 기른다.'], date: '2027-03-02', reply: null });
  const out = (await readForm(bytes)).lines.map(l => l.text);
  assert.ok(out.includes('결재') && out.includes('교감'), '결재란이 지워짐: ' + out.join(' | '));
  assert.ok(out.includes('Ⅰ. 목적') && !out.some(t => t.includes('옛 본문')), out.join(' | '));
});

test('본문이 통째로 상자(표) 안인 양식은 지금처럼 그 상자 안 줄을 본문으로', async () => {
  const boxed = makeHwpx({ title: '안내', blocks: [{ type: 'table', rows: [['옛 본문 한 줄'], ['옛 본문 두 줄']] }, { type: 'p', text: '2026. 3. 2.' }, { type: 'p', text: '새싹초등학교장' }] });
  const f = await readForm(boxed);
  const r = findRoles(f.lines);
  assert.ok(r.bodyStart > r.title && f.lines[r.bodyStart].text.includes('옛 본문'), JSON.stringify(r));
});
