/* 학년도 옮기기를 화면에서 부르는 곳: 저장 멈춤(쌤비서 저장 + 평가 메뉴) → 옮기기 → 다시 열기 */
import { moveTo } from './years.js';
import { openArchive } from './archive.js';
import { freeze, unfreeze } from './store.js';
import { busyCount } from './ai.js';

const S = () => window.SSAM || {};
let archive = null;
export const getArchive = () => archive || (archive = openArchive());

/* 성공하면 앱을 다시 엶. 실패하면 { ok: false, code } (지금 자료는 그대로) */
export async function switchYear(target, data = null) {
  // AI가 쓰는 중이면 옮기지 않음 (다시 열면 그 글을 잃으므로). 평가 메뉴의 미뤄 둔 저장은 먼저 씀
  if (busyCount() > 0 || (S().busy && S().busy())) return { ok: false, code: 'BUSY' };
  if (S().flush) { try { await S().flush(); } catch (e) {} }
  const r = await moveTo(target, {
    ls: localStorage, archive: getArchive(), data,
    freeze: () => { freeze(); if (S().freeze) S().freeze(true); },
    unfreeze: () => { unfreeze(); if (S().freeze) S().freeze(false); }
  });
  if (r.ok) location.reload();
  return r;
}
export const switchError = code => (code === 'ARCHIVE_FAILED' ? '지금 자료를 보관함에 넣지 못했어요. 지금 자료는 그대로예요'
  : code === 'ARCHIVE_READ' ? '보관함을 읽지 못했어요. 지금 자료는 그대로예요'
  : code === 'EXISTS' ? '그 학년도 자료가 이미 보관함에 있어요. 학년도 목록에서 그 학년도로 가 주세요'
  : code === 'BUSY' ? 'AI가 글을 쓰는 중이에요. 끝난 뒤에 다시 해 주세요'
  : code === 'RESTORE_FAILED' ? '학년도 자료를 쓰지 못했고 지금 화면의 자료도 되돌리지 못했어요. 지금 학년도 자료는 보관함에 있으니 앱을 다시 열고 학년도 목록에서 그 학년도로 가 주세요'
  : '학년도 자료를 쓰지 못했어요(저장 공간이 모자랄 수 있어요). 지금 자료는 그대로예요');
/* 저장소에 닿을 수 없으면 null (브라우저가 사이트 저장소를 막은 경우) */
export const safeLS = () => { try { return window.localStorage; } catch (e) { return null; } };
