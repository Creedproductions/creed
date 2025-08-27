// controllers/dailymotionController.js
const ytDlp = require('yt-dlp-exec');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function downloadDailymotionVideo(url) {
  console.log(`Processing Dailymotion URL: ${url}`);
  
  const TEMP_DIR = path.join(__dirname, '../temp');
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  
  try {
    // First try to get metadata
    console.log('Fetching Dailymotion video info...');
    
    const info = await ytDlp(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      addHeader: [
        'referer:https://www.dailymotion.com',
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
        title: info.title || 'Dailymotion Video',
        url: format.url,
        thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
        isVideo: true
      };
    }
    
    // If direct URL extraction failed, try downloading the file
    console.log('Direct URL extraction failed, trying to download the file...');
    
    const uniqueId = Date.now();
    const tempFilePath = path.join(TEMP_DIR, `dailymotion-${uniqueId}.mp4`);
    
    // Use yt-dlp to download to file
    const ytDlpPath = require('yt-dlp-exec').path;
    const command = `"${ytDlpPath}" "${url}" -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" -o "${tempFilePath}" --add-header "Referer:https://www.dailymotion.com" --add-header "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)"`;
    
    console.log(`Executing command: ${command}`);
    await execPromise(command);
    
    if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 10000) {
      console.log(`Successfully downloaded Dailymotion video to ${tempFilePath}`);
      const videoUrl = `/api/stream-file?path=${encodeURIComponent(tempFilePath)}`;
      
      return {
        title: info.title || 'Dailymotion Video',
        url: videoUrl,
        thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
        isVideo: true,
        localFilePath: tempFilePath
      };
    }
    
    throw new Error('Failed to download Dailymotion video');
  } catch (error) {
    console.error(`Dailymotion video extraction error: ${error.message}`);
    
    // Fallback approach - try to locate the metadata directly in the page
    try {
      console.log('Trying direct page parsing for Dailymotion...');
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        }
      });
      
      const html = response.data;
      
      // Try to extract video ID
      const videoIdMatch = url.match(/\/video\/([a-zA-Z0-9]+)/) || 
                          html.match(/video_id\s*=\s*['"](.*?)['"]/);
      
      if (videoIdMatch && videoIdMatch[1]) {
        const videoId = videoIdMatch[1];
        
        // Try to fetch the metadata from Dailymotion API
        const metadataUrl = `https://www.dailymotion.com/player/metadata/video/${videoId}`;
        const metadataResponse = await axios.get(metadataUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.dailymotion.com'
          }
        });
        
        if (metadataResponse.data && metadataResponse.data.qualities) {
          const qualities = metadataResponse.data.qualities;
          
          // Find the best quality
          const availableQualities = ['1080', '720', '480', '380', '240', 'auto'];
          let videoUrl = null;
          
          for (const quality of availableQualities) {
            if (qualities[quality] && qualities[quality][0] && qualities[quality][0].url) {
              videoUrl = qualities[quality][0].url;
              break;
            }
          }
          
          if (videoUrl) {
            return {
              title: metadataResponse.data.title || 'Dailymotion Video',
              url: videoUrl,
              thumbnail: metadataResponse.data.poster_url || 'https://via.placeholder.com/300x150',
              isVideo: true
            };
          }
        }
      }
      
      // Try a simpler approach with meta tags
      const ogVideoMatch = html.match(/<meta property="og:video:url" content="([^"]+)"/i) ||
                          html.match(/<meta property="og:video" content="([^"]+)"/i);
      const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
      const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
      
      if (ogVideoMatch && ogVideoMatch[1]) {
        return {
          title: ogTitleMatch && ogTitleMatch[1] ? ogTitleMatch[1] : 'Dailymotion Video',
          url: ogVideoMatch[1],
          thumbnail: ogImageMatch && ogImageMatch[1] ? ogImageMatch[1] : 'https://via.placeholder.com/300x150',
          isVideo: true
        };
      }
      
      throw new Error('Could not extract video URL from Dailymotion page');
    } catch (fallbackError) {
      console.error(`Dailymotion fallback extraction failed: ${fallbackError.message}`);
      throw fallbackError;
    }
  }
}

module.exports = { downloadDailymotionVideo };