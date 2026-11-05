/**
 * 文本编辑引擎（CodeMirror 6）
 *
 * 职责：承载大文件与大体积 Markdown，以及全部非 Markdown 文本/代码文件。
 * - 纯文本语义：不解析 Markdown，缩进/行尾空格原样保留，保存不会改写内容
 * - 语法高亮：按文件语言选择 Lezer / legacy StreamLanguage（JS、JSON、Python、YAML…）
 * - 视口渲染：DOM 只包含可见行，打开多 MB 文档为毫秒级（对比 vditor setValue 全量渲染 ~5s/MB）
 * - 引擎可替换：与 Vditor 引擎之间通过 main.js 的 getEditorValue()/largeFileMode 状态位衔接，
 *   保存/导出路径零改动
 * - 对齐 VS Code largeFileOptimizations 思想：超大文档禁用昂贵特性（选中匹配高亮全文扫描）
 *
 * 由 main.js 的 ensureLargeFileEditor() 动态 import（避免 CM6 进入首屏 bundle）。
 */
import { EditorView, keymap, lineNumbers, drawSelection, dropCursor,
  highlightActiveLine, highlightSpecialChars, rectangularSelection, crosshairCursor } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { syntaxHighlighting, defaultHighlightStyle, StreamLanguage } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json as jsonMode } from '@codemirror/legacy-modes/mode/javascript';
import { python } from '@codemirror/legacy-modes/mode/python';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { standardSQL } from '@codemirror/legacy-modes/mode/sql';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { powerShell } from '@codemirror/legacy-modes/mode/powershell';
import { cpp, java, csharp } from '@codemirror/legacy-modes/mode/clike';
import { xml } from '@codemirror/legacy-modes/mode/xml';
import { oneDark } from '@codemirror/theme-one-dark';

/**
 * 文件语言 → CodeMirror 语言扩展。
 * 不认识的类型回退为「无语言」：只保留文本与缩进，绝不按 Markdown 解析。
 * @param {string} language getFileLanguage() 的返回值
 */
function languageExtension(language) {
  switch (language) {
    case 'markdown': return markdown({ base: markdownLanguage });
    case 'javascript': return javascript({ jsx: true });
    case 'typescript': return javascript({ typescript: true });
    case 'json': return StreamLanguage.define(jsonMode);
    case 'html': return html();
    case 'css': return css();
    case 'xml': return StreamLanguage.define(xml);
    case 'python': return StreamLanguage.define(python);
    case 'shell': return StreamLanguage.define(shell);
    case 'sql': return StreamLanguage.define(standardSQL);
    case 'yaml': return StreamLanguage.define(yaml);
    case 'toml': return StreamLanguage.define(toml);
    case 'dockerfile': return StreamLanguage.define(dockerFile);
    case 'powershell': return StreamLanguage.define(powerShell);
    case 'java': return StreamLanguage.define(java);
    case 'cpp': return StreamLanguage.define(cpp);
    case 'csharp': return StreamLanguage.define(csharp);
    default: return [];
  }
}

/** 超过此字节数禁用"选中匹配高亮"（选中词语时会全文扫描，O(文档)） */
const HIGHLIGHT_MATCHES_DISABLE_THRESHOLD = 2 * 1024 * 1024;

export class LargeFileEditor {
  /**
   * @param {HTMLElement} hostElement 宿主容器（由调用方控制显隐与布局）
   */
  constructor(hostElement) {
    this.host = hostElement;
    this.view = null;
    this._baseExtensions = null;
    this._language = 'markdown';
    this._isDark = false;
    this.onChange = null;
    this._themeCompartment = new Compartment();
    this._languageCompartment = new Compartment();
    this._hsmCompartment = new Compartment();   // 选中匹配高亮开关
    this._build();
  }

  _build() {
    const localTheme = EditorView.theme({
      '&': { height: '100%', fontSize: '14px' },
      '.cm-scroller': {
        fontFamily: "'Cascadia Code', Consolas, 'Courier New', monospace",
        lineHeight: '1.6',
        overflow: 'auto'
      },
      '.cm-content': { paddingBottom: '30vh' }
    });

    this._baseExtensions = [
      lineNumbers(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      search({ top: true }),
      EditorState.allowMultipleSelections.of(true),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && this.onChange) {
          this.onChange(this.getValue());
        }
      }),
      localTheme
    ];

    this.view = new EditorView({
      state: EditorState.create({ doc: '', extensions: this._composeExtensions() }),
      parent: this.host
    });
    this.host.classList.add('large-file-editor-host');
    // 默认隐藏，由 show()/hide() 控制（与 vditor-container 的显隐互斥）
    this.host.style.display = 'none';
  }

  /** 按当前语言 / 主题 / 大文档开关组合出扩展；setValue 重建 state 时必须重新取一次 */
  _composeExtensions() {
    return [
      ...this._baseExtensions,
      this._languageCompartment.of(languageExtension(this._language)),
      this._themeCompartment.of(this._isDark ? oneDark : []),
      this._hsmCompartment.of(highlightSelectionMatches())
    ];
  }

  /** 切换语法高亮语言（打开新文件时调用；不重建文档，不丢撤销栈） */
  setLanguage(language) {
    const next = language || 'plaintext';
    if (next === this._language) return;
    this._language = next;
    this.view.dispatch({
      effects: this._languageCompartment.reconfigure(languageExtension(next))
    });
  }

  /** 文档变更回调（由调用方做字数等轻量统计） */
  setOnChange(callback) {
    this.onChange = callback;
  }

  show() {
    this.host.style.display = '';
    // 从隐藏状态恢复后让 CM6 重新测量视口
    requestAnimationFrame(() => { if (this.view) this.view.requestMeasure(); });
  }

  hide() {
    this.host.style.display = 'none';
  }

  /**
   * 整篇替换文档（打开/切换文件时使用；重置撤销栈）。
   * CRLF 占优的文档通过 lineSeparator 声明行尾，保证 Enter 插入 \r\n、
   * getValue() 原样还原，避免编辑后产生混合行尾（Windows 场景）。
   * @param {string} text
   * @param {number} [byteLen] 调用方已算好的 UTF-8 字节数（避免重复全量编码）
   */
  setValue(text, byteLen) {
    const doc = String(text || '');
    if (byteLen === undefined) {
      byteLen = new TextEncoder().encode(doc).length;
    }

    // 行尾检测：\r\n 占优时启用 CRLF 行分隔符
    const crlfCount = (doc.match(/\r\n/g) || []).length;
    const lfCount = (doc.match(/\n/g) || []).length;
    const useCrlf = crlfCount > 0 && crlfCount > (lfCount - crlfCount);

    const extensions = useCrlf
      ? [...this._composeExtensions(), EditorState.lineSeparator.of('\r\n')]
      : this._composeExtensions();
    this.view.setState(EditorState.create({ doc, extensions }));

    // 选中匹配高亮（highlightSelectionMatches）在选中词语时会全文扫描：
    // 超大文档禁用该昂贵特性
    this.view.dispatch({
      effects: this._hsmCompartment.reconfigure(
        byteLen > HIGHLIGHT_MATCHES_DISABLE_THRESHOLD ? [] : highlightSelectionMatches()
      )
    });
  }

  getValue() {
    return this.view.state.doc.toString();
  }

  focus() {
    this.view.focus();
  }

  /** @param {boolean} isDark 跟随应用主题 */
  setTheme(isDark) {
    this._isDark = isDark;
    this.view.dispatch({
      effects: this._themeCompartment.reconfigure(isDark ? oneDark : [])
    });
  }

  /** 大纲跳转：滚动到指定行（0-based）并置光标 */
  focusLine(line) {
    const doc = this.view.state.doc;
    const target = Math.max(1, Math.min((line | 0) + 1, doc.lines));
    const pos = doc.line(target).from;
    this.view.dispatch({
      selection: { anchor: pos },
      scrollIntoView: true
    });
    this.view.focus();
  }

  destroy() {
    if (this.view) {
      this.view.destroy();
      this.view = null;
    }
  }
}
