/* 바탕화면 위 버튼 창(Windows 앱, 스펙 2026-10-30-inbox-button 8): 끌어 놓은 파일 경로만 Rust(inbox_take)에 넘김.
   누르면 쌤비서 열기, 끌면 옮기기(위치는 쌤비서와 같은 저장소 ssam:bubble에), 오른쪽 클릭 메뉴 */
(function () {
  const T = window.__TAURI__;
  const el = document.getElementById('bubble');
  if (!T || !el) return;
  const invoke = (cmd, args) => Promise.resolve(T.core.invoke(cmd, args)).catch(() => {});
  const win = T.window.getCurrentWindow();
  const KEY = 'ssam:bubble';

  // 위치: 지난 자리(모니터 안일 때만), 없으면 첫 모니터 오른쪽 아래
  (async () => {
    let pos = null;
    try { pos = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    const mons = (await T.window.availableMonitors().catch(() => [])) || [];
    const inside = p => p && mons.some(m => p.x >= m.position.x && p.y >= m.position.y && p.x < m.position.x + m.size.width - 40 && p.y < m.position.y + m.size.height - 40);
    if (!inside(pos)) {
      const m = (await T.window.currentMonitor().catch(() => null)) || mons[0];
      pos = m ? { x: m.position.x + m.size.width - 140, y: m.position.y + m.size.height - 200 } : null;
    }
    if (pos) win.setPosition(new T.dpi.PhysicalPosition(pos.x, pos.y)).catch(() => {});
    win.onMoved(({ payload }) => { try { localStorage.setItem(KEY, JSON.stringify({ x: payload.x, y: payload.y })); } catch (e) {} }).catch(() => {});
  })();

  // 누르기·끌기: 조금 움직이면 창 옮기기, 그냥 떼면 쌤비서 열기
  let down = null;
  el.addEventListener('mousedown', e => { if (e.button === 0) down = { x: e.screenX, y: e.screenY }; });
  el.addEventListener('mousemove', e => {
    if (!down || !(e.buttons & 1)) return;
    if (Math.abs(e.screenX - down.x) + Math.abs(e.screenY - down.y) > 4) { down = null; win.startDragging().catch(() => {}); }
  });
  el.addEventListener('click', () => { invoke('bubble_action', { action: 'open' }); down = null; });

  // 오른쪽 클릭 메뉴
  el.addEventListener('contextmenu', async e => {
    e.preventDefault();
    const act = action => () => invoke('bubble_action', { action });
    try {
      const menu = await T.menu.Menu.new({ items: [
        { id: 'open', text: '쌤비서 열기', action: act('open') },
        { id: 'pick', text: '파일 고르기…', action: act('pick') },
        { id: 'hide', text: '버튼 숨기기', action: act('hide') },
        { id: 'quit', text: '쌤비서 끝내기', action: act('quit') }
      ] });
      await menu.popup();
    } catch (err) {}
  });

  // 파일을 끌어 오면 초록, 놓으면 경로를 넘김
  T.webview.getCurrentWebview().onDragDropEvent(({ payload }) => {
    if (payload.type === 'enter' || payload.type === 'over') el.classList.add('over');
    else if (payload.type === 'leave') el.classList.remove('over');
    else if (payload.type === 'drop') { el.classList.remove('over'); if (payload.paths && payload.paths.length) invoke('inbox_take', { paths: payload.paths }); }
  }).catch(() => {});
})();
