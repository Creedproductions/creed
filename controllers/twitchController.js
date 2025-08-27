// controllers/twitchController.js
const ytDlp = require('yt-dlp-exec');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function downloadTwitchVideo(url) {
  console.log(`Processing Twitch URL: ${url}`);
  
  const TEMP_DIR = path.join(__dirname, '../temp');
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  
  try {
    // Twitch has both VODs and clips, determine which one
    const isClip = url.includes('/clip/') || url.includes('clips.twitch.tv');
    console.log(`Identified as Twitch ${isClip ? 'clip' : 'VOD or stream'}`);
    
    // First try to get metadata
    console.log('Fetching Twitch video info...');
    
    const info = await ytDlp(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      addHeader: [
        'referer:https://www.twitch.tv',
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Client-ID:kimne78kx3ncx6brgo4mv6wki5h1ko'
      ],
    });
    
    if (info && info.formats && info.formats.length > 0) {
      // Find a good quality format
      const format = info.formats.find(f => 
        f.height >= 720 && f.vcodec !== 'none' && f.acodec !== 'none'
      ) || info.formats.find(f => 
        f.vcodec !== 'none' && f.acodec !== 'none'
      ) || info.formats[0];
      
      return {
        title: info.title || 'Twitch Video',
        url: format.url,
        thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
        isVideo: true
      };
    }
    
    // If direct URL extraction failed, try downloading the file
    console.log('Direct URL extraction failed, trying to download the file...');
    
    const uniqueId = Date.now();
    const tempFilePath = path.join(TEMP_DIR, `twitch-${uniqueId}.mp4`);
    
    // Use yt-dlp to download to file
    const ytDlpPath = require('yt-dlp-exec').path;
    let command;
    
    if (isClip) {
      command = `"${ytDlpPath}" "${url}" -o "${tempFilePath}" --add-header "Referer:https://www.twitch.tv" --add-header "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)" --add-header "Client-ID:kimne78kx3ncx6brgo4mv6wki5h1ko"`;
    } else {
      // For VODs/streams, try to get a specific format
      command = `"${ytDlpPath}" "${url}" -f "best[height<=720]" -o "${tempFilePath}" --add-header "Referer:https://www.twitch.tv" --add-header "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)" --add-header "Client-ID:kimne78kx3ncx6brgo4mv6wki5h1ko"`;
    }
    
    console.log(`Executing command: ${command}`);
    await execPromise(command);
    
    if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 10000) {
      console.log(`Successfully downloaded Twitch video to ${tempFilePath}`);
      const videoUrl = `/api/stream-file?path=${encodeURIComponent(tempFilePath)}`;
      
      return {
        title: info?.title || 'Twitch Video',
        url: videoUrl,
        thumbnail: info?.thumbnail || 'https://via.placeholder.com/300x150',
        isVideo: true,
        localFilePath: tempFilePath
      };
    }
    
    throw new Error('Failed to download Twitch video');
  } catch (error) {
    console.error(`Twitch video extraction error: ${error.message}`);
    
    // Fallback approach - try to get basic info from page
    try {
      console.log('Trying direct page parsing for Twitch...');
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko'
        }
      });
      
      const html = response.data;
      
      // Try to get meta tags
      const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
      const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
      
      // For clips, we can try the direct API
      if (url.includes('/clip/') || url.includes('clips.twitch.tv')) {
        const slugMatch = url.match(/\/clip\/([^\/\?]+)/) || url.match(/clips\.twitch\.tv\/([^\/\?]+)/);
        
        if (slugMatch && slugMatch[1]) {
          const slug = slugMatch[1];
          console.log(`Extracted clip slug: ${slug}`);
          
          // Redirect user to Twitch directly with explanation
          return {
            title: ogTitleMatch && ogTitleMatch[1] ? ogTitleMatch[1] : 'Twitch Clip',
            url: `https://clips.twitch.tv/${slug}/download`,
            thumbnail: ogImageMatch && ogImageMatch[1] ? ogImageMatch[1] : 'https://via.placeholder.com/300x150',
            isVideo: true,
            isTwitchClip: true,
            directUrl: `https://clips.twitch.tv/${slug}/download`
          };
        }
      }
      
      // For VODs - this is difficult without the proper tokens, so redirect to Twitch
      return {
        title: ogTitleMatch && ogTitleMatch[1] ? ogTitleMatch[1] : 'Twitch Video',
        url: url,
        thumbnail: ogImageMatch && ogImageMatch[1] ? ogImageMatch[1] : 'https://via.placeholder.com/300x150',
        isVideo: true,
        isTwitchVod: true,
        note: 'Twitch VODs often require authentication. Please try another downloader or browser extension.'
      };
    } catch (fallbackError) {
      console.error(`Twitch fallback extraction failed: ${fallbackError.message}`);
      throw fallbackError;
    }
  }
}

module.exports = { downloadTwitchVideo };