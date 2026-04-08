#!/bin/bash
# 修复CI配置文件中的重复问题

echo "🔧 修复CI配置文件..."

# 读取原始文件
input_file=".github/workflows/ci.yml"
output_file=".github/workflows/ci.yml.fixed"

# 创建临时文件
temp_file=$(mktemp)

# 处理文件，删除重复的配置
awk '
# 状态变量
in_deps_section = 0
skip_next = 0

{
    # 如果找到"配置 pnpm 允许构建脚本"且已经在依赖部分，跳过这一行和下一行
    if ($0 ~ /配置 pnpm 允许构建脚本/ && in_deps_section) {
        skip_next = 2
        next
    }
    
    # 如果找到"安装依赖"，标记进入依赖部分
    if ($0 ~ /安装依赖/) {
        in_deps_section = 1
    }
    # 如果找到其他步骤，离开依赖部分
    else if ($0 ~ /^[[:space:]]*- name:/ && !($0 ~ /安装依赖/)) {
        in_deps_section = 0
    }
    
    # 如果需要跳过，递减计数器
    if (skip_next > 0) {
        skip_next--
        next
    }
    
    print $0
}
' "$input_file" > "$temp_file"

# 替换原文件
cp "$temp_file" "$output_file"
rm "$temp_file"

echo "✅ 修复完成！新的CI文件保存在: $output_file"
echo "请检查文件内容，然后替换原文件:"
echo "  mv $output_file $input_file"