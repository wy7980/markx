/**
 * 文件类型检测工具
 * 用于识别不同类型的文本文件并应用相应的处理
 */

// 支持的文件类型定义
export const FILE_TYPES = {
  // Markdown 文件
  MARKDOWN: {
    extensions: ['md', 'markdown'],
    name: 'Markdown',
    mimeType: 'text/markdown',
    isMarkdown: true,
    mode: 'markdown',
    icon: '📝'
  },
  
  // 纯文本文件
  PLAIN_TEXT: {
    extensions: ['txt', 'text', 'log'],
    name: '纯文本',
    mimeType: 'text/plain',
    isMarkdown: false,
    mode: 'plain',
    icon: '📄'
  },
  
  // 代码文件
  JAVASCRIPT: {
    extensions: ['js', 'jsx', 'mjs', 'cjs'],
    name: 'JavaScript',
    mimeType: 'text/javascript',
    isMarkdown: false,
    mode: 'code',
    language: 'javascript',
    icon: '📜'
  },
  
  TYPESCRIPT: {
    extensions: ['ts', 'tsx', 'mts', 'cts'],
    name: 'TypeScript',
    mimeType: 'application/typescript',
    isMarkdown: false,
    mode: 'code',
    language: 'typescript',
    icon: '📘'
  },
  
  PYTHON: {
    extensions: ['py', 'pyw', 'pyi'],
    name: 'Python',
    mimeType: 'text/x-python',
    isMarkdown: false,
    mode: 'code',
    language: 'python',
    icon: '🐍'
  },
  
  JAVA: {
    extensions: ['java'],
    name: 'Java',
    mimeType: 'text/x-java',
    isMarkdown: false,
    mode: 'code',
    language: 'java',
    icon: '☕'
  },
  
  C_CPP: {
    extensions: ['c', 'cpp', 'cc', 'cxx', 'h', 'hpp'],
    name: 'C/C++',
    mimeType: 'text/x-c',
    isMarkdown: false,
    mode: 'code',
    language: 'cpp',
    icon: '⚙️'
  },
  
  // Web 文件
  HTML: {
    extensions: ['html', 'htm'],
    name: 'HTML',
    mimeType: 'text/html',
    isMarkdown: false,
    mode: 'code',
    language: 'html',
    icon: '🌐'
  },
  
  CSS: {
    extensions: ['css', 'scss', 'sass', 'less'],
    name: 'CSS',
    mimeType: 'text/css',
    isMarkdown: false,
    mode: 'code',
    language: 'css',
    icon: '🎨'
  },
  
  // 配置文件
  JSON: {
    extensions: ['json'],
    name: 'JSON',
    mimeType: 'application/json',
    isMarkdown: false,
    mode: 'code',
    language: 'json',
    icon: '📊'
  },
  
  XML: {
    extensions: ['xml', 'xsd', 'xsl'],
    name: 'XML',
    mimeType: 'application/xml',
    isMarkdown: false,
    mode: 'code',
    language: 'xml',
    icon: '📋'
  },
  
  YAML: {
    extensions: ['yml', 'yaml'],
    name: 'YAML',
    mimeType: 'text/yaml',
    isMarkdown: false,
    mode: 'code',
    language: 'yaml',
    icon: '⚙️'
  },
  
  TOML: {
    extensions: ['toml'],
    name: 'TOML',
    mimeType: 'text/toml',
    isMarkdown: false,
    mode: 'code',
    language: 'toml',
    icon: '⚙️'
  },
  
  INI: {
    extensions: ['ini', 'cfg', 'conf', 'properties'],
    name: '配置文件',
    mimeType: 'text/plain',
    isMarkdown: false,
    mode: 'plain',
    icon: '⚙️'
  },
  
  // 脚本文件
  SHELL: {
    extensions: ['sh', 'bash', 'zsh'],
    name: 'Shell 脚本',
    mimeType: 'text/x-shellscript',
    isMarkdown: false,
    mode: 'code',
    language: 'shell',
    icon: '💻'
  },
  
  POWERSHELL: {
    extensions: ['ps1'],
    name: 'PowerShell',
    mimeType: 'text/x-powershell',
    isMarkdown: false,
    mode: 'code',
    language: 'powershell',
    icon: '💻'
  },
  
  // 数据文件
  CSV: {
    extensions: ['csv', 'tsv'],
    name: 'CSV/TSV',
    mimeType: 'text/csv',
    isMarkdown: false,
    mode: 'plain',
    icon: '📊'
  },
  
  // 其他
  SQL: {
    extensions: ['sql'],
    name: 'SQL',
    mimeType: 'text/x-sql',
    isMarkdown: false,
    mode: 'code',
    language: 'sql',
    icon: '🗄️'
  },
  
  ENV: {
    extensions: ['env'],
    name: '环境变量',
    mimeType: 'text/plain',
    isMarkdown: false,
    mode: 'plain',
    icon: '🔧'
  },
  
  GITIGNORE: {
    extensions: ['gitignore'],
    name: 'Git 忽略',
    mimeType: 'text/plain',
    isMarkdown: false,
    mode: 'plain',
    icon: '📁'
  }
};

// 特殊文件名（无扩展名）
export const SPECIAL_FILES = {
  'Dockerfile': {
    name: 'Dockerfile',
    type: 'DOCKERFILE',
    isMarkdown: false,
    mode: 'code',
    language: 'dockerfile',
    icon: '🐳'
  },
  'Makefile': {
    name: 'Makefile',
    type: 'MAKEFILE',
    isMarkdown: false,
    mode: 'code',
    language: 'makefile',
    icon: '🔨'
  },
  'dockerfile': {
    name: 'Dockerfile',
    type: 'DOCKERFILE',
    isMarkdown: false,
    mode: 'code',
    language: 'dockerfile',
    icon: '🐳'
  },
  'makefile': {
    name: 'Makefile',
    type: 'MAKEFILE',
    isMarkdown: false,
    mode: 'code',
    language: 'makefile',
    icon: '🔨'
  }
};

// 创建扩展名到类型的映射
const EXTENSION_MAP = {};
Object.values(FILE_TYPES).forEach(fileType => {
  fileType.extensions.forEach(ext => {
    EXTENSION_MAP[ext] = fileType;
  });
});

/**
 * 根据文件名获取文件类型信息
 * @param {string} filename - 文件名
 * @returns {Object} 文件类型信息
 */
export function getFileType(filename) {
  if (!filename) {
    return {
      name: '未知文件',
      isMarkdown: false,
      mode: 'plain',
      icon: '❓'
    };
  }

  // 检查特殊文件
  const basename = filename.split('/').pop().split('\\').pop();
  if (SPECIAL_FILES[basename]) {
    return SPECIAL_FILES[basename];
  }

  // 提取扩展名
  const parts = basename.split('.');
  if (parts.length < 2) {
    return {
      name: '无扩展名文件',
      isMarkdown: false,
      mode: 'plain',
      icon: '📄'
    };
  }

  const extension = parts[parts.length - 1].toLowerCase();
  const fileType = EXTENSION_MAP[extension];

  if (fileType) {
    return {
      ...fileType,
      extension
    };
  }

  // 未知扩展名，尝试根据内容判断
  return {
    name: '未知文件',
    isMarkdown: false,
    mode: 'plain',
    extension,
    icon: '❓'
  };
}

/**
 * 检查文件是否为 Markdown 文件
 * @param {string} filename - 文件名
 * @returns {boolean}
 */
export function isMarkdownFile(filename) {
  const fileType = getFileType(filename);
  return fileType.isMarkdown === true;
}

/**
 * 检查文件是否为代码文件
 * @param {string} filename - 文件名
 * @returns {boolean}
 */
export function isCodeFile(filename) {
  const fileType = getFileType(filename);
  return fileType.mode === 'code';
}

/**
 * 获取文件的编辑器模式
 * @param {string} filename - 文件名
 * @returns {string} 编辑器模式 ('markdown', 'code', 'plain')
 */
export function getEditorMode(filename) {
  const fileType = getFileType(filename);
  return fileType.mode || 'plain';
}

/**
 * 获取文件的编程语言（用于语法高亮）
 * @param {string} filename - 文件名
 * @returns {string} 编程语言
 */
export function getFileLanguage(filename) {
  const fileType = getFileType(filename);
  return fileType.language || 'plaintext';
}

/**
 * 获取文件图标
 * @param {string} filename - 文件名
 * @returns {string} 图标字符
 */
export function getFileIcon(filename) {
  const fileType = getFileType(filename);
  return fileType.icon || '📄';
}

/**
 * 获取支持的文件扩展名列表
 * @returns {Array} 支持的文件扩展名
 */
export function getSupportedExtensions() {
  return Object.keys(EXTENSION_MAP);
}

/**
 * 检查文件扩展名是否受支持
 * @param {string} extension - 文件扩展名（不带点）
 * @returns {boolean}
 */
export function isExtensionSupported(extension) {
  return EXTENSION_MAP[extension?.toLowerCase()] !== undefined;
}

/**
 * 获取所有支持的文件类型信息
 * @returns {Array} 文件类型信息数组
 */
export function getAllFileTypes() {
  return Object.values(FILE_TYPES).map(type => ({
    name: type.name,
    extensions: type.extensions,
    icon: type.icon,
    mode: type.mode
  }));
}