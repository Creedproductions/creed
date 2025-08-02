#!/bin/bash

echo "🚀 Installing Social Media Download Server..."

# First, clean any existing node_modules
echo "🧹 Cleaning existing installation..."
rm -rf node_modules package-lock.json

# Install core dependencies first
echo "📦 Installing core dependencies..."
npm install --no-optional

# Try to install Python-dependent packages separately
echo "🐍 Attempting to install Python-dependent packages..."
echo "   This may fail if Python is not installed - that's okay!"

# Check if Python is available
if command -v python3 &> /dev/null; then
    echo "✅ Python3 found, installing youtube-dl-exec..."
    npm install youtube-dl-exec@2.4.6
elif command -v python &> /dev/null; then
    echo "✅ Python found, installing youtube-dl-exec..."
    npm install youtube-dl-exec@2.4.6
else
    echo "⚠️  Python not found. YouTube downloading will use ytdl-core only."
    echo "   This is fine - the server will work without Python!"
fi

# Install optional dependencies that don't require Python
echo "🔧 Installing optional dependencies..."
npm install puppeteer-core@21.3.8 --save-optional 2>/dev/null || echo "   puppeteer-core install failed (skipping)"

echo ""
echo "✅ Installation complete!"
echo ""
echo "🎯 Available features:"
echo "   ✅ Instagram (btch-downloader)"
echo "   ✅ TikTok (btch-downloader)"
echo "   ✅ Facebook (@mrnima/facebook-downloader)"
echo "   ✅ Twitter (btch-downloader)"
echo "   ✅ YouTube (ytdl-core)"
echo "   ✅ Pinterest (controller)"
echo "   ✅ Threads (direct parsing)"
echo ""
echo "🚀 To start the server:"
echo "   npm start"
echo ""
echo "🔧 To run in development mode:"
echo "   npm run dev"