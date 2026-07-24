!include LogicLib.nsh

!macro preInit
  ; プロセスチェックを無効化
  !define CUSTOM_PROCESS_KILLER
  !define PROCESS_NAME "パス変換ツール.exe"
!macroend

!macro customInit
  ; インストール前の処理
  ${if} ${RunningX64}
    SetRegView 64
  ${endif}
!macroend

!macro customInstall
  ; インストール時の処理
  ${if} ${RunningX64}
    SetRegView 64
  ${endif}
!macroend

!macro customUnInstall
  ; アンインストール時の処理
  SetShellVarContext current
  RMDir /r "$INSTDIR"
  RMDir /r "$APPDATA\パス変換ツール"
  DeleteRegKey HKCU "Software\パス変換ツール"
!macroend 
