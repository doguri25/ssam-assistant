/* 3분 둘러보기 안내 단계 (스펙 2026-11-13-miss-tour-check §3, 화면은 core/tour.js). 화면 없이 읽을 수 있음(Node 시험) —
   화면으로 가는 일(go)은 부를 때 그 모듈을 불러옴.
   단계: { id, title, text(해요체·짧게), target(테두리를 칠 곳 — CSS 선택자, 찾지 못하면 말풍선만), go(그 화면으로 가기, async 가능) }.
   새 단계는 addTourStep(step) — 기본은 끝 단계 앞, { before: id }면 그 단계 앞 */
const shell = () => import('./shell.js');
/* 평가 › 단원평가 › 결과 모아 보기의 한 보기(rv: table·gap·pyeongeo …) */
async function unitResults(rv) {
  (await shell()).go('evaluate', 'unit');
  (await import('../menus/evaluate/unit/unit-results.js')).showResults(rv);
}

export const TOUR_STEPS = [
  { id: 'home', title: '오늘', text: '켜면 먼저 보이는 화면이에요. 공문 기한·오늘 수업·기초학력 출석을 한눈에 봐요.',
    target: 'section[data-menu="home"] .hm-cards', go: async () => (await shell()).go('home') },
  { id: 'unit', title: '단원평가 결과', text: '채점을 마친 단원평가가 모여요. 학생마다 점수를 100점으로 바꿔 보여 줘요.',
    target: '.un-results .yp-card', go: () => unitResults('table') }, // 성적 일람표 칸(표는 칸 안에서 가로로 넘칠 수 있어 칸을 가리킴)
  { id: 'gap', title: '도달하지 못한 학생', text: '영역 점수가 기준(60%)보다 낮은 학생을 찾아요. 골라서 기초학력에 넣을 수 있어요.',
    target: '.un-results .un-gap', go: () => unitResults('gap') },
  { id: 'growth', title: '기초학력 사전·사후 점수', text: '넣을 때 적은 사전 점수와, 뒤 단원평가로 채운 사후 점수를 견줘요.',
    target: '.cp-growth', go: async () => (await import('../menus/class/camp.js')).openCamp('report') },
  { id: 'evidence', title: '근거가 보이는 평어', text: '문장마다 기댄 근거가 붙어요. 근거가 없는 문장은 「근거 없음」으로 알려 줘요.',
    target: '.un-results .un-py', go: () => unitResults('pyeongeo') },
  { id: 'check', title: '생기부 기재 점검', text: '다 쓴 평어를 훑어 학교 밖 수상·사교육처럼 쓰면 안 되는 말을 찾아요. [AI로 고치기]도 돼요.',
    target: '.chk-list .chk-row', go: async () => (await shell()).go('evaluate', 'check') },
  { id: 'end', title: '다 봤어요', text: '더 눌러 봐도 괜찮아요. 다 보면 위 띠의 [체험 끝내기]로 원래 자료로 돌아가요.',
    target: '#tourBand [data-tour="exit"]', go: async () => (await shell()).go('home') }
];

export const tourSteps = () => TOUR_STEPS;
/* 단계 더하기(같은 id는 바꿈). before: 이 단계 앞에(없으면 끝 단계 앞) */
export function addTourStep(step, { before = 'end' } = {}) {
  if (!step || !step.id) return TOUR_STEPS;
  const old = TOUR_STEPS.findIndex(s => s.id === step.id);
  if (old >= 0) { TOUR_STEPS[old] = step; return TOUR_STEPS; }
  const at = TOUR_STEPS.findIndex(s => s.id === before);
  TOUR_STEPS.splice(at >= 0 ? at : TOUR_STEPS.length, 0, step);
  return TOUR_STEPS;
}
