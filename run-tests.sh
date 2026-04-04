#!/bin/bash

# MarkEdit 测试脚本

echo "🧪 MarkEdit 测试套件"
echo "===================="
echo ""

# 检查依赖
if ! command -v npm &> /dev/null; then
    echo "❌ npm 未安装"
    exit 1
fi

# 安装依赖
echo "📦 安装依赖..."
npm install

# 运行单元测试
echo ""
echo "🔬 单元测试"
echo "-----------"
npm run test -- --run

# 运行组件测试
echo ""
echo "🧩 组件测试"
echo "-----------"
npm run test -- --run tests/component

# 运行 E2E 测试
echo ""
echo "🌐 E2E 测试"
echo "-----------"
echo "安装 Playwright 浏览器..."
npx playwright install chromium

echo "运行 E2E 测试..."
npm run test:e2e

echo ""
echo "✅ 测试完成"
