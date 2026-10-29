//! 만든 파일(.hwpx 등)을 다운로드 폴더에 저장. 같은 이름이 있으면 「이름 (2).hwpx」처럼 비켜 씀.

use std::path::{Path, PathBuf};

/// 파일 이름에 쓸 수 없는 글자를 `_`로 바꿈. 비면 「파일」
pub fn safe_name(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| {
            if c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
                '_'
            } else {
                c
            }
        })
        .collect();
    let s = s.trim().trim_matches('.').to_string();
    if s.is_empty() {
        "파일".to_string()
    } else {
        s
    }
}

/// `dir/name`이 이미 있으면 `이름 (2).확장자`, `이름 (3).확장자` …
pub fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    (2..)
        .map(|n| dir.join(format!("{stem} ({n}){ext}")))
        .find(|p| !p.exists())
        .unwrap_or(first)
}

fn downloads_dir() -> PathBuf {
    std::env::var_os("USERPROFILE")
        .map(|h| PathBuf::from(h).join("Downloads"))
        .filter(|p| p.is_dir())
        .unwrap_or_else(std::env::temp_dir)
}

/// 다운로드 폴더에 저장하고 저장한 경로를 돌려줌
#[tauri::command]
pub fn save_download(name: String, bytes: Vec<u8>) -> Result<String, String> {
    let path = unique_path(&downloads_dir(), &safe_name(&name));
    std::fs::write(&path, bytes).map_err(|e| format!("파일을 저장하지 못했어요: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_names() {
        assert_eq!(safe_name("a/b:c?.hwpx"), "a_b_c_.hwpx");
        assert_eq!(safe_name(""), "파일");
        assert_eq!(safe_name("  품의.hwpx "), "품의.hwpx");
    }

    #[test]
    fn unique_paths() {
        let dir = std::env::temp_dir().join(format!("ssam-files-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(unique_path(&dir, "품의.hwpx"), dir.join("품의.hwpx"));
        std::fs::write(dir.join("품의.hwpx"), b"x").unwrap();
        assert_eq!(unique_path(&dir, "품의.hwpx"), dir.join("품의 (2).hwpx"));
        std::fs::write(dir.join("품의 (2).hwpx"), b"x").unwrap();
        assert_eq!(unique_path(&dir, "품의.hwpx"), dir.join("품의 (3).hwpx"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
