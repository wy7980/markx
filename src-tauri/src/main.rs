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
    println!("🔍 参数数量: {}", all_args.len());
    
    // 收集命令行参数（跳过程序名）
    let args: Vec<String> = std::env::args().skip(1).collect();
    println!("📋 跳过程序名后的参数: {:?}", args);
    println!("📋 参数数量: {}", args.len());
    
    // 详细的参数分析
    for (i, arg) in args.iter().enumerate() {
        println!("  📝 参数[{}]:", i);
        println!("    值: {}", arg);
        println!("    长度: {}", arg.len());
        println!("    是否以-开头: {}", arg.starts_with('-'));
        println!("    是否以file://开头: {}", arg.starts_with("file://"));
        println!("    是否包含路径分隔符(/或\\): {}", arg.contains('/') || arg.contains('\\'));
        println!("    是否是我们支持的文件: {}", is_supported_file(arg));
    }
    
    // 处理参数，尝试找到文件路径
    let mut processed_args = args.clone();
    
    // 在macOS上，处理特定情况
    #[cfg(target_os = "macos")]
    {
        println!("🍎 检测到macOS系统");
        println!("🍎 原始参数数量: {}", processed_args.len());
        
        // 过滤掉进程序列号参数
        let before_filter = processed_args.len();
        processed_args.retain(|arg| !arg.starts_with("-psn"));
        let after_filter = processed_args.len();
        println!("🔧 过滤掉 -psn 参数: {} -> {}", before_filter, after_filter);
        
        // 处理 file:// URL
        for (i, arg) in processed_args.iter_mut().enumerate() {
            if arg.starts_with("file://") {
                println!("  💡 参数[{}] 是 file:// URL: {}", i, arg);
                // 移除 file:// 前缀
                let mut path = arg.replace("file://", "");
                
                // 简单的 URL 解码
                path = path.replace("%20", " ");
                path = path.replace("%2F", "/");
                path = path.replace("%5C", "\\");
                path = path.replace("%3A", ":");
                
                println!("  🔄 转换后路径: {}", path);
                *arg = path;
            }
        }
    }
    
    println!("🎯 开始提取文件路径...");
    println!("🎯 处理后的参数: {:?}", processed_args);
    println!("🎯 参数数量: {}", processed_args.len());
    
    // 尝试多种策略找到文件路径
    let initial_file = if !processed_args.is_empty() {
        // 策略1：直接查找支持的文件
        if let Some(file) = processed_args.iter().find(|arg| {
            let is_not_option = !arg.starts_with('-');
            let is_supported = is_supported_file(arg);
            is_not_option && is_supported
        }) {
            println!("✅ 策略1: 找到支持的文件: {}", file);
            Some(file.clone())
        }
        // 策略2：查找任何看起来像文件路径的参数
        else if let Some(file) = processed_args.iter().find(|arg| {
            // 不是选项参数，且包含路径分隔符或扩展名
            !arg.starts_with('-') && (arg.contains('/') || arg.contains('\\') || arg.contains('.'))
        }) {
            println!("✅ 策略2: 找到可能为文件的参数: {}", file);
            Some(file.clone())
        }
        // 策略3：第一个非选项参数
        else if let Some(file) = processed_args.iter().find(|arg| !arg.starts_with('-')) {
            println!("✅ 策略3: 使用第一个非选项参数: {}", file);
            Some(file.clone())
        } else {
            println!("❌ 所有策略都未找到文件路径");
    };
    
    // 对找到的文件路径进行规范化处理
    let initial_file = initial_file.map(|path| {
        let mut normalized_path = path.clone();
        
        // 在macOS上，确保路径是绝对路径
        #[cfg(target_os = "macos")]
        {
            if !normalized_path.starts_with('/') {
                // 如果是相对路径，转换为绝对路径
                if let Ok(current_dir) = std::env::current_dir() {
                    let absolute_path = current_dir.join(&normalized_path);
                    println!("  🔄 相对路径转绝对路径: {} -> {}", normalized_path, absolute_path.display());
                    normalized_path = absolute_path.to_string_lossy().to_string();
                }
            }
        }
        
        normalized_path
    });
    
    // 调试日志
    if let Some(ref file) = initial_file {
        println!("✅ 找到文件路径: {}", file);
        println!("📂 通过命令行打开文件: {}", file);
        println!("📊 文件路径长度: {}", file.len());
        println!("🔍 文件路径字符分析:");
        for (i, c) in file.chars().enumerate() {
            println!("  位置 {}: '{}' (U+{:04X})", i, c, c as u32);
        }
        
        // 检查文件是否存在
        if std::path::Path::new(file).exists() {
            println!("✅ 文件存在");
        } else {
            println!("⚠️  文件不存在或无法访问");
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
        
        // 特别检查macOS常见情况
        #[cfg(target_os = "macos")]
        {
            println!("🍎 macOS特定检查:");
            let has_psn = args.iter().any(|arg| arg.starts_with("-psn"));
            println!("  是否有-psn参数: {}", has_psn);
            
            let has_file_url = args.iter().any(|arg| arg.starts_with("file://"));
            println!("  是否有file:// URL: {}", has_file_url);
            
            // 检查可能的文件路径模式
            for arg in &args {
                if !arg.starts_with('-') {
                    println!("  非选项参数: {}", arg);
                    if arg.contains('/') || arg.contains('\\') {
                        println!("    包含路径分隔符，可能是文件路径");
                    }
                    if arg.contains('.') {
                        println!("    包含点，可能有扩展名");
                    }
                }
            }
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

