#!/bin/bash
echo "🚀 开始运行MarkEdit UI基本功能测试..."

# 创建测试结果目录
mkdir -p test-results

# 检查开发服务器是否运行
echo "🔍 检查开发服务器..."
if ! curl -s http://localhost:5173 > /dev/null; then
  echo "⚠️ 开发服务器未运行，启动开发服务器..."
  pnpm run dev &
  DEV_PID=$!
  echo "📡 开发服务器启动中 (PID: $DEV_PID)..."
  sleep 5
fi

# 运行Playwright测试
echo "🧪 运行UI测试..."
npx playwright test tests/ui-basic.test.js \
  --reporter=html \
  --output=test-results/ \
  --timeout=30000

# 检查测试结果
if [ $? -eq 0 ]; then
  echo "✅ 所有测试通过！"
  echo "📊 测试报告: test-results/playwright-report/index.html"
else
  echo "❌ 部分测试失败"
  echo "📋 查看详细报告: test-results/playwright-report/index.html"
fi

# 如果有启动开发服务器，清理
if [ ! -z "$DEV_PID" ]; then
  echo "🛑 停止开发服务器 (PID: $DEV_PID)..."
  kill $DEV_PID 2>/dev/null
fi

echo ""
echo "📁 测试结果文件:"
ls -la test-results/

echo ""
echo "🎯 测试覆盖的功能:"
echo "1. ✅ 应用启动和基本结构"
echo "2. ✅ 新建文档功能"
echo "3. ✅ 编辑器输入功能"
echo "4. ✅ 保存功能"
echo "5. ✅ 打开文件功能（模拟）"
echo "6. ✅ 主题切换功能"
echo "7. ✅ 编辑模式切换"
echo "8. ✅ 侧边栏切换"
echo "9. ✅ 大纲功能"
echo "10. ✅ 导出功能按钮检查"