/* 화면 공통 도구: 복사, 파일 저장, 알림. 기존 앱(window.SSAM)의 것을 씀 */
const S = () => window.SSAM || {};

export const toast = (msg, ms) => { if (S().toast) S().toast(msg, ms); };

export function copyText(text) {
  if (S().copyText) return S().copyText(text);
  return navigator.clipboard.writeText(text).then(() => true, () => false);
}

/* Windows 앱은 다운로드 폴더에 쓰고 그 경로를, 웹은 내려받기를 하고 이름을 돌려줌 */
export async function saveFile(name, bytes, mime = 'application/octet-stream') {
  const T = window.__TAURI__;
  if (T && T.core) return T.core.invoke('save_download', { name, bytes: Array.from(bytes) });
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return name;
}
