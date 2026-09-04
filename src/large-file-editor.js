/**
 * 大文件编辑引擎（CodeMirror 6）
 *
 * 设计依据：《MarkEdit 大文件性能优化方案 v2》§5
 * - 视口渲染：DOM 只包含可见行，打开多 MB 文档为毫秒级（对比 vditor setValue 全量渲染 ~5s/MB）
 * - 增量解析：@codemirror/lang-markdown（Lezer），语法高亮按需，滚动到哪里高亮到哪里
 * - 引擎可替换：与 Vditor 引擎之间通过 main.js 的 getEditorValue()/largeFileMode 状态位衔接，
 *   保存/导出路径零改动
 *
 * 特性：
 * - 行号、撤销/重做（history）、搜索（Ctrl+F 面板）、多选区
 * - 明暗主题跟随应用（oneDark / 默认亮色），通过 Compartment 动态切换
 * - focusLine(line)：大纲跳转到指定行（0-based）
 * - 大文档禁用自动补全（基于词的补全是 O(全文) 操作，对齐 VS Code 的 largeFileOptimizations 思想）
 */
import { EditorView, keymap, lineNumbers, drawSelection, dropCursor,
  highlightActiveLine, highlightSpecialChars, rectangularSelection, crosshairCursor } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';

export class LargeFileEditor {
  /**
   * @param {HTMLElement} hostElement 宿主容器（由调用方控制显隐与布局）
   * @param {{onChange?: (docIsDirty: boolean) => void}} [options]
   */
  constructor(hostElement, options = {}) {
    this.host = hostElement;
    this._options = options || {};
    this._dirty = false;
    this._extensions = null;
    this._themeCompartment = new Compartment();
    this._build();
  }

  _build() {
    const self = this;
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
      highlightSelectionMatches(),
      search({ top: true }),
      EditorState.allowMultipleSelections.of(true),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      markdown({ base: markdownLanguage }),
      this._themeCompartment.of([]),
      localTheme,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          self._dirty = true;
          if (typeof self._options.onChange === 'function') {
            self._options.onChange(true);
          }
        }
      })
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

  /** 整篇替换文档（打开/切换文件时使用；重置撤销栈与脏标记） */
  setValue(text) {
    this.view.setState(EditorState.create({ doc: String(text || ''), extensions: this._extensions }));
    this._dirty = false;
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

  get dirty() {
    return this._dirty;
  }

  destroy() {
    if (this.view) {
      this.view.destroy();
      this.view = null;
    }
  }
}
