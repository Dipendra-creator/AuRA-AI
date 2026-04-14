; ─── Aura AI — NSIS Custom Install Script ────────────────────────────────────
; This file is auto-included by electron-builder when placed at build/installer.nsh.
; It runs AFTER the main app files are installed.
;
; Responsibilities:
;   1. Install Tesseract OCR if not already present
;   2. Install MongoDB Community Server if not already present  
;   3. Add Tesseract and MongoDB bin dirs to user PATH

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

!macro customInstall

  ; ─── Tesseract OCR ────────────────────────────────────────────────────────

  ; Check if tesseract.exe is already on PATH
  nsExec::ExecToStack 'cmd /c where tesseract.exe'
  Pop $0
  ${If} $0 != 0
    DetailPrint "Installing Tesseract OCR..."

    ; The tesseract installer must be placed at build/tesseract-ocr-w64-setup.exe
    ; Download from: https://github.com/UB-Mannheim/tesseract/wiki
    ${If} ${FileExists} "$PLUGINSDIR\tesseract-ocr-w64-setup.exe"
      ExecWait '"$PLUGINSDIR\tesseract-ocr-w64-setup.exe" /S /D=$PROGRAMFILES64\Tesseract-OCR'
      ; Add to user PATH
      EnVar::AddValue "PATH" "$PROGRAMFILES64\Tesseract-OCR"
      DetailPrint "Tesseract OCR installed."
    ${Else}
      ; Try to extract from build resources
      SetOutPath "$PLUGINSDIR"
      File /nonfatal "${BUILD_RESOURCES_DIR}\tesseract-ocr-w64-setup.exe"
      ${If} ${FileExists} "$PLUGINSDIR\tesseract-ocr-w64-setup.exe"
        ExecWait '"$PLUGINSDIR\tesseract-ocr-w64-setup.exe" /S /D=$PROGRAMFILES64\Tesseract-OCR'
        EnVar::AddValue "PATH" "$PROGRAMFILES64\Tesseract-OCR"
        DetailPrint "Tesseract OCR installed."
      ${Else}
        DetailPrint "Tesseract installer not found. OCR for scanned PDFs will be unavailable."
        DetailPrint "You can install manually from: https://github.com/UB-Mannheim/tesseract/wiki"
      ${EndIf}
    ${EndIf}
  ${Else}
    DetailPrint "Tesseract OCR already installed."
  ${EndIf}

  ; ─── MongoDB Community Server ──────────────────────────────────────────────

  nsExec::ExecToStack 'cmd /c where mongod.exe'
  Pop $0
  ${If} $0 != 0
    DetailPrint "Installing MongoDB Community Server..."

    ${If} ${FileExists} "$PLUGINSDIR\mongodb-windows-x86_64.msi"
      ExecWait '"msiexec" /i "$PLUGINSDIR\mongodb-windows-x86_64.msi" /quiet /norestart ADDLOCAL="ServerService,Client" SHOULD_INSTALL_COMPASS="0"'
      DetailPrint "MongoDB installed as Windows service."
    ${Else}
      SetOutPath "$PLUGINSDIR"
      File /nonfatal "${BUILD_RESOURCES_DIR}\mongodb-windows-x86_64.msi"
      ${If} ${FileExists} "$PLUGINSDIR\mongodb-windows-x86_64.msi"
        ExecWait '"msiexec" /i "$PLUGINSDIR\mongodb-windows-x86_64.msi" /quiet /norestart ADDLOCAL="ServerService,Client" SHOULD_INSTALL_COMPASS="0"'
        DetailPrint "MongoDB installed as Windows service."
      ${Else}
        DetailPrint "MongoDB installer not found. You can install manually from: https://www.mongodb.com/try/download/community"
      ${EndIf}
    ${EndIf}
  ${Else}
    DetailPrint "MongoDB already installed."
  ${EndIf}

!macroend

!macro customUnInstall
  ; We do NOT uninstall Tesseract or MongoDB on uninstall —
  ; the user may be using them for other projects.
  DetailPrint "Aura AI uninstalled. Tesseract OCR and MongoDB were left intact."
!macroend
