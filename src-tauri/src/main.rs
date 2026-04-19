#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::Manager;
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
    let initial_file = if args.len() > 1 {
        let mut found_file: Option<String> = None;

        // 跳过第一个参数（程序名）
        for arg in &args[1..] {
            // 跳过选项参数
            if arg.starts_with('-') {
                continue;
            }

            // 处理 file:// URL
            let mut file_path = arg.clone();
            if arg.starts_with("file://") {
                file_path = arg.replace("file://", "")
                    .replace("%20", " ")
                    .replace("%2F", "/")
                    .replace("%5C", "\\");
            }

            // 检查是否是我们支持的文件
            if is_supported_file(&file_path) {
                found_file = Some(file_path);
                break;
            } else if file_path.contains('/') || file_path.contains('\\') || file_path.contains('.') {
                found_file = Some(file_path);
                break;
            }
        }

        found_file
    } else {
        None
    };

    // 创建应用状态
    let app_state = AppState {
        initial_file: Mutex::new(initial_file),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
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
