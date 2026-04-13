; MarkEdit NSIS Installer Hooks
; 在安装完成后手动注册文件关联，将 MarkEdit.md 写入各扩展名的 OpenWithProgids，
; 使右键菜单"打开方式"中出现 MarkEdit。

!macro NSIS_HOOK_POSTINSTALL
  ; -----------------------------------------------------------------
  ; 注册主要文本/Markdown 文件类型到 "打开方式" 列表
  ; -----------------------------------------------------------------

  ; Markdown
  WriteRegStr HKCU "Software\Classes\.md\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.markdown\OpenWithProgids" "MarkEdit.md" ""

  ; 纯文本
  WriteRegStr HKCU "Software\Classes\.txt\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.text\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.log\OpenWithProgids" "MarkEdit.md" ""

  ; 代码文件
  WriteRegStr HKCU "Software\Classes\.js\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.jsx\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.ts\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.tsx\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.py\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.java\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.c\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.cpp\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.h\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.rs\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.go\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.html\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.css\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.json\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.xml\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.yaml\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.yml\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.toml\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.ini\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.sh\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.ps1\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.csv\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.sql\OpenWithProgids" "MarkEdit.md" ""
  WriteRegStr HKCU "Software\Classes\.env\OpenWithProgids" "MarkEdit.md" ""

  ; -----------------------------------------------------------------
  ; 通知 Shell 更新文件关联（刷新图标和右键菜单）
  ; -----------------------------------------------------------------
  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro NSIS_HOOK_UNINSTALL
  ; 卸载时清除 OpenWithProgids 中的 MarkEdit.md 条目
  DeleteRegValue HKCU "Software\Classes\.md\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.markdown\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.txt\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.text\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.log\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.js\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.jsx\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.ts\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.tsx\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.py\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.java\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.c\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.cpp\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.h\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.rs\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.go\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.html\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.css\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.json\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.xml\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.yaml\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.yml\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.toml\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.ini\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.sh\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.ps1\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.csv\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.sql\OpenWithProgids" "MarkEdit.md"
  DeleteRegValue HKCU "Software\Classes\.env\OpenWithProgids" "MarkEdit.md"

  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
