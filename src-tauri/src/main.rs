#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::{Manager, Emitter};
use std::path::Path;
use std::sync::Mutex;

mod commands;

// 全局状态存储通过命令行打开的文件路径
struct AppState {
    initial_file: Mutex<Option<String>>,
}

// 检查文件是否是我们支持的文件类型
fn is_supported_file(path: &str) -> bool {
    let lowercase_path = path.to_lowercase();

    let supported_extensions = [
        ".md", ".markdown", ".txt", ".text", ".log",
        ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts",
        ".py", ".pyw", ".pyi", ".java", ".c", ".cpp", ".cc", ".cxx", ".h", ".hpp",
        ".go", ".rs", ".rb", ".php", ".cs", ".scala", ".kt", ".swift",
        ".html", ".htm", ".css", ".scss", ".sass", ".less", ".json", ".xml", ".xsd", ".xsl",
        ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".properties",
        ".sh", ".bash", ".zsh", ".ps1", ".bat", ".cmd",
        ".csv", ".tsv", ".sql",
        ".env",
        ".gitignore",
    ];

    for ext in supported_extensions.iter() {
        if lowercase_path.ends_with(ext) {
            return true;
        }
    }

    let special_files = ["Dockerfile", "Makefile", ".env"];
    for special in special_files.iter() {
        if path.ends_with(special) {
            return true;
        }
    }

    false
}

fn normalize_file_arg(arg: &str) -> String {
    if arg.starts_with("file://") {
        let mut file_path = arg.replace("file://", "");

        if let Some(stripped) = file_path.strip_prefix("localhost/") {
            file_path = format!("/{}", stripped);
        }

        return file_path
            .replace("%20", " ")
            .replace("%2F", "/")
            .replace("%2f", "/")
            .replace("%5C", "\\")
            .replace("%5c", "\\");
    }

    arg.to_string()
}

fn looks_like_file_path(path: &str) -> bool {
    is_supported_file(path) || Path::new(path).is_file()
}

fn is_current_executable(path: &str) -> bool {
    let current_exe = match std::env::current_exe() {
        Ok(path) => path,
        Err(_) => return false,
    };

    match (Path::new(path).canonicalize(), current_exe.canonicalize()) {
        (Ok(candidate), Ok(current)) => candidate == current,
        _ => false,
    }
}

fn extract_file_from_args(args: &[String]) -> Option<String> {
    for arg in args {
        if arg.starts_with('-') {
            continue;
        }

        let file_path = normalize_file_arg(arg);

        if is_current_executable(&file_path) {
            continue;
        }

        if looks_like_file_path(&file_path) {
            return Some(file_path);
        }
    }

    None
}

fn emit_open_file(app_handle: &tauri::AppHandle, file_path: &str, source: &str) {
    println!("📩 [{}] 打开文件事件：{}", source, file_path);

    if let Some(state) = app_handle.try_state::<AppState>() {
        let mut initial_file = state.initial_file.lock().unwrap();
        *initial_file = Some(file_path.to_string());
    }

    let _ = app_handle.emit("second-instance", file_path);

    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.set_focus();
        let _ = window.set_always_on_top(true);
        let _ = window.set_always_on_top(false);
    }
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
    println!("📥 get_initial_file 返回：{:?}", file);
    Ok(file)
}

#[tauri::command]
async fn get_current_dir() -> Result<String, String> {
    match std::env::current_dir() {
        Ok(dir) => Ok(dir.to_string_lossy().to_string()),
        Err(e) => Err(format!("获取当前目录失败：{}", e)),
    }
}

fn main() {
    // 收集命令行参数
    let args: Vec<String> = std::env::args().collect();
    println!("🚀 启动参数：{:?}", args);

    // 提取文件路径
    let initial_file = extract_file_from_args(&args[1..]);
    println!("📥 启动阶段提取到文件：{:?}", initial_file);

    // 创建应用状态
    let app_state = AppState {
        initial_file: Mutex::new(initial_file),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app_handle, argv, _cwd| {
            // 当另一个实例启动时（应用已运行），将文件路径发送到现有实例
            println!("📩 检测到新实例启动，参数：{:?}", argv);

            // 提取文件路径（single-instance argv 在不同平台/调用方式下不一定包含程序名）
            let file_path = extract_file_from_args(&argv)
                .or_else(|| if argv.len() > 1 { extract_file_from_args(&argv[1..]) } else { None });

            if let Some(file_path) = file_path {
                emit_open_file(app_handle, &file_path, "single-instance");
            }
        }))
        .setup(|app| {
            // Windows 使用前端自绘标题栏；macOS 继续保留原生交通灯。
            #[cfg(target_os = "windows")]
            if let Some(window) = app.get_webview_window("main") {
                if let Err(error) = window.set_decorations(false) {
                    eprintln!("设置无边框窗口失败：{}", error);
                }

                // 高 DPI 下 1200x800 可能超出可用工作区，压缩到任务栏之上。
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let scale = monitor.scale_factor();
                    let work = monitor.work_area();
                    let max_width = (work.size.width as f64 / scale - 40.0).max(800.0);
                    let max_height = (work.size.height as f64 / scale - 40.0).max(560.0);
                    if let Ok(size) = window.inner_size() {
                        let logical = size.to_logical::<f64>(scale);
                        if logical.width > max_width || logical.height > max_height {
                            let _ = window.set_size(tauri::LogicalSize::new(
                                logical.width.min(max_width),
                                logical.height.min(max_height),
                            ));
                        }
                    }
                }
            }
            Ok(())
        })
        .manage(app_state)
        .manage(commands::large_file::EngineState::new())
        .invoke_handler(tauri::generate_handler![
            close_splashscreen,
            get_initial_file,
            get_current_dir,
            commands::large_file::large_file_probe,
            commands::large_file::large_file_open,
            commands::large_file::large_file_close,
            commands::large_file::large_file_poll,
            commands::large_file::large_file_jump_to_offset,
            commands::large_file::large_file_watch,
            commands::large_file::large_file_unwatch,
            commands::large_file::large_file_viewport,
            commands::large_file::large_file_tail,
            commands::large_file::large_file_index_status,
            commands::large_file::large_file_info,
            commands::large_file::large_file_search,
            commands::large_file::large_file_search_stream,
            commands::large_file::large_file_search_page,
            commands::large_file::large_file_search_cancel,
            commands::large_file::large_file_search_release,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app_handle, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                println!("🍎 RunEvent::Opened 收到 URLs: {:?}", urls);

                for url in urls {
                    if let Ok(path_buf) = url.to_file_path() {
                        if let Some(path) = path_buf.to_str() {
                            if looks_like_file_path(path) {
                                emit_open_file(_app_handle, path, "run-event-opened");
                                return;
                            }
                        }
                    }

                    let path = normalize_file_arg(url.as_str());
                    if looks_like_file_path(&path) {
                        emit_open_file(_app_handle, &path, "run-event-opened-fallback");
                        return;
                    }
                }
            }
        });
}
