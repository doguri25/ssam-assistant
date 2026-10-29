// 아직 만들지 않은 메뉴의 자리 (계획 2~5에서 채움)
export function renderPlaceholder(section, menu, tab) {
  if (!section) return;
  let box = section.querySelector('.ph');
  if (!box) { box = document.createElement('div'); box.className = 'ph'; section.prepend(box); }
  const t = menu.tabs.find(x => x.id === tab) || menu.tabs[0];
  box.innerHTML = `<div class="m-page"><div class="m-head"><h2>${t.label}</h2><p class="muted">곧 만들어요.</p></div></div>`;
}
