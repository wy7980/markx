#!/bin/bash
echo "🔧 修复GitHub构建问题..."

# 1. 确保前端构建正确
echo "1. 构建前端..."
pnpm run build

# 2. 检查dist目录内容
echo "2. 检查构建产物..."
ls -la dist/
echo "---"
if [ -f dist/index.html ]; then
  echo "index.html内容预览:"
  head -20 dist/index.html
fi

# 3. 检查main.js是否正确包含
echo "3. 检查main.js引用..."
if [ -f dist/main.js ]; then
  echo "✅ dist/main.js 存在"
  echo "大小: $(wc -c < dist/main.js) 字节"
else
  echo "❌ dist/main.js 不存在"
  echo "检查src/main.js是否被正确构建..."
  
  # 检查vite配置
  if [ -f vite.config.js ]; then
    echo "vite.config.js 存在"
  elif [ -f vite.config.ts ]; then
    echo "vite.config.ts 存在"
  else
    echo "⚠️ 没有vite配置文件"
  fi
fi

# 4. 检查assets目录
echo "4. 检查assets目录..."
if [ -d dist/assets ]; then
  echo "✅ dist/assets 目录存在"
  ls -la dist/assets/
else
  echo "❌ dist/assets 目录不存在"
fi

# 5. 创建修复配置
echo "5. 创建修复配置..."

# 检查是否需要更新vite配置
if [ ! -f vite.config.js ] && [ ! -f vite.config.ts ]; then
  cat > vite.config.js << 'EOF'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: './src/index.html'
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  server: {
    port: 5173
  }
})
EOF
  echo "✅ 创建了 vite.config.js"
fi

# 6. 更新index.html中的script标签
echo "6. 更新index.html..."
if [ -f src/index.html ]; then
  # 备份原文件
  cp src/index.html src/index.html.backup
  
  # 更新script标签
  sed -i 's|<script src="./main.js"></script>|<script type="module" src="./main.js"></script>|' src/index.html
  echo "✅ 更新了script标签"
fi

# 7. 重新构建测试
echo "7. 重新构建测试..."
pnpm run build

# 8. 验证构建结果
echo "8. 验证构建结果..."
if [ -f dist/index.html ]; then
  echo "✅ dist/index.html 存在"
  # 检查是否引用了正确的JS文件
  if grep -q "assets/index" dist/index.html || grep -q "main.js" dist/index.html; then
    echo "✅ index.html 引用了JavaScript文件"
  else
    echo "❌ index.html 没有引用JavaScript文件"
  fi
fi

echo ""
echo "🎯 修复完成！"
echo "📋 下一步："
echo "1. 提交这些修复"
echo "2. 推送到GitHub触发新的构建"
echo "3. 测试新的构建产物"
echo "4. 如果仍有问题，检查控制台错误"