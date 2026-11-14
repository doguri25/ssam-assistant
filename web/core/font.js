// 글꼴(설정 › 화면 › 글꼴): <html data-font="…"> 하나로 바뀜. 글꼴 값은 core/theme.css 끝의 data-font 규칙.
// 프리텐다드·SUIT는 앱 안 파일(web/fonts, 인터넷 없이도 보임), 본고딕·나눔고딕·고운돋움·고운바탕은 구글 글꼴(안 되면 맑은 고딕),
// 「테마 글꼴」은 테마마다 정해진 글꼴(예전과 같음). 종이 문서 테마의 명조 제목은 어느 글꼴이든 그대로.
// index.html 첫 스크립트에도 같은 표가 있음(깜빡임 없게 먼저 정함 — tests/unit/font.test.mjs가 둘이 같은지 봄)
export const FONTS = [
  { id: 'pretendard', label: '프리텐다드', desc: '또렷하고 담백한 요즘 글꼴', family: "'Pretendard Variable',Pretendard", css: 'fonts/pretendard/pretendard.css' },
  { id: 'suit', label: 'SUIT', desc: '단정하고 조금 각진 글꼴', family: "'SUIT Variable'", css: 'fonts/suit/suit.css' },
  { id: 'noto', label: '본고딕', desc: '가장 표준적인 고딕(Noto Sans KR)', family: "'Noto Sans KR'", google: 'Noto+Sans+KR:wght@400;500;700;800' },
  { id: 'nanum', label: '나눔고딕', desc: '학교 문서에서 익숙한 글꼴', family: "'Nanum Gothic'", google: 'Nanum+Gothic:wght@400;700;800' },
  { id: 'gowun', label: '고운돋움', desc: '부드럽고 손글씨 느낌이 살짝', family: "'Gowun Dodum'", google: 'Gowun+Dodum' },
  { id: 'batang', label: '고운바탕', desc: '책처럼 읽히는 바탕체', family: "'Gowun Batang'", google: 'Gowun+Batang:wght@400;700' },
  { id: 'malgun', label: '맑은 고딕', desc: '윈도우 기본 글꼴 · 내려받지 않음', family: "'Malgun Gothic'" },
  { id: 'theme', label: '테마 글꼴', desc: '테마마다 정해진 글꼴' }
];
export const DEFAULT_FONT = 'pretendard';
/* 테마마다 쓰는 구글 글꼴(「테마 글꼴」일 때 모두, 다른 글꼴일 때는 종이 문서의 명조 제목만) */
const THEME_GOOGLE = {
  'dark-nav': 'Gothic+A1:wght@400;500;600;700;800', mono: 'IBM+Plex+Sans+KR:wght@400;500;600;700', soft: 'Noto+Sans+KR:wght@400;500;700',
  paper: 'Noto+Serif+KR:wght@600;700&family=Noto+Sans+KR:wght@400;500;700', rail: 'Noto+Sans+KR:wght@400;500;700'
};
const PAPER_TITLE = 'Noto+Serif+KR:wght@600;700';
const KEY = 'ssam:font';

export const knownFont = id => FONTS.some(f => f.id === id);
const fontOf = id => FONTS.find(f => f.id === id) || FONTS.find(f => f.id === DEFAULT_FONT);

/* 테마·글꼴에 따라 부를 글꼴 주소(앱 안 파일 먼저, 구글 한 주소 — 숫자 글꼴 Roboto Mono는 늘) */
export function fontLinks(themeId, fontId) {
  const theme = THEME_GOOGLE[themeId] ? themeId : 'dark-nav', f = fontOf(fontId);
  const fam = f.id === 'theme' ? THEME_GOOGLE[theme] : [f.google, theme === 'paper' ? PAPER_TITLE : ''].filter(Boolean).join('&family=');
  return [...(f.css ? [f.css] : []), `https://fonts.googleapis.com/css2?family=${fam ? fam + '&family=' : ''}Roboto+Mono:wght@400;500&display=swap`];
}
/* 화면을 막지 않게(print로 받은 뒤 all) 부르고, 같은 주소는 한 번만 */
export function loadFontLinks(hrefs) {
  if (typeof document === 'undefined') return;
  const have = new Set([...document.querySelectorAll('link[data-font]')].map(l => l.getAttribute('href')));
  for (const href of hrefs) {
    if (have.has(href)) continue;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.media = 'print'; l.dataset.font = '1'; l.href = href;
    l.onload = () => { l.media = 'all'; };
    document.head.appendChild(l);
  }
}
export const ensureFonts = (themeId, fontId) => loadFontLinks(fontLinks(themeId, fontId));

export function getFont() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); if (knownFont(v)) return v; } catch (e) {}
  return DEFAULT_FONT;
}
export function setFont(id) {
  if (!knownFont(id)) id = DEFAULT_FONT;
  document.documentElement.dataset.font = id;
  ensureFonts(document.documentElement.dataset.theme, id);
  try { localStorage.setItem(KEY, JSON.stringify(id)); } catch (e) {}
  return id;
}
/* 설정 화면에서 글꼴 이름을 그 글꼴로 미리 보이게 모든 후보를 부름 */
export const previewFonts = () => loadFontLinks(FONTS.flatMap(f => [...(f.css ? [f.css] : []), ...(f.google ? [`https://fonts.googleapis.com/css2?family=${f.google}&display=swap`] : [])]));
