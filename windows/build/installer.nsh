!include "LogicLib.nsh"
!include "WinMessages.nsh"

!macro HandleHobUserPathResult
  Pop $0
  Pop $1
  ${If} $0 == 0
    SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
  ${ElseIf} $0 != 10
    DetailPrint "Hobgoblin user PATH update failed (exit $0): $1"
    ${IfNot} ${Silent}
      MessageBox MB_OK|MB_ICONEXCLAMATION "Hobgoblin could not update your user PATH.$\r$\n$\r$\n$1"
    ${EndIf}
  ${EndIf}
!macroend

!macro customInstall
  File /oname=$PLUGINSDIR\windows-user-path.ps1 "${PROJECT_DIR}\build\windows-user-path.ps1"
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\windows-user-path.ps1" -Action "Add" -Entry "$INSTDIR\resources\bin"'
  !insertmacro HandleHobUserPathResult
!macroend

!macro customUnInstall
  File /oname=$PLUGINSDIR\windows-user-path.ps1 "${PROJECT_DIR}\build\windows-user-path.ps1"
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\windows-user-path.ps1" -Action "Remove" -Entry "$INSTDIR\resources\bin"'
  !insertmacro HandleHobUserPathResult
!macroend
