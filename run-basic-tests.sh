#!/bin/bash
echo "🚀 开始运行MarkEdit基本功能测试..."

# 创建测试结果目录
mkdir -p test-results/basic

# 检查开发服务器是否运行
echo "🔍 检查开发服务器状态..."
if ! curl -s http://localhost:5173 > /dev/null; then
  echo "⚠️ 开发服务器未运行，启动开发服务器..."
  pnpm run dev 2>&1 > /dev/null &
  DEV_PID=$!
  echo "📡 开发服务器启动中 (PID: $DEV_PID)..."
  
  # 等待服务器启动
  for i in {1..10}; do
    if curl -s http://localhost:5173 > /dev/null; then
      echo "✅ 开发服务器已就绪"
      break
    fi
    echo "⏳ 等待服务器启动... ($i/10)"
    sleep 2
  done
else
  echo "✅ 开发服务器已在运行"
fi

# 运行Playwright测试
echo "🧪 运行基本功能测试..."
echo "测试内容:"
echo "  1. 应用启动测试"
echo "  2. 新建文档功能测试"
echo "  3. 编辑器输入功能测试"
echo "  4. 保存文档功能测试"
echo "  5. 快捷键功能测试"
echo "  6. 主题切换功能测试"
echo "  7. 编辑模式切换测试"
echo "  8. 导出功能测试"

# 运行测试
npx playwright test tests/basic-functionality.test.js \
  --reporter=html,line \
  --output=test-results/ \
  --timeout=30000 \
  --workers=1

TEST_RESULT=$?

# 生成测试报告
echo "📊 生成测试报告..."

# 检查是否有测试报告
if [ -f "test-results/playwright-report/index.html" ]; then
  echo "✅ 测试报告已生成: test-results/playwright-report/index.html"
  echo "  用浏览器打开查看详细报告"
else
  echo "⚠️ 未找到HTML测试报告"
fi

# 显示测试结果摘要
echo ""
echo "📋 测试结果摘要:"
if [ $TEST_RESULT -eq 0 ]; then
  echo "✅ 所有测试通过！"
else
  echo "❌ 部分测试失败"
  echo "查看详细报告: test-results/playwright-report/index.html"
fi

# 显示截图目录
echo ""
echo "📁 测试截图:"
if [ -d "test-results/basic" ]; then
  ls -la test-results/basic/*.png 2>/dev/null | head -10
  echo "  共 $(ls -la test-results/basic/*.png 2>/dev/null | wc -l) 张截图"
else
  echo "⚠️ 未找到测试截图"
fi

# 清理开发服务器
if [ ! -z "$DEV_PID" ]; then
  echo ""
  echo "🛑 停止开发服务器 (PID: $DEV_PID)..."
  kill $DEV_PID 2>/dev/null
fi

echo ""
echo "🎯 测试完成！"
exit $TEST_RESULT