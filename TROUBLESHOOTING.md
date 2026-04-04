# macOS 按钮无响应问题排查

## 🔍 问题现象

应用打开后，窗口内所有按钮点击无响应：
- ❌ 新建文档按钮
- ❌ 打开文件按钮
- ❌ 保存按钮
- ❌ 主题切换按钮
- ❌ 编辑模式下拉菜单

---

## 🎯 可能原因

### 1. JavaScript 执行错误（最可能）

**原因**：代码中有未捕获的错误，导致事件监听器未绑定。

**诊断**：
```bash
# 在 macOS 上右键应用 → 显示包内容
# 然后打开控制台查看错误
```

**检查点**：
- `DOMContentLoaded` 事件是否正确触发
- `setupEventListeners()` 是否执行
- 是否有 JavaScript 错误

---

### 2. Tauri 沙盒限制

**原因**：macOS 沙盒限制了某些功能。

**检查**：`src-tauri/tauri.conf.json`

```json
{
  "tauri": {
    "allowlist": {
      "all": false,
      // 确保需要的权限已启用
    }
  }
}
```

---

### 3. CSP（内容安全策略）问题

**原因**：CSP 阻止了内联脚本执行。

**当前配置**：
```json
"security": {
  "csp": null  // 已禁用，应该没问题
}
```

---

## ✅ 解决方案

### 方案 1：添加错误日志（推荐先做）

**修改** `src/main.js`：

```javascript
// 在文件开头添加
window.addEventListener('error', (e) => {
  console.error('全局错误:', e.error);
  // 在界面上显示错误
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:red;color:white;padding:10px;z-index:9999';
  errorDiv.textContent = `错误：${e.error?.message || '未知错误'}`;
  document.body.appendChild(errorDiv);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('未处理的 Promise 拒绝:', e.reason);
});
```

---

### 方案 2：检查 DOMContentLoaded 事件

**问题**：Tauri 应用中 `DOMContentLoaded` 可能不触发。

**修改** `src/main.js`：

```javascript
// 原代码
document.addEventListener('DOMContentLoaded', async () => {
  await initVditor();
  loadFiles();
  loadTheme();
  setupEventListeners();
});

// 修改为
function initializeApp() {
  // 防止重复初始化
  if (window.appInitialized) return;
  window.appInitialized = true;
  
  console.log('开始初始化应用...');
  
  initVditor().then(() => {
    console.log('Vditor 初始化完成');
    loadFiles();
    loadTheme();
    setupEventListeners();
    console.log('应用初始化完成');
  }).catch(err => {
    console.error('Vditor 初始化失败:', err);
  });
}

// 多种初始化方式
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  // DOM 已就绪，立即初始化
  initializeApp();
}

// 备用：Tauri 的 before-emit 事件
if (window.__TAURI__) {
  window.__TAURI__.event.listen('tauri://ready', initializeApp);
}
```

---

### 方案 3：添加调试日志

**修改** `setupEventListeners()` 函数：

```javascript
function setupEventListeners() {
  console.log('开始绑定事件监听器...');
  
  const btnNew = document.getElementById('btnNew');
  console.log('btnNew:', btnNew);
  
  if (btnNew) {
    btnNew.addEventListener('click', createNewFile);
    console.log('✓ btnNew 事件已绑定');
  } else {
    console.error('✗ btnNew 元素未找到');
  }
  
  // 对其他按钮做同样检查
  const buttons = [
    'btnToggleSidebar',
    'btnOutline',
    'btnTheme',
    'btnOpen',
    'btnSave',
    'btnExport',
    'selectMode'
  ];
  
  buttons.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      console.log(`✓ ${id} 元素存在`);
    } else {
      console.error(`✗ ${id} 元素不存在`);
    }
  });
  
  // ... 其余代码
}
```

---

### 方案 4：检查 Tauri 配置

**确保** `src-tauri/tauri.conf.json` 包含：

```json
{
  "tauri": {
    "allowlist": {
      "all": false,
      "shell": {
        "open": true
      },
      "dialog": {
        "open": true,
        "save": true
      },
      "fs": {
        "readFile": true,
        "writeFile": true,
        "scope": ["$HOME/**", "$DOCUMENT/**", "$DOWNLOAD/**"]
      },
      "path": {
        "all": true
      }
    },
    "security": {
      "csp": null
    },
    "windows": [
      {
        "title": "MarkEdit",
        "width": 1200,
        "height": 800,
        "resizable": true,
        "decorations": true,
        "center": true,
        // 添加以下配置
        "transparent": false,
        "fullscreen": false
      }
    ]
  }
}
```

---

### 方案 5：检查构建产物

**在 macOS 上执行**：

```bash
# 进入应用包
cd /Applications/MarkEdit.app/Contents/Resources

# 检查文件是否存在
ls -la

# 查看 main.js 是否正确构建
cat index.html | head -20
```

---

## 🛠️ 快速诊断脚本

创建一个测试页面来诊断问题：

**新建** `src/debug.html`：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Debug</title>
</head>
<body>
  <h1>调试信息</h1>
  <div id="info"></div>
  
  <script>
    const info = document.getElementById('info');
    
    info.innerHTML = `
      <pre>
        DOMContentLoaded: ${document.readyState}
        Tauri: ${window.__TAURI__ ? '✓' : '✗'}
        Vditor: ${typeof Vditor !== 'undefined' ? '✓' : '✗'}
        
        按钮检查:
        - btnNew: ${document.getElementById('btnNew') ? '✓' : '✗'}
        - btnOpen: ${document.getElementById('btnOpen') ? '✓' : '✗'}
        - btnSave: ${document.getElementById('btnSave') ? '✓' : '✗'}
        - btnTheme: ${document.getElementById('btnTheme') ? '✓' : '✗'}
      </pre>
    `;
    
    // 监听错误
    window.addEventListener('error', (e) => {
      info.innerHTML += `<div style="color:red">错误：${e.error.message}</div>`;
    });
  </script>
</body>
</html>
```

---

## 📊 常见错误及解决

| 错误 | 原因 | 解决 |
|------|------|------|
| `Vditor is not defined` | Vditor 未加载 | 检查 CDN 连接 |
| `Cannot read property 'addEventListener' of null` | 元素未找到 | 检查 HTML ID |
| 按钮点击无任何反应 | JS 执行错误 | 查看控制台日志 |
| 只有部分按钮有效 | 事件绑定顺序 | 确保 DOM 加载后绑定 |

---

## 🚀 推荐步骤

1. **先添加错误日志**（方案 1）
2. **重新构建并测试**
3. **查看错误信息**
4. **根据错误修复**

---

## 📝 更新代码示例

**修改** `src/main.js` 开头：

```javascript
// 全局错误处理
window.addEventListener('error', (e) => {
  console.error('💥 全局错误:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('💥 未处理 Promise:', e.reason);
});

// State
let vditor = null;
let files = [];
// ...
```

---

**最后更新**: 2026-04-04  
**版本**: 1.0.0
