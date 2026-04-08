const fs = require('fs');

console.log('🔧 验证 Tauri 2.0 配置文件...\n');

try {
  // 读取配置文件
  const config = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
  
  console.log('✅ 配置文件读取成功');
  console.log(`📱 应用名称: ${config.productName}`);
  console.log(`🏷️  版本: ${config.version}`);
  console.log(`🔖 标识符: ${config.identifier}\n`);
  
  // 验证插件配置
  console.log('🔍 插件配置验证:');
  
  if (config.plugins) {
    console.log('✅ plugins 对象存在');
    
    // shell 插件
    if (config.plugins.shell) {
      console.log('   ✅ shell插件: 配置正确');
    } else {
      console.log('   ⚠️  shell插件: 配置缺失或为空');
    }
    
    // fs 插件
    if (config.plugins.fs) {
      console.log('   ✅ fs插件: 配置正确');
      const fsConfig = config.plugins.fs;
      console.log(`     权限: readFile=${fsConfig.allowReadFile}, readDir=${fsConfig.allowReadDir}, writeFile=${fsConfig.allowWriteFile}`);
      console.log(`     范围: ${JSON.stringify(fsConfig.scope)}`);
    } else {
      console.log('   ❌ fs插件: 配置缺失');
    }
    
    // dialog 插件
    if (config.plugins.dialog) {
      const dialogConfig = config.plugins.dialog;
      const keys = Object.keys(dialogConfig);
      
      if (keys.length === 0) {
        console.log('   ✅ dialog插件: 空对象配置 (符合unit类型期望)');
      } else {
        console.log(`   ⚠️  dialog插件: 包含 ${keys.length} 个配置项`);
        console.log(`     配置项: ${JSON.stringify(dialogConfig)}`);
        console.log('     ⚠️  注意: dialog插件可能需要空对象配置');
      }
    } else {
      console.log('   ❌ dialog插件: 配置缺失');
    }
  } else {
    console.log('❌ plugins 对象缺失');
  }
  
  // 检查是否有不支持的字段
  console.log('\n🔍 检查不支持的字段:');
  const unsupportedFields = ['security', 'allowlist'];
  let hasUnsupported = false;
  
  unsupportedFields.forEach(field => {
    if (config[field]) {
      console.log(`   ❌ ${field}: 存在 (Tauri 2.0可能不支持)`);
      hasUnsupported = true;
    } else {
      console.log(`   ✅ ${field}: 不存在`);
    }
  });
  
  if (hasUnsupported) {
    console.log('\n⚠️  警告: 发现不支持的字段，建议移除');
  } else {
    console.log('\n✅ 未发现不支持的字段');
  }
  
  // 验证配置格式
  console.log('\n🎯 配置格式建议:');
  console.log('对于 dialog 插件，如果仍有错误，可以尝试:');
  console.log('1. 完全移除 dialog 配置 (不推荐，功能可能不可用)');
  console.log('2. 使用空对象: "dialog": {}');
  console.log('3. 检查 Tauri 插件版本是否需要特定配置');
  
  console.log('\n🚀 验证完成！');
  
} catch (error) {
  console.error('❌ 验证失败:', error.message);
  console.log('\n💡 建议:');
  console.log('1. 检查配置文件语法是否正确');
  console.log('2. 确保使用有效的JSON格式');
  console.log('3. 验证文件路径是否正确');
}