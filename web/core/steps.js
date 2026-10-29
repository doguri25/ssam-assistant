/* 단계 표시: 1 ─ 2 ─ 3 … 지금 단계는 aria-current="step", 가 본 단계는 눌러서 돌아갈 수 있음 */
export function stepsHTML(list, cur, done) {
  return `<ol class="steps">${list.map((label, i) => {
    const n = i + 1, inner = `<b class="steps-n">${n}</b><span class="steps-t">${label}</span>`;
    if (n === cur) return `<li class="cur" aria-current="step"><span class="steps-in">${inner}</span></li>`;
    if (n <= done) return `<li class="done"><button type="button" class="steps-in" data-step="${n}">${inner}</button></li>`;
    return `<li><span class="steps-in">${inner}</span></li>`;
  }).join('')}</ol>`;
}
