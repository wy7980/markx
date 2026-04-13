// 测试文件类型检测功能
import { 
  getFileType, 
  isMarkdownFile, 
  getEditorMode, 
  getFileLanguage,
  getFileIcon,
  getAllFileTypes,
  getSupportedExtensions 
} from './src/file-types.js';

console.log('🧪 文件类型检测功能测试\n');

// 测试1: 各种文件类型识别
const testFiles = [
  'document.md',
  'script.js',
  'style.css',
  'app.py',
  'data.json',
  'config.yaml',
  'Dockerfile',
  'Makefile',
  '.env',
  'package.json',
  'index.html',
  'database.sql',
  'script.sh',
  'data.csv',
  'unknown.xyz'
];

console.log('📋 测试1: 文件类型识别');
testFiles.forEach(filename => {
  const fileType = getFileType(filename);
  const isMarkdown = isMarkdownFile(filename);
  const editorMode = getEditorMode(filename);
  const language = getFileLanguage(filename);
  const icon = getFileIcon(filename);
  
  console.log(`${icon} ${filename.padEnd(20)} → ${fileType.name.padEnd(15)} 模式:${editorMode.padEnd(10)} 语言:${language.padEnd(12)} Markdown:${isMarkdown ? '✅' : '❌'}`);
});

// 测试2: 支持的扩展名
console.log('\n📊 测试2: 支持的扩展名统计');
const supportedExtensions = getSupportedExtensions();
console.log(`支持 ${supportedExtensions.length} 种扩展名:`);
console.log(supportedExtensions.slice(0, 20).join(', '));
if (supportedExtensions.length > 20) {
  console.log(`... 还有 ${supportedExtensions.length - 20} 种`);
}

// 测试3: 所有文件类型
console.log('\n📁 测试3: 所有支持的文件类型');
const allTypes = getAllFileTypes();
allTypes.forEach((type, index) => {
  console.log(`${index + 1}. ${type.icon} ${type.name.padEnd(15)} 扩展名: ${type.extensions.join(', ')}`);
});

// 测试4: 编辑器模式
console.log('\n🎛️  测试4: 编辑器模式检测');
const modeTests = [
  ['readme.md', 'markdown'],
  ['script.js', 'code'],
  ['notes.txt', 'plain'],
  ['config.yaml', 'code'],
  ['Dockerfile', 'code']
];

modeTests.forEach(([filename, expectedMode]) => {
  const mode = getEditorMode(filename);
  const passed = mode === expectedMode;
  console.log(`${filename.padEnd(20)} → ${mode.padEnd(10)} ${passed ? '✅' : '❌ 期望: ' + expectedMode}`);
});

// 测试5: 编程语言检测
console.log('\n💻 测试5: 编程语言检测');
const langTests = [
  ['app.js', 'javascript'],
  ['style.css', 'css'],
  ['main.py', 'python'],
  ['index.html', 'html'],
  ['data.json', 'json'],
  ['script.sh', 'shell'],
  ['notes.txt', 'plaintext']
];

langTests.forEach(([filename, expectedLang]) => {
  const lang = getFileLanguage(filename);
  const passed = lang === expectedLang;
  console.log(`${filename.padEnd(20)} → ${lang.padEnd(12)} ${passed ? '✅' : '❌ 期望: ' + expectedLang}`);
});

console.log('\n✅ 文件类型检测功能测试完成！');