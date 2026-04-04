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

## ⚠️ "文件损坏"问题解决方案

### 问题原因
macOS Gatekeeper 安全机制阻止未签名应用运行。

### 临时解决方案（用户侧）

**方法 1：右键打开**
1. 在 Finder 中找到 `MarkEdit.app`
2. **右键点击** → **打开**
3. 在警告对话框中点击 **"仍要打开"**

**方法 2：终端命令**
```bash
# 移除隔离属性
xattr -cr /Applications/MarkEdit.app

# 或者
xattr -d com.apple.quarantine /Applications/MarkEdit.app
```

**方法 3：系统设置**
1. 打开 **系统设置** → **隐私与安全性**
2. 滚动到 **"安全性"** 部分
3. 点击 **"仍要打开"**

---

## 🔐 代码签名 + 公证（推荐方案）

**彻底解决"文件损坏"警告**，需要 Apple Developer 账号：

### 1. 获取 Apple Developer 账号
- **年费**：$99 USD
- **网址**：https://developer.apple.com
- **时间**：审核约 1-2 天

### 2. 创建证书

**在 Apple Developer 后台**：
1. 访问 https://developer.apple.com/account/resources/certificates
2. 点击 **"+"** 创建证书
3. 选择 **"Developer ID Application"**
4. 下载证书并双击安装到 Keychain

### 3. 导出 .p12 文件

**在 Keychain Access 中**：
1. 找到 `Developer ID Application: Your Name`
2. **右键** → **导出**
3. 保存为 `.p12` 文件
4. 设置密码（记住这个密码）

### 4. 获取 Team ID

**在 Apple Developer 后台**：
1. 访问 https://developer.apple.com/account/#/overview
2. 复制 **Team ID**（10 位字母数字）

### 5. 创建 App-Specific Password

**在 Apple ID 后台**：
1. 访问 https://appleid.apple.com
2. **Sign-In and Security** → **App-Specific Passwords**
3. 生成新密码（用于公证）

### 6. 配置 GitHub Secrets

| Secret 名称 | 说明 | 获取方式 |
|------------|------|---------|
| `APPLE_CERTIFICATE` | .p12 文件 base64 编码 | `base64 -i cert.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | .p12 密码 | 导出时设置的密码 |
| `APPLE_SIGNING_IDENTITY` | 签名身份 | Keychain 中证书完整名称 |
| `APPLE_TEAM_ID` | Team ID | Apple Developer 后台 |
| `APPLE_ID` | Apple ID 邮箱 | 登录 Apple 的邮箱 |
| `APPLE_PASSWORD` | App-Specific Password | Apple ID 后台生成 |

**示例**：
```bash
# 编码证书
base64 -i Developer_ID_Application.p12 | pbcopy

# 查看签名身份
security find-identity -v -p codesigning
```

### 7. 验证配置

推送代码后，CI 会自动：
1. ✅ **导入证书**到临时钥匙串
2. ✅ **代码签名**应用和 DMG
3. ✅ **提交公证**到 Apple 服务器
4. ✅ **附加公证票据**到 DMG

### 8. 费用说明

| 项目 | 费用 | 必需性 |
|------|------|--------|
| Apple Developer 账号 | $99/年 | 签名必需 |
| 公证 | 免费 | 包含在账号中 |

---

## 📊 签名 vs 无签名对比

| 特性 | 无签名 | 已签名 + 公证 |
|------|--------|--------------|
| 下载后打开 | ⚠️ 警告"文件损坏" | ✅ 直接打开 |
| 用户信任度 | 低 | 高 |
| 分发难度 | 需指导用户绕过 | 无障碍 |
| 成本 | 免费 | $99/年 |
| 推荐场景 | 内部测试 | 公开发布 |

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
