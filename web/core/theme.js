// 화면 테마: <html data-theme="…"> 하나로 바뀜. 값은 core/theme.css
export const THEMES = [
  { id: 'dark-nav', label: '다크 내비', desc: '어두운 세로 메뉴에 밝은 작업 영역' },
  { id: 'mono', label: '모노 라인', desc: '흰 바탕에 가는 선과 검정 하나' },
  { id: 'soft', label: '소프트 카드', desc: '둥근 카드와 큼직한 버튼' },
  { id: 'paper', label: '종이 문서', desc: '종이색 바탕과 명조 제목' },
  { id: 'rail', label: '아이콘 레일', desc: '좁은 아이콘 메뉴로 넓은 작업 영역' }
];
const KEY = 'ssam:theme', DEFAULT = 'dark-nav';
const known = id => THEMES.some(t => t.id === id);

export function getTheme() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); if (known(v)) return v; } catch (e) {}
  return DEFAULT;
}
export function setTheme(id) {
  if (!known(id)) id = DEFAULT;
  document.documentElement.dataset.theme = id;
  try { localStorage.setItem(KEY, JSON.stringify(id)); } catch (e) {}
  return id;
}
