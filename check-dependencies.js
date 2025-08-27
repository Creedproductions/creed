// check-dependencies.js
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function checkDependencies() {
  console.log('Checking dependencies for social media downloader...');
  
  // Create directories
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    console.log('Creating temp directory...');
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // Check for yt-dlp
  try {
    const ytDlpPath = require('yt-dlp-exec').path;
    console.log(`yt-dlp found at: ${ytDlpPath}`);
    
    // Try to update yt-dlp
    console.log('Updating yt-dlp...');
    await execPromise(`"${ytDlpPath}" --update`);
  } catch (error) {
    console.error('Error with yt-dlp:', error);
    console.log('Installing yt-dlp...');
    await execPromise('npm install yt-dlp-exec@latest');
  }
  
  // Check for ffmpeg (needed for audio extraction and some video processing)
  try {
    const { stdout } = await execPromise('ffmpeg -version');
    console.log('ffmpeg is installed:', stdout.split('\n')[0]);
  } catch (error) {
    console.error('ffmpeg is not installed or not in PATH. Please install ffmpeg for full functionality.');
    console.log('You can download ffmpeg from: https://ffmpeg.org/download.html');
  }
  
  // Check for node-fetch for fallback approaches
  try {
    require('node-fetch');
    console.log('node-fetch is installed.');
  } catch (error) {
    console.error('node-fetch is not installed');
    console.log('Installing node-fetch...');
    await execPromise('npm install node-fetch@2');
  }
  
  console.log('Dependency check completed.');
}

checkDependencies()
  .then(() => {
    console.log('Ready to start the server.');
  })
  .catch(error => {
    console.error('Error checking dependencies:', error);
  });