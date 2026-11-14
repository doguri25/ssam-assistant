/* 「쌤」 채팅 — 지금 화면 맞춤 도움 (스펙 2026-11-14-chat-smarter §3).
   「이 화면에서 뭐 해?」「다음에 뭐 해?」 → 채팅 창 뒤에 보이는 화면(메뉴 › 탭)·지금 단계·화면 설명·다음 할 일로 AI 없이 답.
   screenQuestion·screenAnswer는 순수(Node 시험), readScreen은 화면(DOM)에서 읽음 */

// 이 화면·여기·지금 무엇을 하는지 묻는 말(「단원평가 화면에서 뭐 해?」처럼 다른 메뉴를 짚으면 아님 — 그건 안내·AI가 답함)
const SCREEN = /(?:이|이번|현재|지금)\s*(?:화면|페이지|탭|단계|메뉴|창)(?:에서|은|는|서|이|에선)?\s*(?:뭐|무엇|뭘|어떻게|무슨|뭔)|여기(?:서|에서|는|선|선요)?\s*(?:뭐|무엇|뭘|어떻게|뭔)|다음(?:에|엔|은|으로)?\s*(?:뭐|무엇|뭘)\s*(?:를\s*)?(?:해|하)|뭐부터\s*(?:해|하)|지금\s*(?:뭐|무엇|뭘)\s*(?:를\s*)?(?:해|하)|이거\s*(?:뭐|어떻게)\s*(?:해|하|써|쓰|야|예요|에요|하는)/;
export function screenQuestion(text) {
  const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  return !!t && t.length <= 40 && SCREEN.test(t);
}

const HOME = '오늘 챙길 일(공문 기한·오늘 수업·기초학력 출석)과 이어서 할 일을 한 화면에 모아 보여 줘요. 위 칸에 파일을 놓으면 쌤비서가 알아보고 그 메뉴에서 해요.';

/* info: { place, step: { n, label } | null, next(다음 단계 이름), flow(평가 한 바퀴 줄), intro(화면 설명), home } */
export function screenAnswer(info = {}) {
  const i = info || {};
  if (!i.place) return '지금 보이는 화면을 찾지 못했어요. 왼쪽 메뉴에서 화면을 연 뒤 다시 물어봐 주세요.';
  const lines = [`지금 화면: **${i.place}**${i.step ? ` · ${i.step.n}단계 「${i.step.label}」` : ''}`];
  const intro = i.intro || (i.home ? HOME : '');
  if (intro) lines.push(`이 화면은: ${intro}`);
  const flowNext = i.flow && (i.flow.match(/다음:\s*([^▸▾]+)/) || [])[1];
  if (flowNext) lines.push(`다음 할 일: 「${flowNext.trim()}」(${i.flow.split('·')[0].trim()}) — 위 띠를 누르면 그 단계로 가요.`);
  else if (i.flow) lines.push('평가 한 바퀴를 다 했어요.');
  if (i.step && i.next) lines.push(`이 단계를 마치면 ${i.step.n + 1}단계 「${i.next}」로 가요.`);
  else if (i.step && !i.next) lines.push('마지막 단계예요.');
  if (!intro && !i.step && !i.flow) lines.push('이 화면의 쓰는 법은 「○○ 어떻게 해?」처럼 물어봐 주세요.');
  return lines.join('\n');
}

/* 화면에서 읽기: nav { menu, tab }, menus(shell.js MENUS) */
const vis = el => !!el && (typeof el.checkVisibility === 'function' ? el.checkVisibility() : true);
const txt = el => String((el && el.textContent) || '').replace(/\s+/g, ' ').trim();
export function readScreen({ doc = globalThis.document, nav = null, menus = [] } = {}) {
  const m = nav && menus.find(x => x.id === nav.menu);
  if (!m || !doc) return { place: '' };
  const t = (m.tabs || []).find(x => x.id === nav.tab);
  const place = t ? `${m.label} › ${t.label}` : m.label;
  const sec = doc.querySelector(`section[data-menu="${m.id}"]`);
  if (!sec) return { place };
  // 지금 단계: 단계 표시(core/steps.js의 ol.steps, 기초학력 .cp-steps)에서 aria-current="step" — 평가 한 바퀴 띠의 마디는 따로(flow)
  const cur = [...sec.querySelectorAll('[aria-current="step"]')].find(el => !el.closest('.un-flow') && vis(el));
  let step = null, next = '';
  if (cur) {
    const li = cur.closest('li'), list = li ? [...li.parentElement.children] : [];
    const name = el => txt(el.querySelector('.steps-t, .cp-step-name')) || txt(el).replace(/^\d+\s*/, '');
    step = { n: Math.max(1, list.indexOf(li) + 1), label: name(li || cur) };
    const nx = li && li.nextElementSibling;
    next = nx ? name(nx) : '';
  }
  const band = sec.querySelector('.un-flow-sum-t');
  const intro = [...sec.querySelectorAll('details.intro')].find(d => vis(d));
  return { place, step, next, flow: band && vis(band) ? txt(band).replace(/다 됐어요$/, '').trim() : '', intro: intro ? txt(intro.querySelector('.intro-text')) : '', home: m.id === 'home' };
}
