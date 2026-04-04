# macOS 构建配置说明

## 📋 配置概览

已成功配置 GitHub Actions CI 自动构建 macOS Apple Silicon 版本。

## 🎯 支持的架构

| 架构 | 目标三元组 | Runner | 状态 |
|------|-----------|--------|------|
| **Apple Silicon** | `aarch64-apple-darwin` | `macos-14` (M1) | ✅ 已配置 |
| Intel Mac | `x86_64-apple-darwin` | `macos-13` | ❌ 未配置（可选） |
| Universal | `universal-apple-darwin` | `macos-14` | ❌ 未配置（可选） |

## 📦 输出格式

- **DMG** - 磁盘镜像安装包（推荐用户下载）
- **APP** - 应用程序包（可直接使用）

## 🚀 触发条件

### 自动构建
- **推送** 到 `main` 或 `master` 分支
- **Pull Request**

### 自动发布
- 创建 **Git 标签**（如 `v1.0.0`）
- 格式：`refs/tags/*`

## 📝 CI 工作流程

```
push/tag → test (Ubuntu) → build-windows (Windows) → build-macos (macOS-14) → release
```

## 🔧 构建产物

### Windows
- `markx-msi/*.msi` - Windows Installer
- `markx-nsis/*.exe` - NSIS 安装包
- `markx-portable/*.zip` - 绿色版

### macOS (新增)
- `markx-macos-dmg/*.dmg` - DMG 安装包
- `markx-macos-app/*.app` - APP 应用程序

## ⚙️ macOS 配置详情

### 最低系统要求
- **macOS 12.0 (Monterey)** 及以上

### 构建环境
- **Runner**: `macos-14` (Apple Silicon M1)
- **Rust 目标**: `aarch64-apple-darwin`
- **Node.js**: 20.x

### Tauri 配置 (`src-tauri/tauri.conf.json`)
```json
{
  "tauri": {
    "bundle": {
      "targets": ["msi", "nsis", "dmg", "app"],
      "macOS": {
        "minimumSystemVersion": "12.0",
        "frameworks": [],
        "exceptionDomain": "",
        "signingIdentity": null,
        "entitlements": null
      }
    }
  }
}
```

## 🔐 代码签名（可选）

如需在 Mac App Store 分发或避免"无法打开"警告，需要代码签名：

### 1. 获取 Apple Developer 账号
- 年费：$99 USD
- 网址：https://developer.apple.com

### 2. 创建证书
```bash
# 在 Keychain Access 中创建 Certificate Authority
# 然后创建 Distribution Certificate
```

### 3. 导出 .p12 文件
```bash
# 在 Keychain Access 中导出证书为 .p12
```

### 4. 配置 GitHub Secrets

| Secret 名称 | 说明 | 示例 |
|------------|------|------|
| `APPLE_CERTIFICATE` | .p12 文件 base64 编码 | `MIIG...` |
| `APPLE_CERTIFICATE_PASSWORD` | .p12 密码 | `your-password` |
| `APPLE_SIGNING_IDENTITY` | 签名身份 | `Developer ID Application: Your Name (TEAM_ID)` |
| `APPLE_TEAM_ID` | Team ID | `XXXXXXXXXX` |

### 5. 更新 CI 配置
```yaml
env:
  APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
  APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
  APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
  APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

## 📊 构建时间估算

| 平台 | 预计时间 |
|------|---------|
| Windows | ~15 分钟 |
| macOS (Apple Silicon) | ~12 分钟 |
| **总计** | **~27 分钟** |

## 🧪 本地测试构建

### 在 macOS 上构建
```bash
cd src-tauri
cargo tauri build --target aarch64-apple-darwin
```

### 产物位置
```
src-tauri/target/aarch64-apple-darwin/release/bundle/
├── dmg/
│   └── MarkEdit_x.x.x_aarch64.dmg
└── macos/
    └── MarkEdit.app
```

## 📈 后续可选增强

### 1. 添加 Intel Mac 支持
```yaml
build-macos-intel:
  runs-on: macos-13
  steps:
    - uses: dtolnay/rust-toolchain@stable
      with:
        targets: x86_64-apple-darwin
    # ... 其他步骤
```

### 2. 构建 Universal Binary
```yaml
build-macos-universal:
  runs-on: macos-14
  steps:
    - uses: dtolnay/rust-toolchain@stable
      with:
        targets: aarch64-apple-darwin,x86_64-apple-darwin
    - run: cargo tauri build --target universal-apple-darwin
```

### 3. 自动 notarization
```yaml
- name: Notarize
  run: |
    xcrun notarytool submit "MarkEdit.dmg" \
      --apple-id $APPLE_ID \
      --password $APPLE_PASSWORD \
      --team-id $APPLE_TEAM_ID \
      --wait
```

## 📞 故障排查

### 问题：构建失败 "unable to find aarch64-apple-darwin target"
**解决**: 确认 Rust toolchain 已添加目标架构
```yaml
- uses: dtolnay/rust-toolchain@stable
  with:
    targets: aarch64-apple-darwin
```

### 问题：DMG 文件未生成
**解决**: 检查 `tauri.conf.json` 中 `targets` 包含 `dmg`

### 问题：应用无法打开（macOS 警告）
**解决**: 
1. 右键点击 → 打开
2. 或进行代码签名 + notarization

## 📄 相关文件

- `.github/workflows/ci.yml` - CI 配置
- `src-tauri/tauri.conf.json` - Tauri 配置
- `src-tauri/Cargo.toml` - Rust 依赖

---

**最后更新**: 2026-04-04  
**版本**: 1.0.0  
**作者**: OpenClaw Bot
