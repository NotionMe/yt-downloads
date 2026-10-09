use regex::Regex;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

// ── State ───────────────────────────────────────────────────────────────────

#[derive(Default)]
pub struct AppState {
    pub current_child: Arc<Mutex<Option<u32>>>,
}

// ── Data types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoInfo {
    pub id: String,
    pub title: String,
    pub thumbnail: String,
    pub duration: f64,
    pub duration_string: String,
    pub video_formats: Vec<VideoQuality>,
    pub audio_tracks: Vec<AudioTrack>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoQuality {
    pub format_id: String,
    pub ext: String,
    pub height: Option<u32>,
    pub width: Option<u32>,
    pub fps: Option<f64>,
    pub vcodec: String,
    pub filesize: Option<u64>,
    pub filesize_approx: Option<u64>,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioTrack {
    pub format_id: String,
    pub ext: String,
    pub acodec: String,
    pub abr: Option<f64>,
    pub asr: Option<u32>,
    pub language: Option<String>,
    pub language_preference: Option<i32>,
    pub label: String,
    pub audio_channels: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressPayload {
    pub percent: f64,
    pub speed: String,
    pub eta: String,
    pub downloaded: String,
    pub total: String,
    pub status: String, // "downloading" | "merging" | "converting" | "done" | "error" | "cancelled"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyStatus {
    pub yt_dlp: bool,
    pub yt_dlp_version: String,
    pub ffmpeg: bool,
    pub ffmpeg_version: String,
}

// CREATE_NO_WINDOW — prevents a console window from flashing on Windows
// when spawning yt-dlp, ffmpeg, explorer, etc.
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn no_window_cmd(program: &str) -> Command {
    #[cfg_attr(not(target_os = "windows"), allow(unused_mut))]
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

fn output_dir_or_default(output_dir: String) -> String {
    if output_dir.trim().is_empty() {
        #[cfg(target_os = "windows")]
        {
            std::env::var("USERPROFILE")
                .map(|p| format!("{}\\Downloads", p))
                .unwrap_or_default()
        }
        #[cfg(not(target_os = "windows"))]
        {
            std::env::var("HOME")
                .map(|p| format!("{}/Downloads", p))
                .unwrap_or_default()
        }
    } else {
        output_dir
    }
}

fn check_binary(name: &str, version_flag: &str) -> (bool, String) {
    match no_window_cmd(name).arg(version_flag).output() {
        Ok(output) => {
            let version = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            let version = if version.is_empty() {
                String::from_utf8_lossy(&output.stderr)
                    .lines()
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_string()
            } else {
                version
            };
            (output.status.success(), version)
        }
        Err(_) => (false, String::new()),
    }
}

// ── Tauri commands ──────────────────────────────────────────────────────────

#[tauri::command]
async fn check_dependencies() -> Result<DependencyStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (yt_dlp, yt_dlp_version) = check_binary("yt-dlp", "--version");
        let (ffmpeg, ffmpeg_version) = check_binary("ffmpeg", "-version");

        Ok(DependencyStatus {
            yt_dlp,
            yt_dlp_version,
            ffmpeg,
            ffmpeg_version,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn get_default_download_dir(app: AppHandle) -> String {
    if let Ok(dir) = app.path().download_dir() {
        if dir.exists() {
            return dir.to_string_lossy().to_string();
        }
    }
    output_dir_or_default(String::new())
}

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    let p = output_dir_or_default(path);

    #[cfg(target_os = "windows")]
    {
        no_window_cmd("explorer")
            .arg(&p)
            .spawn()
            .map_err(|e| format!("Не вдалося відкрити папку: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&p)
            .spawn()
            .map_err(|e| format!("Не вдалося відкрити папку: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&p)
            .spawn()
            .map_err(|e| format!("Не вдалося відкрити папку: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn cancel_download(state: State<'_, AppState>) -> Result<(), String> {
    if let Ok(mut lock) = state.current_child.lock() {
        if let Some(pid) = lock.take() {
            #[cfg(target_os = "windows")]
            {
                let _ = no_window_cmd("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .output();
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = Command::new("kill")
                    .args(["-9", &pid.to_string()])
                    .output();
            }
        }
    }
    Ok(())
}

#[tauri::command]
async fn get_video_info(url: String, browser: String) -> Result<VideoInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let clean_url = url.trim();
        if clean_url.is_empty() {
            return Err("Вкажіть посилання на відео".to_string());
        }

        let mut cmd = no_window_cmd("yt-dlp");
        cmd.args([
            "--dump-json",
            "--no-warnings",
            "--no-playlist",
            "--skip-download",
        ]);

        if !browser.trim().is_empty() {
            cmd.args(["--cookies-from-browser", browser.trim()]);
        }

        cmd.arg(clean_url);

        let output = cmd
            .output()
            .map_err(|e| format!("Не вдалося виконати yt-dlp: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Помилка yt-dlp: {}", stderr.trim()));
        }

        let raw: serde_json::Value =
            serde_json::from_slice(&output.stdout).map_err(|e| format!("Помилка обробки JSON: {}", e))?;

        let id = raw["id"].as_str().unwrap_or("").to_string();
        let title = raw["title"].as_str().unwrap_or("Невідома назва").to_string();
        let thumbnail = raw["thumbnail"].as_str().unwrap_or("").to_string();
        let duration = raw["duration"].as_f64().unwrap_or(0.0);
        let duration_string = raw["duration_string"]
            .as_str()
            .unwrap_or("0:00")
            .to_string();

        let formats = raw["formats"]
            .as_array()
            .cloned()
            .unwrap_or_default();

        let mut video_formats: Vec<VideoQuality> = Vec::new();
        let mut audio_tracks: Vec<AudioTrack> = Vec::new();
        let mut seen_heights: std::collections::HashSet<u32> = std::collections::HashSet::new();
        let mut seen_audio: std::collections::HashSet<String> = std::collections::HashSet::new();

        for f in &formats {
            let vcodec = f["vcodec"].as_str().unwrap_or("none").to_string();
            let acodec = f["acodec"].as_str().unwrap_or("none").to_string();
            let format_id = f["format_id"].as_str().unwrap_or("").to_string();

            // Video formats
            if vcodec != "none" && !vcodec.is_empty() {
                let height = f["height"].as_u64().map(|h| h as u32);
                if let Some(h) = height {
                    if seen_heights.contains(&h) {
                        continue;
                    }
                    seen_heights.insert(h);
                }

                let width = f["width"].as_u64().map(|w| w as u32);
                let fps = f["fps"].as_f64();
                let ext = f["ext"].as_str().unwrap_or("mp4").to_string();
                let filesize = f["filesize"].as_u64();
                let filesize_approx = f["filesize_approx"].as_u64();

                let fps_str = fps
                    .map(|f| if f > 30.0 { format!(" {:.0}fps", f) } else { String::new() })
                    .unwrap_or_default();

                let label = format!(
                    "{}p{}{}",
                    height.unwrap_or(0),
                    fps_str,
                    if ext != "mp4" {
                        format!(" ({})", ext)
                    } else {
                        String::new()
                    }
                );

                video_formats.push(VideoQuality {
                    format_id,
                    ext,
                    height,
                    width,
                    fps,
                    vcodec,
                    filesize,
                    filesize_approx,
                    label,
                });
            }
            // Audio-only tracks
            else if acodec != "none" && !acodec.is_empty() && (vcodec == "none" || vcodec.is_empty()) {
                let language = f["language"].as_str().map(|s| s.to_string());
                let language_preference = f["language_preference"].as_i64().map(|v| v as i32);
                let abr = f["abr"].as_f64();
                let asr = f["asr"].as_u64().map(|v| v as u32);
                let ext = f["ext"].as_str().unwrap_or("m4a").to_string();
                let audio_channels = f["audio_channels"].as_u64().map(|v| v as u32);

                let dedup_key = format!(
                    "{}-{}",
                    language.as_deref().unwrap_or("und"),
                    acodec
                );
                if seen_audio.contains(&dedup_key) {
                    continue;
                }
                seen_audio.insert(dedup_key);

                let format_note = f["format_note"].as_str().unwrap_or("");
                let lang_display = match &language {
                    Some(l) if !l.is_empty() && l != "und" => l.clone(),
                    _ => "Стандартна".to_string(),
                };

                let is_original = language_preference.unwrap_or(0) > 0
                    || format_note.to_lowercase().contains("original");
                let dubbed_tag = if is_original { " (оригінал)" } else { "" };

                let label = format!(
                    "{}{} — {} @ {:.0}kbps",
                    lang_display,
                    dubbed_tag,
                    acodec,
                    abr.unwrap_or(0.0)
                );

                audio_tracks.push(AudioTrack {
                    format_id,
                    ext,
                    acodec,
                    abr,
                    asr,
                    language,
                    language_preference,
                    label,
                    audio_channels,
                });
            }
        }

        // Sort video by height descending
        video_formats.sort_by(|a, b| b.height.cmp(&a.height));

        // Sort audio: original first, then by bitrate descending
        audio_tracks.sort_by(|a, b| {
            let pref_cmp = b
                .language_preference
                .unwrap_or(-1)
                .cmp(&a.language_preference.unwrap_or(-1));
            if pref_cmp != std::cmp::Ordering::Equal {
                return pref_cmp;
            }
            b.abr
                .unwrap_or(0.0)
                .partial_cmp(&a.abr.unwrap_or(0.0))
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        Ok(VideoInfo {
            id,
            title,
            thumbnail,
            duration,
            duration_string,
            video_formats,
            audio_tracks,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn sanitize_filename(name: &str) -> String {
    let forbidden_chars = ['/', '\\', '<', '>', ':', '"', '|', '?', '*'];
    let sanitized: String = name
        .chars()
        .map(|c| if forbidden_chars.contains(&c) || c.is_control() { '_' } else { c })
        .collect();

    let cleaned = sanitized.trim().trim_matches('.').to_string();
    if cleaned.is_empty() {
        "video".to_string()
    } else if cleaned.chars().count() > 120 {
        cleaned.chars().take(120).collect()
    } else {
        cleaned
    }
}

fn get_unique_filename(dir: &std::path::Path, base_name: &str, ext: &str) -> String {
    let clean_ext = ext.trim_start_matches('.').to_lowercase();
    let initial_file = format!("{}.{}", base_name, clean_ext);
    if !dir.join(&initial_file).exists() {
        return base_name.to_string();
    }

    let mut counter = 1;
    loop {
        let candidate_base = format!("{} ({})", base_name, counter);
        let candidate_file = format!("{}.{}", candidate_base, clean_ext);
        if !dir.join(&candidate_file).exists() {
            return candidate_base;
        }
        counter += 1;
        if counter > 9999 {
            return candidate_base;
        }
    }
}

#[tauri::command]
fn check_file_exists(output_dir: String, title: String, ext: String) -> bool {
    let target_dir = output_dir_or_default(output_dir);
    let clean_title = sanitize_filename(&title);
    let clean_ext = ext.trim_start_matches('.').to_lowercase();
    std::path::Path::new(&target_dir)
        .join(format!("{}.{}", clean_title, clean_ext))
        .exists()
}

#[tauri::command]
fn get_target_filename(output_dir: String, title: String, ext: String, overwrite: bool) -> String {
    let target_dir = output_dir_or_default(output_dir);
    let clean_title = sanitize_filename(&title);
    let clean_ext = ext.trim_start_matches('.').to_lowercase();
    let dir = std::path::Path::new(&target_dir);

    if overwrite {
        format!("{}.{}", clean_title, clean_ext)
    } else {
        let unique_base = get_unique_filename(dir, &clean_title, &clean_ext);
        format!("{}.{}", unique_base, clean_ext)
    }
}

#[tauri::command]
async fn download_video(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
    title: String,
    video_format_id: String,
    audio_format_id: String,
    output_dir: String,
    all_audio: bool,
    browser: String,
    download_type: String, // "video" | "audio"
    file_format: String,   // "mp4" | "mkv" | "webm" | "mp3" | "m4a" | "wav" | "flac" | "opus"
    overwrite: bool,
) -> Result<String, String> {
    let target_dir = output_dir_or_default(output_dir);
    let dir = std::path::Path::new(&target_dir);

    let clean_ext = if file_format.trim().is_empty() {
        if download_type == "audio" {
            "mp3".to_string()
        } else {
            "mp4".to_string()
        }
    } else {
        file_format.trim().trim_start_matches('.').to_lowercase()
    };

    let base_name = if !title.trim().is_empty() {
        sanitize_filename(&title)
    } else {
        "%(title)s".to_string()
    };

    let chosen_base = if base_name == "%(title)s" || overwrite {
        base_name
    } else {
        get_unique_filename(dir, &base_name, &clean_ext)
    };

    let output_template = format!("{}/{}.%(ext)s", target_dir, chosen_base);

    let mut args: Vec<String> = vec![
        "--no-playlist".to_string(),
        "--newline".to_string(),
        "--progress".to_string(),
        "-o".to_string(),
        output_template,
    ];

    if overwrite {
        args.push("--force-overwrites".to_string());
    }

    if download_type == "audio" {
        args.push("-x".to_string());
        let fmt = if file_format.trim().is_empty() {
            "mp3".to_string()
        } else {
            file_format.to_lowercase()
        };
        args.push("--audio-format".to_string());
        args.push(fmt);
        args.push("--audio-quality".to_string());
        args.push("0".to_string());

        if !audio_format_id.is_empty() && audio_format_id != "best" {
            args.push("-f".to_string());
            args.push(audio_format_id);
        } else {
            args.push("-f".to_string());
            args.push("bestaudio/best".to_string());
        }
    } else {
        // Video mode
        let fmt = if file_format.trim().is_empty() {
            "mp4".to_string()
        } else {
            file_format.to_lowercase()
        };
        args.push("--merge-output-format".to_string());
        args.push(fmt);

        if all_audio {
            let selector = if !video_format_id.is_empty() {
                format!("{}+bestaudio/best", video_format_id)
            } else {
                "bestvideo+bestaudio/best".to_string()
            };
            args.push("-f".to_string());
            args.push(selector);
            args.push("--audio-multistreams".to_string());
        } else {
            let selector = if !video_format_id.is_empty() && !audio_format_id.is_empty() {
                format!("{}+{}", video_format_id, audio_format_id)
            } else if !video_format_id.is_empty() {
                format!("{}+bestaudio/best", video_format_id)
            } else {
                "bestvideo+bestaudio/best".to_string()
            };
            args.push("-f".to_string());
            args.push(selector);
        }
    }

    if !browser.trim().is_empty() {
        args.push("--cookies-from-browser".to_string());
        args.push(browser.trim().to_string());
    }

    args.push(url);

    let mut child = no_window_cmd("yt-dlp")
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Не вдалося запустити yt-dlp: {}", e))?;

    let pid = child.id();
    if let Ok(mut lock) = state.current_child.lock() {
        *lock = Some(pid);
    }

    let stdout = child
        .stdout
        .take()
        .ok_or("Failed to capture yt-dlp stdout")?;
    let reader = BufReader::new(stdout);

    let progress_re =
        Regex::new(r"\[download\]\s+([\d.]+)%(?:\s+of\s+~?([^\s]+))?(?:\s+at\s+([^\s]+))?(?:\s+ETA\s+([^\s]+))?")
            .unwrap();
    let merge_re = Regex::new(r"\[(Merger|ffmpeg)\]").unwrap();
    let audio_re = Regex::new(r"\[(ExtractAudio)\]").unwrap();

    let app_clone = app.clone();

    std::thread::spawn(move || {
        for line in reader.lines() {
            if let Ok(line) = line {
                if let Some(caps) = progress_re.captures(&line) {
                    let percent: f64 = caps[1].parse().unwrap_or(0.0);
                    let total = caps.get(2).map(|m| m.as_str()).unwrap_or("").to_string();
                    let speed = caps.get(3).map(|m| m.as_str()).unwrap_or("").to_string();
                    let eta = caps.get(4).map(|m| m.as_str()).unwrap_or("").to_string();

                    let _ = app_clone.emit(
                        "download-progress",
                        ProgressPayload {
                            percent,
                            speed,
                            eta,
                            downloaded: format!("{:.1}%", percent),
                            total,
                            status: "downloading".to_string(),
                        },
                    );
                } else if audio_re.is_match(&line) {
                    let _ = app_clone.emit(
                        "download-progress",
                        ProgressPayload {
                            percent: 100.0,
                            speed: String::new(),
                            eta: String::new(),
                            downloaded: String::new(),
                            total: String::new(),
                            status: "converting".to_string(),
                        },
                    );
                } else if merge_re.is_match(&line) {
                    let _ = app_clone.emit(
                        "download-progress",
                        ProgressPayload {
                            percent: 100.0,
                            speed: String::new(),
                            eta: String::new(),
                            downloaded: String::new(),
                            total: String::new(),
                            status: "merging".to_string(),
                        },
                    );
                }
            }
        }
    });

    let status = child
        .wait()
        .map_err(|e| format!("Помилка виконання yt-dlp: {}", e))?;

    let was_cancelled = {
        if let Ok(mut lock) = state.current_child.lock() {
            let had_pid = lock.as_ref() == Some(&pid);
            if had_pid {
                *lock = None;
                false
            } else {
                // If None, it was taken by cancel_download
                true
            }
        } else {
            false
        }
    };

    if was_cancelled {
        let _ = app.emit(
            "download-progress",
            ProgressPayload {
                percent: 0.0,
                speed: String::new(),
                eta: String::new(),
                downloaded: String::new(),
                total: String::new(),
                status: "cancelled".to_string(),
            },
        );
        return Err("Завантаження скасовано користувачем".to_string());
    }

    if status.success() {
        let _ = app.emit(
            "download-progress",
            ProgressPayload {
                percent: 100.0,
                speed: String::new(),
                eta: String::new(),
                downloaded: String::new(),
                total: String::new(),
                status: "done".to_string(),
            },
        );
        Ok("Завантаження успішно завершено".to_string())
    } else {
        let _ = app.emit(
            "download-progress",
            ProgressPayload {
                percent: 0.0,
                speed: String::new(),
                eta: String::new(),
                downloaded: String::new(),
                total: String::new(),
                status: "error".to_string(),
            },
        );
        Err("yt-dlp завершився з помилкою".to_string())
    }
}

// ── Tauri entry point ───────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Disable GPU compositing in WebKitGTK to avoid GBM buffer errors
    // on Wayland/XWayland setups (black screen fix)
    std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");

    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            check_dependencies,
            get_video_info,
            download_video,
            get_default_download_dir,
            open_folder,
            cancel_download,
            check_file_exists,
            get_target_filename,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
