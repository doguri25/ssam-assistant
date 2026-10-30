//! 떠 있는 버튼(바탕화면 위 「쌤」 창, 스펙 2026-10-30-inbox-button 8).
//! 버튼 창에 끌어 놓은 파일의 경로만 받아 허용 목록에 넣고 쌤비서 창(main)에 `inbox:files`로 알림.
//! 쌤비서 화면은 허용 목록에 있는 경로만 `inbox_read`로 읽을 수 있음(한 번 읽으면 목록에서 빠짐, 60MB까지).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

pub const MAX_BYTES: u64 = 60 * 1024 * 1024;
/// 같은 파일을 잇달아 놓으면 아직 읽지 않은 동안(이만큼) 한 번만 알림
pub const PENDING: Duration = Duration::from_secs(10);
type Allowed = Mutex<HashMap<PathBuf, Instant>>;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Cfg {
    pub enabled: bool,
    pub keep_on_close: bool,
    pub autostart: bool,
}
impl Default for Cfg {
    fn default() -> Self {
        Cfg { enabled: true, keep_on_close: true, autostart: false }
    }
}

#[derive(Default)]
pub struct Bubble {
    pub cfg: Mutex<Cfg>,
    allowed: Allowed,
}

#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct Dropped {
    pub path: String,
    pub name: String,
    pub size: u64,
}

/// 끌어 놓은 경로 중 있는 파일만 허용 목록에 넣고 알릴 목록을 돌려줌 (폴더·없는 경로는 뺌, 아직 읽지 않은 같은 파일은 다시 알리지 않음)
pub fn allow(allowed: &Allowed, paths: &[String]) -> Vec<Dropped> {
    let mut list = Vec::new();
    let mut set = allowed.lock().unwrap();
    let now = Instant::now();
    for p in paths {
        let pb = PathBuf::from(p);
        if let Ok(meta) = std::fs::metadata(&pb) {
            if meta.is_file() {
                if set.get(&pb).map_or(false, |t| now.duration_since(*t) < PENDING) {
                    continue;
                }
                let name = pb.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                set.insert(pb, now);
                list.push(Dropped { path: p.clone(), name, size: meta.len() });
            }
        }
    }
    list
}

/// 허용 목록에 있는 경로만 읽음. 읽으면 목록에서 뺌. 너무 크면 TOO_BIG, 목록에 없으면 NOT_ALLOWED
pub fn read_allowed(allowed: &Allowed, path: &Path, max: u64) -> Result<Vec<u8>, String> {
    if allowed.lock().unwrap().remove(path).is_none() {
        return Err("NOT_ALLOWED".into());
    }
    let meta = std::fs::metadata(path).map_err(|_| "READ_FAILED".to_string())?;
    if meta.len() > max {
        return Err("TOO_BIG".into());
    }
    std::fs::read(path).map_err(|_| "READ_FAILED".to_string())
}

/// 경로를 넘길 수 있는 창은 버튼 창뿐 (쌤비서 화면이 아무 경로나 허용 목록에 넣고 읽지 못하게)
pub fn from_bubble(label: &str) -> bool {
    label == "bubble"
}

fn main_hidden(app: &AppHandle) -> bool {
    app.get_webview_window("main").map(|w| !w.is_visible().unwrap_or(true)).unwrap_or(false)
}

/// 버튼 숨기기: 쌤비서 창이 숨어 있으면 보이고(창이 하나도 없는 채로 켜져 있지 않게, 다시 켜는 곳 안내도 보이게) 설정을 끄게 알림
fn hide_bubble(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("bubble") {
        let _ = w.hide();
    }
    if main_hidden(app) {
        show_main(app);
    }
    let _ = app.emit_to("main", "bubble:off", ());
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// 화면의 설정(설정 › 화면 › 떠 있는 버튼)을 받음: 버튼 보이기, 창을 닫을 때, 컴퓨터를 켜면 시작
#[tauri::command]
pub fn bubble_config(app: AppHandle, state: State<Bubble>, enabled: bool, keep_on_close: bool, autostart: bool) {
    *state.cfg.lock().unwrap() = Cfg { enabled, keep_on_close, autostart };
    if let Some(w) = app.get_webview_window("bubble") {
        let _ = if enabled { w.show() } else { w.hide() };
    }
    // 버튼을 껐는데 쌤비서 창도 숨어 있으면 창이 하나도 없으므로 쌤비서 창을 보임
    if !enabled && main_hidden(&app) {
        show_main(&app);
    }
    use tauri_plugin_autostart::ManagerExt;
    let launch = app.autolaunch();
    let on = launch.is_enabled().unwrap_or(false);
    if autostart && !on {
        let _ = launch.enable();
    } else if !autostart && on {
        let _ = launch.disable();
    }
}

/// 버튼 창에 끌어 놓은 경로 → 허용 목록, 쌤비서 창을 앞으로 하고 알림. 넘긴 파일 수를 돌려줌
#[tauri::command]
pub fn inbox_take(app: AppHandle, webview: tauri::Webview, state: State<Bubble>, paths: Vec<String>) -> usize {
    if !from_bubble(webview.label()) {
        return 0;
    }
    let list = allow(&state.allowed, &paths);
    if !list.is_empty() {
        show_main(&app);
        let _ = app.emit_to("main", "inbox:files", &list);
    }
    list.len()
}

/// 허용 목록에 있는 경로의 바이트 (쌤비서 화면이 File로 만들어 받음)
#[tauri::command]
pub fn inbox_read(state: State<Bubble>, path: String) -> Result<tauri::ipc::Response, String> {
    read_allowed(&state.allowed, Path::new(&path), MAX_BYTES).map(tauri::ipc::Response::new)
}

/// 버튼 메뉴: open(쌤비서 열기) · pick(파일 고르기) · hide(버튼 숨기기) · quit(끝내기)
#[tauri::command]
pub fn bubble_action(app: AppHandle, action: String) {
    match action.as_str() {
        "open" => show_main(&app),
        "pick" => {
            show_main(&app);
            let _ = app.emit_to("main", "inbox:pick", ());
        }
        "hide" => hide_bubble(&app),
        "quit" => app.exit(0),
        _ => {}
    }
}

/// 창을 닫을 때
/// - 쌤비서 창: 버튼이 켜져 있고 「버튼은 남기기」면 창만 숨김, 아니면 앱을 끝냄(숨은 버튼 창이 앱을 붙들지 않게)
/// - 버튼 창(Alt+F4 등): 메뉴의 「버튼 숨기기」와 같게 (창은 남겨 두어 설정에서 다시 켤 수 있게)
pub fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    let tauri::WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };
    let app = window.app_handle();
    match window.label() {
        "main" => {
            let cfg = *app.state::<Bubble>().cfg.lock().unwrap();
            if cfg.enabled && cfg.keep_on_close {
                api.prevent_close();
                let _ = window.hide();
            } else {
                app.exit(0);
            }
        }
        "bubble" => {
            api.prevent_close();
            hide_bubble(app);
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp(name: &str, bytes: &[u8]) -> PathBuf {
        let p = std::env::temp_dir().join(format!("ssam-bubble-{}-{}", std::process::id(), name));
        std::fs::File::create(&p).unwrap().write_all(bytes).unwrap();
        p
    }

    #[test]
    fn 끌어_놓은_파일만_한_번_읽음() {
        let allowed = Mutex::new(HashMap::new());
        let a = temp("a.csv", b"1,2");
        let list = allow(&allowed, &[a.to_string_lossy().to_string(), "C:/없는/경로.hwp".into(), std::env::temp_dir().to_string_lossy().to_string()]);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].size, 3);
        assert!(list[0].name.ends_with("a.csv"));
        assert_eq!(read_allowed(&allowed, &a, MAX_BYTES).unwrap(), b"1,2");
        assert_eq!(read_allowed(&allowed, &a, MAX_BYTES).unwrap_err(), "NOT_ALLOWED");
        let _ = std::fs::remove_file(a);
    }

    #[test]
    fn 같은_파일을_잇달아_놓으면_한_번만_알림() {
        let allowed = Mutex::new(HashMap::new());
        let c = temp("c.txt", b"x");
        let s = c.to_string_lossy().to_string();
        assert_eq!(allow(&allowed, &[s.clone(), s.clone()]).len(), 1);
        assert_eq!(allow(&allowed, &[s.clone()]).len(), 0);
        read_allowed(&allowed, &c, MAX_BYTES).unwrap();
        assert_eq!(allow(&allowed, &[s.clone()]).len(), 1);
        let _ = std::fs::remove_file(c);
    }

    #[test]
    fn 경로는_버튼_창만_넘길_수_있음() {
        assert!(from_bubble("bubble"));
        assert!(!from_bubble("main"));
        assert!(!from_bubble(""));
    }

    #[test]
    fn 허용_안_된_경로와_큰_파일은_못_읽음() {
        let allowed = Mutex::new(HashMap::new());
        let b = temp("b.txt", b"hello");
        assert_eq!(read_allowed(&allowed, &b, MAX_BYTES).unwrap_err(), "NOT_ALLOWED");
        allow(&allowed, &[b.to_string_lossy().to_string()]);
        assert_eq!(read_allowed(&allowed, &b, 3).unwrap_err(), "TOO_BIG");
        let _ = std::fs::remove_file(b);
    }
}
