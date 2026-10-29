/* 학년도 옮기기를 화면에서 부르는 곳: 저장 멈춤(쌤비서 저장 + 평가 메뉴) → 옮기기 → 다시 열기 */
import { moveTo } from './years.js';
import { openArchive } from './archive.js';
import { freeze, unfreeze } from './store.js';

const S = () => window.SSAM || {};
let archive = null;
export const getArchive = () => archive || (archive = openArchive());

/* 성공하면 앱을 다시 엶. 실패하면 { ok: false, code } (지금 자료는 그대로) */
export async function switchYear(target, data = null) {
  const r = await moveTo(target, {
    ls: localStorage, archive: getArchive(), data,
    freeze: () => { freeze(); if (S().freeze) S().freeze(true); },
    unfreeze: () => { unfreeze(); if (S().freeze) S().freeze(false); }
  });
  if (r.ok) location.reload();
  return r;
}
export const switchError = code => (code === 'ARCHIVE_FAILED' ? '보관하지 못했어요. 지금 자료는 그대로예요' : '새 학년도 자료를 쓰지 못했어요. 지금 자료는 그대로예요');
