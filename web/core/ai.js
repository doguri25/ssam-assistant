/* AI 부르기: 새 메뉴(품의·계획 등)는 이 파일만 씀.
   실제 호출·키·모델은 평가 메뉴(window.SSAM.ai)가 맡음 — Claude·Gemini·GPT·업스테이지 */
const A = () => (window.SSAM && window.SSAM.ai) || null;

/* images: [{ mime, b64, blob }] → { text, truncated }. 실패하면 { code, message }를 던짐 */
export function generate(prompt, { signal, images, careful } = {}) {
  const a = A();
  if (!a) return Promise.reject({ code: 'no_engine' });
  return a.generate(prompt, { signal, images, careful, fresh: true });
}

export const ready = () => !!(A() && A().engineReady());
export const providerName = () => (A() && A().providerName()) || '';
export const errorMessage = (code, e) => (A() ? A().errMsg(code, e) : 'AI를 부르지 못했어요.');
