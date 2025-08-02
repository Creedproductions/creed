@echo off
echo 🚀 Installing Social Media Download Server...

REM First, clean any existing node_modules
echo 🧹 Cleaning existing installation...
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del package-lock.json

REM Install core dependencies first
echo 📦 Installing core dependencies...
npm install --no-optional

REM Try to install Python-dependent packages separately
echo 🐍 Attempting to install Python-dependent packages...
echo    This may fail if Python is not installed - that's okay!

REM Check if Python is available
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo ✅ Python found, installing youtube-dl-exec...
    npm install youtube-dl-exec@2.4.6
) else (
    python3 --version >nul 2>&1
    if %errorlevel% == 0 (
        echo ✅ Python3 found, installing youtube-dl-exec...
        npm install youtube-dl-exec@2.4.6
    ) else (
        echo ⚠️  Python not found. YouTube downloading will use ytdl-core only.
        echo    This is fine - the server will work without Python!
    )
)

REM Install optional dependencies that don't require Python
echo 🔧 Installing optional dependencies...
npm install puppeteer-core@21.3.8 --save-optional 2>nul || echo    puppeteer-core install failed ^(skipping^)

echo.
echo ✅ Installation complete!
echo.
echo 🎯 Available features:
echo    ✅ Instagram ^(btch-downloader^)
echo    ✅ TikTok ^(btch-downloader^)
echo    ✅ Facebook ^(@mrnima/facebook-downloader^)
echo    ✅ Twitter ^(btch-downloader^)
echo    ✅ YouTube ^(ytdl-core^)
echo    ✅ Pinterest ^(controller^)
echo    ✅ Threads ^(direct parsing^)
echo.
echo 🚀 To start the server:
echo    npm start
echo.
echo 🔧 To run in development mode:
echo    npm run dev

pause