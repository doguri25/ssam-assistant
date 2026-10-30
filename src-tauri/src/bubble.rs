//! 떠 있는 버튼(바탕화면 위 「쌤」 창, 스펙 2026-10-30-inbox-button 8).
//! 버튼 창에 끌어 놓은 파일의 경로만 받아 허용 목록에 넣고 쌤비서 창(main)에 `inbox:files`로 알림.
//! 쌤비서 화면은 허용 목록에 있는 경로만 `inbox_read`로 읽을 수 있음(한 번 읽으면 목록에서 빠짐, 60MB까지).

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

pub const MAX_BYTES: u64 = 60 * 1024 * 1024;

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
    allowed: Mutex<HashSet<PathBuf>>,
}

#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct Dropped {
    pub path: String,
    pub name: String,
    pub size: u64,
}

/// 끌어 놓은 경로 중 있는 파일만 허용 목록에 넣고 알릴 목록을 돌려줌 (폴더·없는 경로는 뺌)
pub fn allow(allowed: &Mutex<HashSet<PathBuf>>, paths: &[String]) -> Vec<Dropped> {
    let mut list = Vec::new();
    let mut set = allowed.lock().unwrap();
    for p in paths {
        let pb = PathBuf::from(p);
        if let Ok(meta) = std::fs::metadata(&pb) {
            if meta.is_file() {
                let name = pb.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                set.insert(pb.clone());
                list.push(Dropped { path: p.clone(), name, size: meta.len() });
            }
        }
    }
    list
}

/// 허용 목록에 있는 경로만 읽음. 읽으면 목록에서 뺌. 너무 크면 TOO_BIG, 목록에 없으면 NOT_ALLOWED
pub fn read_allowed(allowed: &Mutex<HashSet<PathBuf>>, path: &Path, max: u64) -> Result<Vec<u8>, String> {
    if !allowed.lock().unwrap().remove(path) {
        return Err("NOT_ALLOWED".into());
    }
    let meta = std::fs::metadata(path).map_err(|_| "READ_FAILED".to_string())?;
    if meta.len() > max {
        return Err("TOO_BIG".into());
    }
    std::fs::read(path).map_err(|_| "READ_FAILED".to_string())
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
pub fn inbox_take(app: AppHandle, state: State<Bubble>, paths: Vec<String>) -> usize {
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
        "hide" => {
            if let Some(w) = app.get_webview_window("bubble") {
                let _ = w.hide();
            }
            let _ = app.emit_to("main", "bubble:off", ());
        }
        "quit" => app.exit(0),
        _ => {}
    }
}

/// 쌤비서 창을 닫을 때: 버튼이 켜져 있고 「버튼은 남기기」면 창만 숨김, 아니면 앱을 끝냄(숨은 버튼 창이 앱을 붙들지 않게)
pub fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if window.label() != "main" {
        return;
    }
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        let app = window.app_handle();
        let cfg = *app.state::<Bubble>().cfg.lock().unwrap();
        if cfg.enabled && cfg.keep_on_close {
            api.prevent_close();
            let _ = window.hide();
        } else {
            app.exit(0);
        }
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
        let allowed = Mutex::new(HashSet::new());
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
    fn 허용_안_된_경로와_큰_파일은_못_읽음() {
        let allowed = Mutex::new(HashSet::new());
        let b = temp("b.txt", b"hello");
        assert_eq!(read_allowed(&allowed, &b, MAX_BYTES).unwrap_err(), "NOT_ALLOWED");
        allow(&allowed, &[b.to_string_lossy().to_string()]);
        assert_eq!(read_allowed(&allowed, &b, 3).unwrap_err(), "TOO_BIG");
        let _ = std::fs::remove_file(b);
    }
}
