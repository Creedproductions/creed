// controllers/vimeoController.js
const ytDlp = require('yt-dlp-exec');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function downloadVimeoVideo(url) {
  console.log(`Processing Vimeo URL: ${url}`);
  
  const TEMP_DIR = path.join(__dirname, '../temp');
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  
  try {
    // First try to get metadata to check if the video is available
    console.log('Fetching Vimeo video info...');
    
    const info = await ytDlp(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      addHeader: [
        'referer:https://vimeo.com',
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ],
    });
    
    if (info && info.formats && info.formats.length > 0) {
      // Find a good quality format with video and audio
      const format = info.formats.find(f => 
        f.height >= 720 && f.vcodec !== 'none' && f.acodec !== 'none'
      ) || info.formats.find(f => 
        f.vcodec !== 'none' && f.acodec !== 'none'
      ) || info.formats[0];
      
      return {
        title: info.title || 'Vimeo Video',
        url: format.url,
        thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
        isVideo: true,
        height: format.height,
        width: format.width
      };
    }
    
    // If direct URL extraction failed, try downloading the file
    console.log('Direct URL extraction failed, trying to download the file...');
    
    const uniqueId = Date.now();
    const tempFilePath = path.join(TEMP_DIR, `vimeo-${uniqueId}.mp4`);
    
    // Use yt-dlp to download to file
    const ytDlpPath = require('yt-dlp-exec').path;
    const command = `"${ytDlpPath}" "${url}" -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" -o "${tempFilePath}" --add-header "Referer:https://vimeo.com" --add-header "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)"`;
    
    console.log(`Executing command: ${command}`);
    await execPromise(command);
    
    if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 10000) {
      console.log(`Successfully downloaded Vimeo video to ${tempFilePath}`);
      const videoUrl = `/api/stream-file?path=${encodeURIComponent(tempFilePath)}`;
      
      return {
        title: info.title || 'Vimeo Video',
        url: videoUrl,
        thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
        isVideo: true,
        localFilePath: tempFilePath
      };
    }
    
    throw new Error('Failed to download Vimeo video');
  } catch (error) {
    console.error(`Vimeo video extraction error: ${error.message}`);
    
    // Fallback approach - try to locate the config data directly in the page
    try {
      console.log('Trying direct page parsing for Vimeo...');
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        }
      });
      
      const html = response.data;
      
      // Try to extract the video config JSON
      const configMatch = html.match(/var config\s*=\s*(\{.+?\});/) || 
                         html.match(/window\.vimeo\.config\s*=\s*(\{.+?\});/);
      
      if (configMatch && configMatch[1]) {
        try {
          const config = JSON.parse(configMatch[1]);
          
          if (config.request && config.request.files && config.request.files.progressive) {
            // Sort by quality (descending)
            const progressiveFiles = config.request.files.progressive.sort((a, b) => b.height - a.height);
            
            if (progressiveFiles.length > 0) {
              const bestQuality = progressiveFiles[0];
              
              return {
                title: config.video.title || 'Vimeo Video',
                url: bestQuality.url,
                thumbnail: config.video.thumbs && config.video.thumbs.base ? config.video.thumbs.base : 'https://via.placeholder.com/300x150',
                isVideo: true,
                height: bestQuality.height,
                width: bestQuality.width
              };
            }
          }
        } catch (jsonError) {
          console.error('Error parsing Vimeo config JSON:', jsonError);
        }
      }
      
      // Try a simpler approach with meta tags
      const ogVideoMatch = html.match(/<meta property="og:video:url" content="([^"]+)"/i);
      const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
      const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
      
      if (ogVideoMatch && ogVideoMatch[1]) {
        return {
          title: ogTitleMatch && ogTitleMatch[1] ? ogTitleMatch[1] : 'Vimeo Video',
          url: ogVideoMatch[1],
          thumbnail: ogImageMatch && ogImageMatch[1] ? ogImageMatch[1] : 'https://via.placeholder.com/300x150',
          isVideo: true
        };
      }
      
      throw new Error('Could not extract video URL from Vimeo page');
    } catch (fallbackError) {
      console.error(`Vimeo fallback extraction failed: ${fallbackError.message}`);
      throw fallbackError;
    }
  }
}

module.exports = { downloadVimeoVideo };