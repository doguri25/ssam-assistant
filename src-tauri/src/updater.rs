//! 자동 업데이트
//!
//! 공개 레포(doguri25/nice-releases)의 최신 릴리즈에 올라간 `latest.json`을 읽어
//! 새 버전이 있는지 보고, 파일을 받으면서 확인값(SHA-256)을 계산해
//! `latest.json`에 적힌 값과 맞으면 설치한다.
//!
//! `releases/latest/download/...` 주소는 GitHub API 호출 횟수 제한(시간당 60번)을
//! 받지 않아서, 학교처럼 여러 컴퓨터가 같은 인터넷 주소를 쓰는 곳에서도 막히지 않는다.

use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// 업데이트 파일을 올려 두는 공개 레포
pub const RELEASES_REPO: &str = "doguri25/nice-releases";
pub const GITHUB: &str = "https://github.com";
/// 릴리즈마다 함께 올리는 새 버전 정보 파일
pub const MANIFEST_NAME: &str = "latest.json";
/// 레포에 아직 릴리즈가 없을 때
pub const NO_RELEASE: &str = "NO_RELEASE";
/// 실행 파일판을 바꿀 때 옛 파일에 붙이는 꼬리 (다음 실행 때 지움)
pub const OLD_SUFFIX: &str = ".pyeongeo-old";
/// 받은 설치 파일을 두는 임시 폴더 이름
pub const TEMP_DIR_NAME: &str = "pyeongeo-update";

#[derive(Debug, Clone, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub sha256: String,
    #[serde(default)]
    pub size: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Manifest {
    pub version: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub published: String,
    pub setup: FileEntry,
    pub portable: FileEntry,
}

impl Manifest {
    pub fn file(&self, portable: bool) -> &FileEntry {
        if portable {
            &self.portable
        } else {
            &self.setup
        }
    }
}

/// "v1.2.3", "1.2", "1.2.3-beta" → (1, 2, 3)
pub fn parse_version(s: &str) -> Option<(u64, u64, u64)> {
    let s = s.trim().trim_start_matches(['v', 'V']);
    let core = s.split(['-', '+']).next()?;
    let mut it = core.split('.');
    let a = it.next()?.trim().parse().ok()?;
    let b = it.next().map_or(Some(0), |p| p.trim().parse().ok())?;
    let c = it.next().map_or(Some(0), |p| p.trim().parse().ok())?;
    if it.next().is_some() {
        return None;
    }
    Some((a, b, c))
}

pub fn is_newer(latest: &str, current: &str) -> bool {
    match (parse_version(latest), parse_version(current)) {
        (Some(l), Some(c)) => l > c,
        _ => false,
    }
}

/// 파일 이름에 폴더 구분자 같은 것이 없는지 (영문·숫자·.-_ 만)
fn safe_file_name(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('.')
        && name.len() <= 120
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
}

fn is_hash(s: &str) -> bool {
    s.len() == 64 && s.chars().all(|c| c.is_ascii_hexdigit())
}

/// latest.json 읽기 + 내용 검사
pub fn parse_manifest(text: &str) -> Result<Manifest, String> {
    let text = text.trim_start_matches('\u{feff}');
    let m: Manifest =
        serde_json::from_str(text).map_err(|e| format!("새 버전 정보를 읽지 못했어요: {e}"))?;
    if parse_version(&m.version).is_none() {
        return Err(format!("새 버전 번호가 이상해요: {}", m.version));
    }
    for f in [&m.setup, &m.portable] {
        if !safe_file_name(&f.name) || !is_hash(&f.sha256) {
            return Err("새 버전 정보에 잘못된 파일 정보가 있어요".to_string());
        }
    }
    Ok(m)
}

pub fn manifest_url(base: &str, repo: &str) -> String {
    format!("{base}/{repo}/releases/latest/download/{MANIFEST_NAME}")
}

pub fn file_url(base: &str, repo: &str, version: &str, name: &str) -> String {
    let v = version.trim().trim_start_matches(['v', 'V']);
    format!("{base}/{repo}/releases/download/v{v}/{name}")
}

pub fn release_page(repo: &str) -> String {
    format!("{GITHUB}/{repo}/releases/latest")
}

pub fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(concat!("pyeongeo-updater/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("인터넷 연결을 준비하지 못했어요: {e}"))
}

fn net_err(e: reqwest::Error) -> String {
    if e.is_timeout() {
        "인터넷 응답이 너무 늦어요. 잠시 뒤 다시 해 주세요.".to_string()
    } else if e.is_connect() {
        "인터넷에 연결하지 못했어요. 연결을 확인해 주세요.".to_string()
    } else {
        format!("내려받는 중 문제가 생겼어요: {e}")
    }
}

/// 최신 버전 정보. 릴리즈가 아직 없으면 Err(NO_RELEASE)
pub async fn latest_manifest(
    client: &reqwest::Client,
    base: &str,
    repo: &str,
) -> Result<Manifest, String> {
    let res = client
        .get(manifest_url(base, repo))
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(net_err)?;
    match res.status().as_u16() {
        200 => {}
        404 => return Err(NO_RELEASE.to_string()),
        s => return Err(format!("새 버전 정보를 받지 못했어요 (HTTP {s})")),
    }
    let text = res.text().await.map_err(net_err)?;
    parse_manifest(&text)
}

/// 파일을 받아 `dest`에 쓰고 SHA-256 확인값(소문자 16진수)을 돌려줌.
/// `progress(받은 바이트, 전체 바이트)` — 전체를 모르면 0.
/// 실패하면 받던 파일을 지움.
pub async fn download(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    progress: impl FnMut(u64, u64),
) -> Result<String, String> {
    let result = download_inner(client, url, dest, progress).await;
    if result.is_err() {
        let _ = std::fs::remove_file(dest);
    }
    result
}

async fn download_inner(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    mut progress: impl FnMut(u64, u64),
) -> Result<String, String> {
    let mut res = client
        .get(url)
        .timeout(Duration::from_secs(900))
        .send()
        .await
        .map_err(net_err)?;
    if !res.status().is_success() {
        return Err(format!(
            "새 버전 파일을 받지 못했어요 (HTTP {})",
            res.status().as_u16()
        ));
    }
    let total = res.content_length().unwrap_or(0);
    if let Some(dir) = dest.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("폴더를 만들지 못했어요: {e}"))?;
    }
    let mut file = std::fs::File::create(dest).map_err(|e| {
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            "이 폴더에는 새 파일을 쓸 수 없어요. 새 버전을 직접 내려받아 주세요.".to_string()
        } else {
            format!("파일을 만들지 못했어요: {e}")
        }
    })?;
    let mut hasher = Sha256::new();
    let mut done: u64 = 0;
    while let Some(chunk) = res.chunk().await.map_err(net_err)? {
        hasher.update(&chunk);
        file.write_all(&chunk)
            .map_err(|e| format!("파일을 저장하지 못했어요: {e}"))?;
        done += chunk.len() as u64;
        progress(done, total);
    }
    file.flush()
        .map_err(|e| format!("파일을 저장하지 못했어요: {e}"))?;
    drop(file);
    if total > 0 && done != total {
        return Err("파일을 끝까지 받지 못했어요. 다시 해 주세요.".to_string());
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}

/// 받은 파일의 확인값이 맞는지
pub fn verify(actual: &str, entry: &FileEntry) -> Result<(), String> {
    if actual.eq_ignore_ascii_case(entry.sha256.trim()) {
        Ok(())
    } else {
        Err("받은 파일의 확인값이 맞지 않아요. 파일이 손상됐을 수 있어 설치하지 않았어요. 다시 해 주세요.".to_string())
    }
}

/// 실행 파일판의 새 파일 위치: 늘 지금 이름 그대로.
/// (이름을 바꾸면 바탕화면 바로가기·작업 표시줄 고정이 끊어짐)
pub fn portable_target(exe: &Path, _new_name: &str) -> PathBuf {
    exe.to_path_buf()
}

/// 백신이 막 쓴 파일을 검사하는 동안 잠깐 잠길 수 있어서, 없는 파일이 아니면 몇 번 다시 해 봄
fn retry<T>(mut f: impl FnMut() -> std::io::Result<T>) -> std::io::Result<T> {
    let mut wait = 200;
    for _ in 0..5 {
        match f() {
            Ok(v) => return Ok(v),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Err(e),
            Err(_) => {
                std::thread::sleep(Duration::from_millis(wait));
                wait += 200;
            }
        }
    }
    f()
}

pub fn old_path(exe: &Path) -> PathBuf {
    let mut s = exe.as_os_str().to_os_string();
    s.push(OLD_SUFFIX);
    PathBuf::from(s)
}

/// 실행 파일판 바꾸기.
/// Windows에서는 실행 중인 파일을 지울 수는 없지만 이름은 바꿀 수 있어서,
/// 지금 파일을 `<이름>.pyeongeo-old`로 비켜 두고 받은 파일을 제자리에 놓는다.
/// 돌려주는 값: 비켜 둔 옛 파일 (앱이 닫힌 뒤 지움)
pub fn swap_portable(exe: &Path, downloaded: &Path, target: &Path) -> Result<PathBuf, String> {
    let old = old_path(exe);
    let _ = std::fs::remove_file(&old);
    retry(|| std::fs::rename(exe, &old))
        .map_err(|e| format!("지금 프로그램 파일을 옮기지 못했어요: {e}"))?;
    if let Err(e) = retry(|| std::fs::rename(downloaded, target)) {
        // 되돌리기
        let _ = std::fs::rename(&old, exe);
        let _ = std::fs::remove_file(downloaded);
        return Err(format!("새 프로그램 파일을 놓지 못했어요: {e}"));
    }
    Ok(old)
}

/// 앱을 켤 때 지난 업데이트에서 남은 파일 치우기 (실패해도 그냥 넘어감)
pub fn cleanup_leftovers(exe: &Path, temp: &Path) {
    if let Some(dir) = exe.parent() {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for e in entries.flatten() {
                let name = e.file_name();
                let name = name.to_string_lossy();
                if name.ends_with(OLD_SUFFIX) || name.ends_with(".pyeongeo-download") {
                    let _ = std::fs::remove_file(e.path());
                }
            }
        }
    }
    let _ = std::fs::remove_dir_all(temp.join(TEMP_DIR_NAME));
}

/// 업데이트로 새로 켠 실행 파일판에 붙이는 표시. 이 표시가 있으면 옛 앱이 닫힐 때까지 기다렸다가 시작
pub const UPDATED_FLAG: &str = "--pyeongeo-updated";

// 백신이 「의심스러운 프로세스 실행」으로 잡지 않도록 cmd·powershell 같은 다른 프로그램을
// 거치지 않고, 설치 파일이나 새 실행 파일을 직접 켠다.

/// 설치판: 설치 파일을 바로 실행.
/// /P 진행 막대만 보이기, /R 설치가 끝나면 앱 다시 켜기, /UPDATE 바로가기를 새로 만들지 않기.
/// 앱이 아직 켜져 있으면 설치 파일이 알아서 닫는다.
pub fn launch_setup(setup: &Path) -> Result<(), String> {
    retry(|| {
        std::process::Command::new(setup)
            .args(["/P", "/R", "/UPDATE"])
            .spawn()
    })
    .map(|_| ())
    .map_err(|e| format!("설치 파일을 실행하지 못했어요: {e}"))
}

/// 실행 파일판: 새 실행 파일을 표시와 함께 켬 (새 앱이 옛 앱이 닫힐 때까지 기다림)
pub fn launch_updated(exe: &Path) -> Result<(), String> {
    let mut cmd = std::process::Command::new(exe);
    cmd.arg(UPDATED_FLAG);
    if let Some(dir) = exe.parent() {
        cmd.current_dir(dir);
    }
    retry(|| cmd.spawn())
        .map(|_| ())
        .map_err(|e| format!("새 버전을 켜지 못했어요: {e}"))
}

/// 옆에 남은 옛 파일(.pyeongeo-old)을 지울 수 있을 때까지(= 옛 앱이 닫힐 때까지) 기다림.
/// 다 지웠으면 true, 시간이 다 되면 false
pub fn wait_old_gone(exe: &Path, timeout: Duration) -> bool {
    let Some(dir) = exe.parent() else {
        return true;
    };
    let start = std::time::Instant::now();
    loop {
        let mut left = 0;
        if let Ok(entries) = std::fs::read_dir(dir) {
            for e in entries.flatten() {
                if e.file_name().to_string_lossy().ends_with(OLD_SUFFIX)
                    && std::fs::remove_file(e.path()).is_err()
                {
                    left += 1;
                }
            }
        }
        if left == 0 {
            return true;
        }
        if start.elapsed() >= timeout {
            return false;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest_json(version: &str) -> String {
        format!(
            r#"{{"version":"{version}","notes":"- 고친 점","published":"2026-10-14T00:00:00Z",
            "setup":{{"name":"pyeongeo-{version}-setup.exe","sha256":"{a}","size":10}},
            "portable":{{"name":"pyeongeo-{version}-portable.exe","sha256":"{b}","size":20}}}}"#,
            a = "a".repeat(64),
            b = "B".repeat(64)
        )
    }

    #[test]
    fn versions() {
        assert_eq!(parse_version("v1.2.3"), Some((1, 2, 3)));
        assert_eq!(parse_version("1.2"), Some((1, 2, 0)));
        assert_eq!(parse_version("2.0.1-beta.1"), Some((2, 0, 1)));
        assert_eq!(parse_version("1.2.3.4"), None);
        assert_eq!(parse_version("abc"), None);
        assert!(is_newer("v1.2.0", "1.1.0"));
        assert!(is_newer("1.10.0", "1.9.9"));
        assert!(!is_newer("1.1.0", "1.1.0"));
        assert!(!is_newer("1.0.9", "1.1.0"));
        assert!(!is_newer("garbage", "1.1.0"));
    }

    #[test]
    fn manifest() {
        let m = parse_manifest(&format!("\u{feff}{}", manifest_json("1.2.0"))).unwrap();
        assert_eq!(m.version, "1.2.0");
        assert_eq!(m.file(true).name, "pyeongeo-1.2.0-portable.exe");
        assert_eq!(m.file(false).size, 10);
        assert!(verify(&"b".repeat(64), m.file(true)).is_ok());
        assert!(verify(&"a".repeat(64), m.file(true)).is_err());

        let bad_name = manifest_json("1.2.0").replace("pyeongeo-1.2.0-setup.exe", "..\\\\x.exe");
        assert!(parse_manifest(&bad_name).is_err());
        let bad_hash = manifest_json("1.2.0").replace(&"a".repeat(64), "abc");
        assert!(parse_manifest(&bad_hash).is_err());
        assert!(parse_manifest(&manifest_json("x.y")).is_err());
        assert!(parse_manifest("<html>").is_err());
    }

    #[test]
    fn urls() {
        assert_eq!(
            manifest_url(GITHUB, RELEASES_REPO),
            "https://github.com/doguri25/nice-releases/releases/latest/download/latest.json"
        );
        assert_eq!(
            file_url(GITHUB, RELEASES_REPO, "1.2.0", "a.exe"),
            "https://github.com/doguri25/nice-releases/releases/download/v1.2.0/a.exe"
        );
    }

    #[test]
    fn portable_names() {
        let dir = Path::new("/x/y");
        assert_eq!(
            portable_target(
                &dir.join("pyeongeo-1.1.0-portable.exe"),
                "pyeongeo-1.2.0-portable.exe"
            ),
            dir.join("pyeongeo-1.1.0-portable.exe")
        );
        assert_eq!(
            portable_target(&dir.join("평어 만들기.exe"), "pyeongeo-1.2.0-portable.exe"),
            dir.join("평어 만들기.exe")
        );
        assert_eq!(old_path(&dir.join("a.exe")), dir.join("a.exe.pyeongeo-old"));
    }

    #[test]
    fn launch_and_wait() {
        // 없는 파일은 실행 못 함
        assert!(launch_setup(Path::new("/no/such/setup.exe")).is_err());
        assert!(launch_updated(Path::new("/no/such/app.exe")).is_err());
        // 옛 파일이 지워지면 바로 끝남
        let base = std::env::temp_dir().join(format!("pyeongeo-wait-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        let exe = base.join("pyeongeo-1.3.1-portable.exe");
        std::fs::write(&exe, b"new").unwrap();
        std::fs::write(
            base.join("pyeongeo-1.3.0-portable.exe.pyeongeo-old"),
            b"old",
        )
        .unwrap();
        assert!(wait_old_gone(&exe, Duration::from_secs(2)));
        assert!(!base
            .join("pyeongeo-1.3.0-portable.exe.pyeongeo-old")
            .exists());
        assert!(exe.exists());
        let _ = std::fs::remove_dir_all(&base);
    }

    /// 아주 작은 HTTP 서버 (경로 → (상태, 헤더, 본문))
    fn serve(routes: Vec<(&'static str, u16, String, Vec<u8>)>) -> String {
        use std::io::{BufRead, BufReader};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                let path = line.split_whitespace().nth(1).unwrap_or("").to_string();
                loop {
                    let mut h = String::new();
                    if reader.read_line(&mut h).unwrap_or(0) == 0 || h == "\r\n" {
                        break;
                    }
                }
                let mut out = stream;
                match routes.iter().find(|r| r.0 == path) {
                    Some((_, status, headers, body)) => {
                        let _ = write!(
                            out,
                            "HTTP/1.1 {status} X\r\n{headers}Connection: close\r\n\r\n"
                        );
                        let _ = out.write_all(body);
                    }
                    None => {
                        let _ = write!(out, "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                    }
                }
            }
        });
        format!("http://{addr}")
    }

    #[test]
    fn network() {
        let exe: Vec<u8> = (0..300_000u32).map(|i| (i % 251) as u8).collect();
        let hash: String = Sha256::digest(&exe)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        let manifest = format!(
            r#"{{"version":"1.3.0","notes":"- 새 기능","published":"","setup":{{"name":"pyeongeo-1.3.0-setup.exe","sha256":"{}","size":1}},"portable":{{"name":"pyeongeo-1.3.0-portable.exe","sha256":"{hash}","size":{}}}}}"#,
            "0".repeat(64),
            exe.len()
        );
        let base = serve(vec![
            // GitHub처럼 latest/download는 다른 주소로 넘겨줌
            (
                "/o/r/releases/latest/download/latest.json",
                302,
                "Location: /cdn/latest.json\r\nContent-Length: 0\r\n".into(),
                vec![],
            ),
            (
                "/cdn/latest.json",
                200,
                format!("Content-Length: {}\r\n", manifest.len()),
                manifest.clone().into_bytes(),
            ),
            (
                "/o/r/releases/download/v1.3.0/pyeongeo-1.3.0-portable.exe",
                200,
                format!("Content-Length: {}\r\n", exe.len()),
                exe.clone(),
            ),
            // 끝까지 오지 않는 파일
            (
                "/o/r/releases/download/v1.3.0/pyeongeo-1.3.0-setup.exe",
                200,
                format!("Content-Length: {}\r\n", exe.len() + 10),
                exe.clone(),
            ),
        ]);
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let dir = std::env::temp_dir().join(format!("pyeongeo-net-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        tauri::async_runtime::block_on(async {
            let m = latest_manifest(&client, &base, "o/r").await.unwrap();
            assert_eq!(m.version, "1.3.0");
            assert!(is_newer(&m.version, "1.2.0"));
            assert_eq!(
                latest_manifest(&client, &base, "o/none").await.unwrap_err(),
                NO_RELEASE
            );

            let entry = m.file(true).clone();
            let dest = dir
                .join("a")
                .join(format!("{}.pyeongeo-download", entry.name));
            let mut calls = 0u32;
            let mut last = (0u64, 0u64);
            let got = download(
                &client,
                &file_url(&base, "o/r", &m.version, &entry.name),
                &dest,
                |d, t| {
                    calls += 1;
                    last = (d, t);
                },
            )
            .await
            .unwrap();
            assert_eq!(got, hash);
            assert!(verify(&got, &entry).is_ok());
            assert!(calls >= 1 && last == (exe.len() as u64, exe.len() as u64));
            assert_eq!(std::fs::read(&dest).unwrap(), exe);

            // 손상: 확인값이 다름
            assert!(verify(&got, m.file(false)).is_err());
            // 덜 받음 → 실패하고 받던 파일을 지움
            let dest2 = dir.join("setup.exe");
            let err = download(
                &client,
                &file_url(&base, "o/r", "1.3.0", "pyeongeo-1.3.0-setup.exe"),
                &dest2,
                |_, _| {},
            )
            .await;
            assert!(err.is_err(), "{err:?}");
            assert!(!dest2.exists());
            // 없는 파일
            let dest3 = dir.join("x.exe");
            assert!(download(
                &client,
                &file_url(&base, "o/r", "9.9.9", "x.exe"),
                &dest3,
                |_, _| {}
            )
            .await
            .is_err());
            assert!(!dest3.exists());
        });
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn swap_and_cleanup() {
        let base = std::env::temp_dir().join(format!("pyeongeo-swap-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();

        // 이름에 버전이 있어도 지금 이름 그대로 (바로가기가 끊기지 않게)
        let exe = base.join("pyeongeo-1.1.0-portable.exe");
        std::fs::write(&exe, b"old").unwrap();
        let dl = base.join("pyeongeo-1.2.0-portable.exe.pyeongeo-download");
        std::fs::write(&dl, b"new").unwrap();
        let target = portable_target(&exe, "pyeongeo-1.2.0-portable.exe");
        assert_eq!(target, exe);
        let old = swap_portable(&exe, &dl, &target).unwrap();
        assert_eq!(std::fs::read(&exe).unwrap(), b"new");
        assert_eq!(std::fs::read(&target).unwrap(), b"new");
        assert_eq!(std::fs::read(&old).unwrap(), b"old");

        // 이름을 바꾼 파일 → 같은 이름 그대로
        let exe2 = base.join("평어 만들기.exe");
        std::fs::write(&exe2, b"old2").unwrap();
        let dl2 = base.join("x.pyeongeo-download");
        std::fs::write(&dl2, b"new2").unwrap();
        let t2 = portable_target(&exe2, "pyeongeo-1.2.0-portable.exe");
        assert_eq!(t2, exe2);
        swap_portable(&exe2, &dl2, &t2).unwrap();
        assert_eq!(std::fs::read(&exe2).unwrap(), b"new2");

        // 받은 파일이 없으면 되돌림
        let exe3 = base.join("c.exe");
        std::fs::write(&exe3, b"keep").unwrap();
        assert!(swap_portable(&exe3, &base.join("missing"), &exe3).is_err());
        assert_eq!(std::fs::read(&exe3).unwrap(), b"keep");

        // 남은 파일 치우기
        let temp = base.join("temp");
        std::fs::create_dir_all(temp.join(TEMP_DIR_NAME)).unwrap();
        std::fs::write(temp.join(TEMP_DIR_NAME).join("s.exe"), b"s").unwrap();
        cleanup_leftovers(&target, &temp);
        assert!(!old.exists());
        assert!(!old_path(&exe2).exists());
        assert!(target.exists() && exe2.exists() && exe3.exists());
        assert!(!temp.join(TEMP_DIR_NAME).exists());

        let _ = std::fs::remove_dir_all(&base);
    }
}
