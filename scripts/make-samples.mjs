// 시연용 샘플 만들기 (모두 지어낸 예시): samples/ 폴더에 씀
import { writeFileSync, mkdirSync } from 'node:fs';
import { makeHwpx } from '../web/core/hwpx.js';
import { TYPES, composeReason, purchaseDoc } from '../web/menus/purchase/rules.js';
import { sampleJindoDoc, sampleTimetableDoc } from '../web/menus/class/class-sample.js';

const out = new URL('../samples/', import.meta.url);
mkdirSync(out, { recursive: true });

// 품의 예시 (물품 구입)
const form = { ...TYPES[0].example, type: 'goods', budget: '교육과정 운영 > 교과 운영비', budgetUnknown: false, total: '', memo: '' };
const draft = {
  title: '5학년 과학 실험 재료(용해와 용액) 구입',
  reason: composeReason({ intro: '5학년 과학 「용해와 용액」 단원의 모둠 실험에 쓸 재료를 다음과 같이 구입하고자 합니다.', ...form })
};
writeFileSync(new URL('품의-예시.hwpx', out), makeHwpx(purchaseDoc(form, draft)));
console.log('samples/품의-예시.hwpx');

// 학급 예시: 교과·창체 진도표(연간지도계획 표 모양), 학년별 기초시간표(두 반 나란히)
writeFileSync(new URL('진도표-예시.hwpx', out), makeHwpx(sampleJindoDoc()));
console.log('samples/진도표-예시.hwpx');
writeFileSync(new URL('시간표-예시.hwpx', out), makeHwpx(sampleTimetableDoc()));
console.log('samples/시간표-예시.hwpx');
