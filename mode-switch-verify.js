/**
 * MarkEdit 模式切换功能验证脚本
 * 用于本地验证模式切换功能
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 MarkEdit 模式切换功能验证\n');

// 1. 验证HTML结构
console.log('1. 验证HTML结构');
const indexPath = path.join(__dirname, 'src/index.html');
if (fs.existsSync(indexPath)) {
  const htmlContent = fs.readFileSync(indexPath, 'utf8');
  
  // 检查模式选择器是否存在
  if (htmlContent.includes('id="selectMode"')) {
    console.log('   ✅ 模式选择器元素存在');
    
    // 检查选项
    const optionsPattern = /<option\s+value="([^"]+)">([^<]+)<\/option>/g;
    const foundOptions = [];
    let match;
    
    while ((match = optionsPattern.exec(htmlContent)) !== null) {
      foundOptions.push({ value: match[1], text: match[2] });
    }
    
    console.log(`   找到 ${foundOptions.length} 个模式选项`);
    
    // 验证选项内容
    const expectedOptions = [
      { value: 'code', text: '源码' },
      { value: 'read', text: '阅读' },
      { value: 'wysiwyg', text: '所见即所得' }
    ];
    
    let allOptionsCorrect = true;
    for (let i = 0; i < expectedOptions.length; i++) {
      const expected = expectedOptions[i];
      
      if (i < foundOptions.length) {
        const found = foundOptions[i];
        
        if (found.value === expected.value && found.text === expected.text) {
          console.log(`   ✅ 选项 ${i+1}: ${expected.text} (${expected.value})`);
        } else {
          console.log(`   ❌ 选项 ${i+1}: 期望 "${expected.text}" (${expected.value}), 实际 "${found.text}" (${found.value})`);
          allOptionsCorrect = false;
        }
      } else {
        console.log(`   ❌ 缺少选项: ${expected.text} (${expected.value})`);
        allOptionsCorrect = false;
      }
    }
    
    if (allOptionsCorrect) {
      console.log('   ✅ 所有模式选项正确\n');
    } else {
      console.log('   ❌ 模式选项不正确\n');
    }
  } else {
    console.log('   ❌ 模式选择器元素缺失\n');
  }
}

// 2. 验证JavaScript功能
console.log('2. 验证JavaScript功能');
const mainJsPath = path.join(__dirname, 'src/main.js');

if (fs.existsSync(mainJsPath)) {
  const jsContent = fs.readFileSync(mainJsPath, 'utf8');
  
  // 检查模式切换函数
  const modeFunctions = [
    /handleCustomModeSwitch/,
    /function.*handleCustomModeSwitch/,
    /case ['"]code['"]/,
    /case ['"]read['"]/,
    /case ['"]wysiwyg['"]/
  ];
  
  let functionExists = true;
  modeFunctions.forEach(pattern => {
    if (!pattern.test(jsContent)) {
      functionExists = false;
      const patternStr = pattern.toString();
      console.log(`   ❌ 缺少匹配项: ${patternStr.substring(1, patternStr.length - 1)}`);
    }
  });
  
  if (functionExists) {
    console.log('   ✅ 模式切换函数存在\n');
  } else {
    console.log('   ⚠️  模式切换函数不完整\n');
  }
  
  // 检查模式映射
  const modeMapPattern = /modeMap.*?{.*?code.*?read.*?wysiwyg.*?}/s;
  if (modeMapPattern.test(jsContent)) {
    console.log('   ✅ 模式映射存在');
  } else {
    console.log('   ⚠️  模式映射不完整\n');
  }
}

// 3. 验证CSS样式
console.log('3. 验证CSS样式');
const stylePath = path.join(__dirname, 'src/style.css');

if (fs.existsSync(stylePath)) {
  const cssContent = fs.readFileSync(stylePath, 'utf8');
  
  // 检查模式相关样式
  const modeStyles = [
    /\.outline-sidebar/,
    /\.file-item/,
    /\.directory-header/,
    /\.outline-item/
  ];
  
  let stylesExist = true;
  modeStyles.forEach(pattern => {
    if (!pattern.test(cssContent)) {
      stylesExist = false;
      const patternStr = pattern.toString();
      console.log(`   ⚠️  缺少样式: ${patternStr.substring(1, patternStr.length - 1)}`);
    }
  });
  
  if (stylesExist) {
    console.log('   ✅ 主要样式类存在\n');
  } else {
    console.log('   ⚠️  部分样式可能不完整\n');
  }
}

// 4. 验证配置完整性
console.log('4. 验证配置完整性');

// 检查是否只有一个编辑器区域的设计
console.log('   检查编辑器区域设计:');

// 分析HTML中的编辑器区域
const html = fs.readFileSync(indexPath, 'utf8');
const editorAreas = [
  { name: 'main editor', pattern: /id\s*=\s*["']vditor-container["']/ },
  { name: 'preview area', pattern: /class\s*=\s*["']vditor-preview["']/ },
  { name: 'split view', pattern: /class\s*=\s*["']vditor-sv["']/ }
];

let singleEditorDesign = true;
editorAreas.forEach(area => {
  if (area.pattern.test(html)) {
    console.log(`   ⚠️  可能包含: ${area.name}`);
    singleEditorDesign = false;
  }
});

if (singleEditorDesign) {
  console.log('   ✅ 符合单一编辑/展示框设计\n');
} else {
  console.log('   ⚠️  可能存在多个编辑/展示框\n');
}

// 5. 生成验证报告
console.log('5. 验证报告');

const validationSummary = {
  html: {
    modeSelector: html.includes('id="selectMode"'),
    codeOption: /<option\s+value="code">源码<\/option>/.test(html),
    readOption: /<option\s+value="read">阅读<\/option>/.test(html),
    wysiwygOption: /<option\s+value="wysiwyg">所见即所得<\/option>/.test(html)
  },
  js: {
    modeFunction: /handleCustomModeSwitch/.test(jsContent),
    modeMapping: /modeMap.*?{.*?code.*?read.*?wysiwyg.*?}/s.test(jsContent),
    eventBinding: /selectMode.addEventListener/.test(jsContent)
  },
  css: {
    outlineStyles: /\.outline-sidebar/.test(cssContent),
    fileItemStyles: /\.file-item/.test(cssContent)
  }
};

console.log('   📋 验证结果:');
console.log(`   - HTML模式选择器: ${validationSummary.html.modeSelector ? '✅ 存在' : '❌ 缺失'}`);
console.log(`   - '源码'选项: ${validationSummary.html.codeOption ? '✅ 存在' : '❌ 缺失'}`);
console.log(`   - '阅读'选项: ${validationSummary.html.readOption ? '✅ 存在' : '❌ 缺失'}`);
console.log(`   - '所见即所得'选项: ${validationSummary.html.wysiwygOption ? '✅ 存在' : '❌ 缺失'}`);
console.log(`   - 模式切换函数: ${validationSummary.js.modeFunction ? '✅ 存在' : '❌ 缺失'}`);
console.log(`   - 模式映射: ${validationSummary.js.modeMapping ? '✅ 存在' : '❌ 缺失'}`);
console.log(`   - 事件绑定: ${validationSummary.js.eventBinding ? '✅ 存在' : '❌ 缺失'}`);
console.log(`   - 大纲样式: ${validationSummary.css.outlineStyles ? '✅ 存在' : '❌ 缺失'}`);
console.log(`   - 文件项样式: ${validationSummary.css.fileItemStyles ? '✅ 存在' : '❌ 缺失'}`);

console.log('\n🎯 验证结论:');
const allTestsPass = 
  validationSummary.html.modeSelector &&
  validationSummary.html.codeOption &&
  validationSummary.html.readOption &&
  validationSummary.html.wysiwygOption &&
  validationSummary.js.modeFunction &&
  validationSummary.js.modeMapping &&
  validationSummary.js.eventBinding;

if (allTestsPass) {
  console.log('   ✅ 所有验证项目通过！');
  console.log('   🚀 模式切换功能完整，可以提交。');
} else {
  console.log('   ❌ 部分验证项目失败。');
  console.log('   ⚠️  请检查问题并重新测试。');
}

console.log('\n🔍 下一步:');
console.log('   1. 启动本地开发服务器');
console.log('   2. 运行Playwright测试脚本');
console.log('   3. 验证所有模式功能');
console.log('   4. 提交修复后的代码');

process.exit(allTestsPass ? 0 : 1);