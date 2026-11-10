/* 단원평가 1단계 단추가 이름대로: [학생 문제지 넣기(스캔한 것)]·[답안 넣기]에 다른 것을 넣어도 무엇인지 보고 맞는 곳에 넣음.
   판단은 새로 만들지 않고 한꺼번에 넣기의 나누기(core/bundle.js: 파일 이름·글자 인식·AI 쪽 표시)와 정답표 읽기(unit-key.js)를 그대로 씀.
   화면 없이 돌아감(시험) */
import { keyName } from '../../../core/inbox-classify.js';
import { parseKey, parsePaper, splitCombined } from './unit-key.js';
import { filledNameLine } from '../../../core/bundle.js';

/* 한글·글 파일: 학생 문제지 스캔일 수 없음 */
export const isDocFile = f => /\.(hwpx?|txt)$/i.test((f && f.name) || '') || (!!f && f.type === 'text/plain');
const questions = text => Object.keys(parsePaper(text).questions).length;

/* [학생 문제지 넣기]에 넣은 파일 하나 → 'scan'(학생 문제지) | 'key'(답안) | 'paper'(빈 문제지) | 'named'(넣지 않음).
   한글·글 파일은 글(text)로: 학생 이름이 적혀 있으면 'named'(학생이 쓴 글이라 빈 문제지·답안으로 저장하거나 채점 AI로 보내지 않음 — 스캔으로 넣게), 정답표가 읽히거나 정답이 붙은 문제지면 답안, 문항만 있는 문제지면 빈 문제지, 모르면 답안(AI가 읽음).
   PDF·사진은 이름이 정답·해설·교사용·모범 답안 같은 정답 파일 이름일 때만 답안(떠 있는 버튼의 사진·스캔 이름 규칙 keyName) */
export { keyName };
export function paperFileGoes({ name = '', type = '', text = '' } = {}) {
  if (!isDocFile({ name, type })) return keyName(name) ? 'key' : 'scan';
  if (filledNameLine(text)) return 'named';
  if (parseKey(text) || splitCombined(text).key) return 'key';
  return questions(text) >= 2 ? 'paper' : 'key';
}

/* [답안 넣기]에 넣은 PDF를 한꺼번에 넣기처럼 읽어 나눈 것(b: readBundle 결과, b.seen: AI가 표시를 본 쪽) →
   'papers': 모든 쪽이 학생 쪽이고 그렇게 본 근거가 있음(글자 인식된 학생 스캔 묶음, AI가 본 쪽이 학생)
   'both': 학생 쪽(근거 있음)과 정답·교사용·빈 쪽이 섞임 → 한꺼번에 넣기처럼 나눠 넣음
   'key': 그 밖. 근거 없이 「학생」인 쪽(AI를 부르지 않은 한두 쪽, AI가 보지 않은 가운데 쪽)은 단추 이름대로 답안 */
export function keyScanGoes(b) {
  const pages = (b && b.pages) || [], roles = (b && b.roles) || [], seen = new Set((b && b.seen) || []);
  if (!pages.length) return 'key';
  const sure = pages.some((p, i) => roles[i] === 'student' && (p.ocr || seen.has(i)));
  if (!sure) return 'key';
  return pages.every((p, i) => roles[i] === 'student') ? 'papers' : 'both';
}

/* [답안 넣기]에 넣은 파일(name, 정답표로 읽히지 않은 글자층 글 text, 쪽을 나눠 본 b) → 'key' | 'papers' | 'both' | 'ask'.
   정답 파일 이름(keyName)이면 답안, 글이 있으면 keyScanGoes대로(답안 AI는 글로 읽음).
   글자 없는 그림(사진·스캔 PDF)인데 학생 쪽이라는 근거(글자 인식·AI가 본 쪽)도 정답·빈 쪽이라는 근거도 없으면 'ask'(선생님께 물음):
   쪽 나누기 AI는 3쪽부터라 사진 한두 장·PDF 한두 쪽은 근거가 없고, 학생 문제지면 이름이 보이는 그림이 답안 AI로 감 */
export function keyFileGoes({ name = '', text = '', b = null } = {}) {
  if (keyName(name)) return 'key';
  const go = keyScanGoes(b);
  if (go !== 'key' || String(text || '').trim()) return go;
  const pages = (b && b.pages) || [], roles = (b && b.roles) || [];
  const told = ((b && b.seen) || []).length > 0 || pages.some(p => p && p.ocr) || roles.some(r => r && r !== 'student');
  return pages.length && !told ? 'ask' : 'key';
}

/* 한꺼번에 넣기에서 나눈 것(b) → 단원평가 어디에 넣을지 { keyText, paperText, keyPages, blankPages, stuPages }.
   답안 글: 교사용으로 나눈 글, 없으면 학생용 글이 정답표로 읽힐 때 그 글.
   빈 문제지 글: 남은 학생용 글이 문항 둘 이상이거나 8줄을 넘을 때만(정답·해설지 앞머리 몇 줄이 넣어 둔 문제지를 덮어쓰지 않게).
   답안 그림: 정답·교사용 쪽만(빈 문제지 쪽을 정답지로 읽히지 않게), 학생 쪽: 학생 문제지 */
export function bundleParts(b) {
  const doc = (b && b.doc) || {}, pages = (b && b.pages) || [], roles = (b && b.roles) || [];
  let keyText = String(doc.teacher || '').trim(), paperText = String(doc.student || '').trim();
  if (!keyText && paperText && parseKey(paperText)) { keyText = paperText; paperText = ''; }
  if (paperText && questions(paperText) < 2 && paperText.split('\n').filter(l => l.trim()).length <= 8) paperText = '';
  const of = r => pages.filter((p, i) => roles[i] === r);
  return { keyText, paperText, keyPages: of('teacher'), blankPages: of('blank'), stuPages: of('student') };
}
