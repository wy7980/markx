// 改进的 macOS 文件打开实现
// 基于其他成功 Tauri 应用的研究

use std::env;
use std::sync::Mutex;

// 全局状态
struct AppState {
    initial_file: Mutex<Option<String>>,
}

#[tauri::command]
fn get_initial_file(state: tauri::State<AppState>) -> Option<String> {
    state.initial_file.lock().unwrap().take()
}

fn main() {
    // 详细的命令行参数分析
    let args: Vec<String> = env::args().collect();
    println!("🔍 命令行参数分析:");
    println!("  程序名: {}", args.get(0).unwrap_or(&"unknown".to_string()));
    println!("  参数数量: {}", args.len());
    
    for (i, arg) in args.iter().enumerate() {
        println!("  参数[{}]: {}", i, arg);
        println!("    长度: {}", arg.len());
        println!("    是否以 - 开头: {}", arg.starts_with('-'));
        println!("    是否以 file:// 开头: {}", arg.starts_with("file://"));
        println!("    是否包含路径分隔符: {}", arg.contains('/') || arg.contains('\\'));
    }
    
    // macOS 特定的参数处理
    #[cfg(target_os = "macos")]
    {
        println!("🍎 macOS 特定检查:");
        
        // 检查环境变量
        println!("  检查环境变量:");
        for (key, value) in env::vars() {
            if key.contains("FILE") || key.contains("PATH") || key.contains("URL") {
                println!("    {} = {}", key, value);
            }
        }
        
        // macOS 可能会通过其他方式传递文件
        // 检查常见的 macOS 文件传递方式
        
        // 1. 检查是否有 -psn 参数（进程序列号）
        let has_psn = args.iter().any(|arg| arg.starts_with("-psn"));
        println!("  是否有 -psn 参数: {}", has_psn);
        
        // 2. 检查是否有 file:// URL
        let file_urls: Vec<&String> = args.iter()
            .filter(|arg| arg.starts_with("file://"))
            .collect();
        println!("  file:// URL 数量: {}", file_urls.len());
        
        for url in file_urls {
            println!("    URL: {}", url);
            // 解码 URL
            let decoded = urlencoding::decode(url.replace("file://", "").as_str())
                .unwrap_or_default();
            println!("    解码后: {}", decoded);
        }
        
        // 3. 检查当前工作目录
        if let Ok(cwd) = env::current_dir() {
            println!("  当前工作目录: {}", cwd.display());
        }
    }
    
    // 提取文件路径的多种策略
    let mut initial_file: Option<String> = None;
    
    // 策略 1: 查找 file:// URL
    for arg in &args {
        if arg.starts_with("file://") {
            println!("✅ 找到 file:// URL: {}", arg);
            let path = arg.replace("file://", "");
            // 简单的 URL 解码
            let decoded = path.replace("%20", " ").replace("%2F", "/");
            initial_file = Some(decoded);
            break;
        }
    }
    
    // 策略 2: 查找看起来像文件路径的参数
    if initial_file.is_none() {
        for arg in &args {
            // 不是选项参数，且包含路径或扩展名
            if !arg.starts_with('-') && (arg.contains('/') || arg.contains('\\') || arg.contains('.')) {
                println!("✅ 找到可能为文件的参数: {}", arg);
                initial_file = Some(arg.clone());
                break;
            }
        }
    }
    
    // 策略 3: 在 macOS 上，检查是否有文件是通过其他方式传递的
    #[cfg(target_os = "macos")]
    {
        if initial_file.is_none() {
            println!("🔄 尝试其他 macOS 文件传递方式");
            
            // 检查是否有通过环境变量传递的文件
            if let Ok(file_from_env) = env::var("TAURI_OPEN_FILE") {
                println!("✅ 从环境变量找到文件: {}", file_from_env);
                initial_file = Some(file_from_env);
            }
            
            // 检查临时文件
            // macOS 有时会通过临时文件传递数据
            let temp_dirs = [
                env::temp_dir(),
                env::current_dir().unwrap_or_default(),
            ];
            
            for temp_dir in temp_dirs {
                if let Ok(entries) = std::fs::read_dir(temp_dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if let Some(filename) = path.file_name() {
                            let name = filename.to_string_lossy();
                            if name.contains("open") || name.contains("file") {
                                println!("📄 发现可能的临时文件: {}", path.display());
                            }
                        }
                    }
                }
            }
        }
    }
    
    // 策略 4: 检查第一个非选项参数
    if initial_file.is_none() {
        if let Some(file) = args.iter().find(|arg| !arg.starts_with('-')) {
            // 跳过程序名
            if args.get(0).map(|s| s.as_str()) != Some(file.as_str()) {
                println!("✅ 使用第一个非选项参数: {}", file);
                initial_file = Some(file.clone());
            }
        }
    }
    
    // 最终结果
    if let Some(ref file) = initial_file {
        println!("🎯 最终确定的文件路径: {}", file);
        
        // 验证文件是否存在
        if std::path::Path::new(file).exists() {
            println!("✅ 文件存在");
        } else {
            println!("⚠️  文件不存在，可能是相对路径");
            
            // 尝试转换为绝对路径
            if let Ok(cwd) = env::current_dir() {
                let absolute_path = cwd.join(file);
                if absolute_path.exists() {
                    println!("✅ 找到绝对路径: {}", absolute_path.display());
                    initial_file = Some(absolute_path.to_string_lossy().to_string());
                }
            }
        }
    } else {
        println!("❌ 未找到文件路径");
        println!("📊 所有参数: {:?}", args);
    }
    
    // 创建应用状态
    let app_state = AppState {
        initial_file: Mutex::new(initial_file),
    };
    
    // 启动 Tauri 应用
    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![get_initial_file])
        .run(tauri::generate_context!())
        .expect("启动应用失败");
}

// 辅助函数：检查是否是支持的文件类型
fn is_supported_file(path: &str) -> bool {
    let lower = path.to_lowercase();
    
    // 检查扩展名
    let supported_ext = [
        ".md", ".markdown", ".txt", ".js", ".ts", ".py",
        ".json", ".html", ".css", ".yaml", ".yml", ".toml",
        ".rs", ".go", ".java", ".cpp", ".c", ".h", ".sh",
        ".bash", ".zsh", ".ps1", ".bat", ".cmd", ".sql",
        ".csv", ".xml", ".svg", ".png", ".jpg", ".jpeg",
        ".gif", ".ico", ".icns"
    ];
    
    for ext in &supported_ext {
        if lower.ends_with(ext) {
            return true;
        }
    }
    
    // 检查特殊文件
    let special_files = ["Dockerfile", "Makefile", ".gitignore", ".env", "README"];
    for special in &special_files {
        if path.ends_with(special) || path.contains(special) {
            return true;
        }
    }
    
    false
}

// 辅助函数：解码 file:// URL
fn decode_file_url(url: &str) -> String {
    let mut result = url.replace("file://", "");
    
    // 简单的 URL 解码
    let replacements = [
        ("%20", " "),
        ("%2F", "/"),
        ("%5C", "\\"),
        ("%3A", ":"),
        ("%2B", "+"),
        ("%3F", "?"),
        ("%23", "#"),
        ("%25", "%"),
        ("%26", "&"),
        ("%3D", "="),
    ];
    
    for (encoded, decoded) in &replacements {
        result = result.replace(encoded, decoded);
    }
    
    result
}