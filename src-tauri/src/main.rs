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

// 检查文件是否是我们支持的文件类型
fn is_supported_file(path: &str) -> bool {
    // 获取文件扩展名（小写）
    let lowercase_path = path.to_lowercase();
    
    // 检查常见扩展名
    let supported_extensions = [
        // 纯文本文件
        ".md", ".markdown", ".txt", ".text", ".log",
        // 代码文件
        ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts",
        ".py", ".pyw", ".pyi", ".java", ".c", ".cpp", ".cc", ".cxx", ".h", ".hpp",
        ".go", ".rs", ".rb", ".php", ".cs", ".scala", ".kt", ".swift",
        // Web文件
        ".html", ".htm", ".css", ".scss", ".sass", ".less", ".json", ".xml", ".xsd", ".xsl",
        // 配置文件
        ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".properties",
        // 脚本文件
        ".sh", ".bash", ".zsh", ".ps1", ".bat", ".cmd",
        // 数据文件
        ".csv", ".tsv", ".sql",
        // 环境文件
        ".env",
        // Git文件
        ".gitignore",
    ];
    
    // 检查扩展名
    for ext in supported_extensions.iter() {
        if lowercase_path.ends_with(ext) {
            return true;
        }
    }
    
    // 检查特殊文件（无扩展名）
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
        Err(e) => Err(format!("获取当前目录失败: {}", e)),
    }
}

fn main() {
    // 收集所有命令行参数（包括程序名）
    let all_args: Vec<String> = std::env::args().collect();
    println!("🔍 所有命令行参数: {:?}", all_args);
    
    // 收集命令行参数（跳过程序名）
    let mut args = std::env::args().skip(1).collect::<Vec<_>>();
    println!("📋 跳过程序名后的参数: {:?}", args);
    
    // 在macOS上，第一个参数可能是进程序列号，需要过滤
    #[cfg(target_os = "macos")]
    {
        println!("🍎 检测到macOS系统");
        let before_filter = args.len();
        args.retain(|arg| !arg.starts_with("-psn"));
        let after_filter = args.len();
        println!("🔧 过滤掉 -psn 参数: {} -> {}", before_filter, after_filter);
        
        // macOS可能传递file:// URL，需要转换为文件路径
        for (i, arg) in args.iter_mut().enumerate() {
            println!("  参数 {}: {}", i, arg);
            
            if arg.starts_with("file://") {
                println!("  💡 检测到 file:// URL: {}", arg);
                // 移除file://前缀并解码URL编码
                let path = arg.replace("file://", "");
                // 简单的URL解码（实际应该使用url解码库）
                let decoded = path.replace("%20", " ");
                println!("  🔄 转换后: {}", decoded);
                *arg = decoded;
            }
        }
    }
    
    println!("🎯 开始提取文件路径...");
    // 提取文件路径（如果有的话）
    let initial_file = args.into_iter().find(|arg| {
        println!("  🔍 检查参数: {}", arg);
        
        // 检查是否是文件路径
        // 1. 不是以-开头的参数
        let is_not_option = !arg.starts_with('-');
        println!("    不是选项参数: {}", is_not_option);
        
        // 2. 检查是否是我们支持的文件类型
        let is_supported = is_supported_file(arg);
        println!("    支持的文件类型: {}", is_supported);
        
        is_not_option && is_supported
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
        println!("✅ 找到文件路径: {}", file);
        println!("📂 通过命令行打开文件: {}", file);
        println!("📊 文件路径长度: {}", file.len());
        println!("🔍 文件路径字符:");
        for (i, c) in file.chars().enumerate() {
            println!("  位置 {}: '{}' (U+{:04X})", i, c, c as u32);
        }
    } else {
        println!("ℹ️  没有找到支持的文件路径");
        println!("🔍 详细分析:");
        println!("  参数数量: {}", all_args.len());
        println!("  程序名: {}", all_args.get(0).unwrap_or(&"未知".to_string()));
        
        for (i, arg) in all_args.iter().enumerate() {
            println!("  参数 {}: {}", i, arg);
            println!("    长度: {}", arg.len());
            println!("    是否以-开头: {}", arg.starts_with('-'));
            println!("    是否支持: {}", is_supported_file(arg));
        }
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

