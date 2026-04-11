#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::Manager;
use std::fs::File;
use std::io::Write;
use std::sync::Mutex;

// 全局状态存储通过命令行打开的文件路径
struct AppState {
    initial_file: Mutex<Option<String>>,
}

#[tauri::command]
async fn close_splashscreen(app: tauri::AppHandle) {
    if let Some(splash) = app.get_webview_window("splashscreen") {
        let _ = splash.close();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
    }
}

#[tauri::command]
async fn get_initial_file(state: tauri::State<'_, AppState>) -> Result<Option<String>, String> {
    let file = state.initial_file.lock().unwrap().take();
    Ok(file)
}

fn main() {
    // 收集命令行参数
    let mut args = std::env::args().skip(1).collect::<Vec<_>>();
    
    // 在macOS上，第一个参数可能是进程序列号，需要过滤
    #[cfg(target_os = "macos")]
    {
        args.retain(|arg| !arg.starts_with("-psn"));
    }
    
    // 提取文件路径（如果有的话）
    let initial_file = args.into_iter().next().filter(|arg| {
        // 检查是否是文件路径（不是以-开头的参数）
        !arg.starts_with('-') && (arg.ends_with(".md") || arg.ends_with(".markdown") || arg.ends_with(".txt"))
    });
    
    let app_state = AppState {
        initial_file: Mutex::new(initial_file),
    };

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![close_splashscreen, get_initial_file])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!());

    if let Err(e) = result {
        if let Ok(mut file) = File::create("markedit_crash.log") {
            let _ = writeln!(file, "Tauri startup error:\n{}", e);
        }
    }
}

