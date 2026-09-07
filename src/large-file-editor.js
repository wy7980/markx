/**
 * 大文件编辑引擎（CodeMirror 6）
 *
 * 设计依据：《MarkEdit 大文件性能优化方案 v2》§5
 * - 视口渲染：DOM 只包含可见行，打开多 MB 文档为毫秒级（对比 vditor setValue 全量渲染 ~5s/MB）
 * - 增量解析：@codemirror/lang-markdown（Lezer），语法高亮按需，滚动到哪里高亮到哪里
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
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';

/** 超过此字节数禁用"选中匹配高亮"（选中词语时会全文扫描，O(文档)） */
const HIGHLIGHT_MATCHES_DISABLE_THRESHOLD = 2 * 1024 * 1024;

export class LargeFileEditor {
  /**
   * @param {HTMLElement} hostElement 宿主容器（由调用方控制显隐与布局）
   */
  constructor(hostElement) {
    this.host = hostElement;
    this.view = null;
    this._extensions = null;
    this._themeCompartment = new Compartment();
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

    this._extensions = [
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
      markdown({ base: markdownLanguage }),
      this._themeCompartment.of([]),
      this._hsmCompartment.of([]),
      localTheme
    ];

    this.view = new EditorView({
      state: EditorState.create({ doc: '', extensions: this._extensions }),
      parent: this.host
    });
    this.host.classList.add('large-file-editor-host');
    // 默认隐藏，由 show()/hide() 控制（与 vditor-container 的显隐互斥）
    this.host.style.display = 'none';
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
      ? [...this._extensions, EditorState.lineSeparator.of('\r\n')]
      : this._extensions;
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
