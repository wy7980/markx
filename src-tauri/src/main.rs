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

#[tauri::command]
async fn get_current_dir() -> Result<String, String> {
    match std::env::current_dir() {
        Ok(dir) => Ok(dir.to_string_lossy().to_string()),
        Err(e) => Err(format!("获取当前目录失败: {}", e)),
    }
}

fn main() {
    // 收集命令行参数
    let mut args = std::env::args().skip(1).collect::<Vec<_>>();
    
    // 在macOS上，第一个参数可能是进程序列号，需要过滤
    #[cfg(target_os = "macos")]
    {
        args.retain(|arg| !arg.starts_with("-psn"));
        
        // macOS可能传递file:// URL，需要转换为文件路径
        for arg in args.iter_mut() {
            if arg.starts_with("file://") {
                // 移除file://前缀并解码URL编码
                let path = arg.replace("file://", "");
                // 简单的URL解码（实际应该使用url解码库）
                let decoded = path.replace("%20", " ");
                *arg = decoded;
            }
        }
    }
    
    // 提取文件路径（如果有的话）
    let initial_file = args.into_iter().find(|arg| {
        // 检查是否是文件路径
        // 1. 不是以-开头的参数
        // 2. 可能是文件路径（包含/或\，或者有文件扩展名）
        !arg.starts_with('-') && (
            // 包含路径分隔符
            arg.contains('/') || arg.contains('\\') ||
            // 或者有支持的扩展名
            arg.ends_with(".md") || arg.ends_with(".markdown") || 
            arg.ends_with(".txt") || arg.ends_with(".MD") || 
            arg.ends_with(".TXT")
        )
    }).map(|path| {
        // 规范化路径
        #[cfg(target_os = "macos")]
        {
            // 在macOS上，确保路径是绝对路径
            if !path.starts_with('/') {
                // 如果是相对路径，转换为绝对路径
                if let Ok(current_dir) = std::env::current_dir() {
                    return current_dir.join(path).to_string_lossy().to_string();
                }
            }
        }
        path
    });
    
    // 调试日志
    if let Some(ref file) = initial_file {
        println!("📂 通过命令行打开文件: {}", file);
    } else {
        println!("ℹ️  没有通过命令行传入的文件");
        println!("🔍 命令行参数: {:?}", std::env::args().collect::<Vec<_>>());
    }
    
    let app_state = AppState {
        initial_file: Mutex::new(initial_file),
    };

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![close_splashscreen, get_initial_file, get_current_dir])
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

