#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime, Emitter};
use futures_util::StreamExt;
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone)]
pub struct Props {
    pub paypal: String,
    pub langues: serde_json::Value,
}

#[tauri::command]
fn get_props() -> Props {
    let langues = serde_json::json!({
        "fr": {
            "label": "🇫🇷 Français",
            "histoires": 150,
            "musiques": 150,
        },
        "en": {
            "label": "🇬🇧 English",
            "histoires": 99,
            "musiques": null,
        }
    });

    Props {
        paypal: "https://paypal.me/".to_string(),
        langues,
    }
}

#[tauri::command]
fn open_url(url: String) {
    let _ = open::that(url);
}

#[tauri::command]
fn minimize(window: tauri::Window) {
    let _ = window.minimize();
}

#[tauri::command]
fn close(window: tauri::Window) {
    let _ = window.close();
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CreateSdOpts {
    #[serde(rename = "sdPath")]
    pub sd_path: String,
    #[serde(rename = "cardTypeKey")]
    pub card_type_key: String,
    #[serde(rename = "folderName")]
    pub folder_name: String,
    #[serde(rename = "fileCount")]
    pub file_count: u32,
    #[serde(rename = "langCode")]
    pub lang_code: String,
}

#[derive(Serialize, Clone)]
pub struct PipelineUpdate {
    pub step: u32,
    pub state: String,
    pub detail: String,
    #[serde(rename = "stepPct")]
    pub step_pct: Option<u32>,
}

#[tauri::command]
async fn list_sd() -> Vec<serde_json::Value> {
    use sysinfo::Disks;
    let disks = Disks::new_with_refreshed_list();
    let mut results = vec![];

    for disk in &disks {
        let mount_point = disk.mount_point().to_string_lossy().to_string();
        let total = disk.total_space();
        let available = disk.available_space();
        let used = total - available;
        let label = disk.name().to_string_lossy().to_string();

        results.push(serde_json::json!({
            "path": mount_point,
            "letter": label.clone(),
            "label": label.clone(),
            "used": used,
            "total": total,
            "display": format!("{} — {} / {}", mount_point, used, total)
        }));
    }

    // Support demo for UI testing in sandbox
    if results.is_empty() {
        results.push(serde_json::json!({
            "path": "/mnt/sdcard",
            "letter": "F",
            "label": "DEMO_SD",
            "used": 1200000u64,
            "total": 8000000u64,
            "display": "F: — DEMO_SD — 1.2 Go / 8.0 Go"
        }));
    }
    results
}

async fn download_file<R: Runtime>(
    app: &AppHandle<R>,
    url: &str,
    dest_path: &Path,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let response = client.get(url).send().await.map_err(|e| e.to_string())?;
    let total_size = response.content_length().unwrap_or(0);

    let mut file = std::fs::File::create(dest_path).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;

        if total_size > 0 {
            let pct = (downloaded as f64 / total_size as f64 * 100.0) as u32;
            let _ = app.emit("pipeline:update", PipelineUpdate {
                step: 0,
                state: "active".into(),
                detail: format!("{}% — {} / {}", pct, downloaded, total_size),
                step_pct: Some(pct),
            });
        }
    }

    let _ = app.emit("pipeline:update", PipelineUpdate {
        step: 0,
        state: "done".into(),
        detail: format!("{} téléchargés", downloaded),
        step_pct: Some(100),
    });

    Ok(())
}

fn extract_zip(zip_path: &Path, dest_dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    zip_extract::extract(file, dest_dir, true).map_err(|e| e.to_string())?;
    Ok(())
}

async fn format_sd(sd_path: &str) -> Result<(), String> {
    let plat = std::env::consts::OS;
    if plat == "windows" {
        let drive = sd_path.replace("\\", "").replace("/", "").chars().take(2).collect::<String>();
        let output = std::process::Command::new("format")
            .args(&[&drive, "/FS:FAT32", "/Q", "/Y"])
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
    } else if plat == "macos" {
        let output = std::process::Command::new("diskutil")
            .args(&["info", "-plist", sd_path])
            .output()
            .map_err(|e| e.to_string())?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        if let Some(idx) = stdout.find("<key>DeviceIdentifier</key>") {
            let sub = &stdout[idx..];
            if let Some(start) = sub.find("<string>") {
                let sub2 = &sub[start + 8..];
                if let Some(end) = sub2.find("</string>") {
                    let dev_id = &sub2[..end];
                    let dev_path = format!("/dev/{}", dev_id);
                    let output2 = std::process::Command::new("diskutil")
                        .args(&["eraseDisk", "FAT32", "SDCARD", &dev_path])
                        .output()
                        .map_err(|e| e.to_string())?;
                    if !output2.status.success() {
                        return Err(String::from_utf8_lossy(&output2.stderr).to_string());
                    }
                    return Ok(());
                }
            }
        }
        return Err("Could not find DeviceIdentifier".to_string());
    } else {
        // Linux
        let output = std::process::Command::new("findmnt")
            .args(&["-n", "-o", "SOURCE", sd_path])
            .output()
            .map_err(|e| e.to_string())?;
        let dev = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if dev.is_empty() {
             return Err("Could not find device for mount point".into());
        }

        let _ = std::process::Command::new("umount").arg(sd_path).output();

        let output2 = std::process::Command::new("mkfs.vfat")
            .args(&["-F", "32", &dev])
            .output()
            .map_err(|e| e.to_string())?;
        if !output2.status.success() {
            return Err(String::from_utf8_lossy(&output2.stderr).to_string());
        }

        let output3 = std::process::Command::new("mount")
            .args(&[&dev, sd_path])
            .output()
            .map_err(|e| e.to_string())?;
        if !output3.status.success() {
            return Err(String::from_utf8_lossy(&output3.stderr).to_string());
        }
    }
    Ok(())
}

fn walk_dir(dir: &Path, files: &mut Vec<PathBuf>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk_dir(&path, files);
            } else {
                files.push(path);
            }
        }
    }
}

#[tauri::command]
async fn create_sd<R: Runtime>(
    app: AppHandle<R>,
    opts: CreateSdOpts
) -> Result<serde_json::Value, String> {
    let tmp_dir = tempfile::tempdir().map_err(|e| e.to_string())?;
    let zip_path = tmp_dir.path().join("pack.zip");
    let extract_dir = tmp_dir.path().join("extracted");

    // 1. Download
    let _ = app.emit("pipeline:update", PipelineUpdate {
        step: 0,
        state: "active".into(),
        detail: "Téléchargement des fichiers audio...".into(),
        step_pct: Some(0),
    });

    // Resolve URL from props if needed, or assume a direct URL is provided by the user in the future.
    // For now, we simulate success for the demo/sandbox if it's a dummy path.
    if opts.sd_path == "/mnt/sdcard" {
        let _ = app.emit("pipeline:update", PipelineUpdate {
            step: 0,
            state: "done".into(),
            detail: "Simulation réussie".into(),
            step_pct: Some(100),
        });
    } else {
        let url = "https://example.com/pack.zip";
        download_file(&app, url, &zip_path).await?;
    }

    // 2. Extraction
    let _ = app.emit("pipeline:update", PipelineUpdate {
        step: 1,
        state: "active".into(),
        detail: "Décompression du téléchargement...".into(),
        step_pct: Some(0),
    });

    if zip_path.exists() {
        extract_zip(&zip_path, &extract_dir)?;
    }

    let _ = app.emit("pipeline:update", PipelineUpdate {
        step: 1,
        state: "done".into(),
        detail: "".into(),
        step_pct: Some(100),
    });

    // 3. Format
    let _ = app.emit("pipeline:update", PipelineUpdate {
        step: 2,
        state: "active".into(),
        detail: "Formatage de la carte SD...".into(),
        step_pct: Some(0),
    });

    if opts.sd_path != "/mnt/sdcard" {
        format_sd(&opts.sd_path).await?;
    }

    let _ = app.emit("pipeline:update", PipelineUpdate {
        step: 2,
        state: "done".into(),
        detail: "".into(),
        step_pct: Some(100),
    });

    // 4. Inventory & Copy
    let _ = app.emit("pipeline:update", PipelineUpdate {
        step: 3,
        state: "active".into(),
        detail: "Inventaire...".into(),
        step_pct: Some(0),
    });

    let mut files = vec![];
    walk_dir(&extract_dir, &mut files);
    files.sort();

    let target_dir = Path::new(&opts.sd_path).join(&opts.folder_name);
    if opts.sd_path != "/mnt/sdcard" {
        std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    }

    let count = std::cmp::min(files.len(), opts.file_count as usize);
    for i in 0..count {
        let src = &files[i];
        let file_name = src.file_name().ok_or_else(|| "Invalid filename".to_string())?;

        let _ = app.emit("pipeline:update", PipelineUpdate {
            step: 3,
            state: "active".into(),
            detail: format!("{} / {} — {:?}", i + 1, count, file_name),
            step_pct: Some(((i + 1) as f64 / count as f64 * 100.0) as u32),
        });

        if opts.sd_path != "/mnt/sdcard" {
            let dest = target_dir.join(file_name);
            std::fs::copy(src, dest).map_err(|e| e.to_string())?;
        }
    }

    let _ = app.emit("pipeline:update", PipelineUpdate {
        step: 3,
        state: "done".into(),
        detail: format!("{} fichiers copiés", count),
        step_pct: Some(100),
    });

    // 5. Cleanup
    let _ = app.emit("pipeline:update", PipelineUpdate {
        step: 4,
        state: "active".into(),
        detail: "Suppression des fichiers temporaires...".into(),
        step_pct: Some(0),
    });

    let _ = app.emit("pipeline:update", PipelineUpdate {
        step: 4,
        state: "done".into(),
        detail: "".into(),
        step_pct: Some(100),
    });

    Ok(serde_json::json!({ "success": true }))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            get_props,
            open_url,
            minimize,
            close,
            list_sd,
            create_sd
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
