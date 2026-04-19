#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::{Manager, Emitter};
use std::sync::Mutex;

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
    is_supported_file(path) || path.contains('/') || path.contains('\\') || path.contains('.')
}

fn extract_file_from_args(args: &[String]) -> Option<String> {
    for arg in args {
        if arg.starts_with('-') {
            continue;
        }

        let file_path = normalize_file_arg(arg);
        if looks_like_file_path(&file_path) {
            return Some(file_path);
        }
    }

    None
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
        Err(e) => Err(format!("获取当前目录失败：{}", e)),
    }
}

fn main() {
    // 收集命令行参数
    let args: Vec<String> = std::env::args().collect();

    // 提取文件路径
    let initial_file = extract_file_from_args(&args[1..]);

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

            // 提取文件路径
            if let Some(file_path) = extract_file_from_args(&argv[1..]) {
                // 发送事件到前端，通知打开文件
                let _ = app_handle.emit("second-instance", file_path.as_str());
                println!("📩 发送 second-instance 事件：{}", file_path);

                // 确保主窗口存在并获得焦点
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.set_focus();
                    let _ = window.set_always_on_top(true);
                    let _ = window.set_always_on_top(false);
                }
            }
        }))
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            close_splashscreen,
            get_initial_file,
            get_current_dir,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app_handle, _event| {});
}
