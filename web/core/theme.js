// 화면 테마: <html data-theme="…"> 하나로 바뀜. 값은 core/theme.css
export const THEMES = [
  { id: 'dark-nav', label: '다크 내비', desc: '어두운 세로 메뉴에 밝은 작업 영역' },
  { id: 'mono', label: '모노 라인', desc: '흰 바탕에 가는 선과 검정 하나' },
  { id: 'soft', label: '소프트 카드', desc: '둥근 카드와 큼직한 버튼' },
  { id: 'paper', label: '종이 문서', desc: '종이색 바탕과 명조 제목' },
  { id: 'rail', label: '아이콘 레일', desc: '좁은 아이콘 메뉴로 넓은 작업 영역' }
];
const KEY = 'ssam:theme', DEFAULT = 'dark-nav';
/* 테마마다 쓰는 글꼴만 부름 (index.html 첫 스크립트에도 같은 표가 있음) */
const FONT = {
  'dark-nav': 'Gothic+A1:wght@400;500;600;700;800', mono: 'IBM+Plex+Sans+KR:wght@400;500;600;700', soft: 'Noto+Sans+KR:wght@400;500;700',
  paper: 'Noto+Serif+KR:wght@600;700&family=Noto+Sans+KR:wght@400;500;700', rail: 'Noto+Sans+KR:wght@400;500;700'
};
export const fontUrl = id => `https://fonts.googleapis.com/css2?family=${FONT[id] || FONT[DEFAULT]}&family=Roboto+Mono:wght@400;500&display=swap`;
/* 화면을 막지 않게(print로 받은 뒤 all) 부르고, 한 테마 글꼴은 한 번만 */
function loadFont(id) {
  if (typeof document === 'undefined' || document.querySelector(`link[data-font="${id}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.media = 'print'; l.dataset.font = id; l.href = fontUrl(id);
  l.onload = () => { l.media = 'all'; };
  document.head.appendChild(l);
}
const known = id => THEMES.some(t => t.id === id);

export function getTheme() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); if (known(v)) return v; } catch (e) {}
  return DEFAULT;
}
export function setTheme(id) {
  if (!known(id)) id = DEFAULT;
  document.documentElement.dataset.theme = id;
  loadFont(id);
  try { localStorage.setItem(KEY, JSON.stringify(id)); } catch (e) {}
  return id;
}
