// controllers/soundcloudController.js
const ytDlp = require('yt-dlp-exec');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function downloadSoundCloudAudio(url) {
  console.log(`Processing SoundCloud URL: ${url}`);
  
  const TEMP_DIR = path.join(__dirname, '../temp');
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  
  try {
    // First, try to get metadata to check if track is available
    const info = await ytDlp(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      addHeader: [
        'referer:https://soundcloud.com',
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ],
    });
    
    if (info && info.url) {
      return {
        title: info.title || 'SoundCloud Audio',
        url: info.url,
        thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
        isAudio: true
      };
    }
    
    // If we didn't get a direct URL, try downloading the file
    const uniqueId = Date.now();
    const tempFilePath = path.join(TEMP_DIR, `soundcloud-${uniqueId}.mp3`);
    
    // Use yt-dlp to extract audio to file
    const ytDlpPath = require('yt-dlp-exec').path;
    const command = `"${ytDlpPath}" -x --audio-format mp3 --audio-quality 0 -o "${tempFilePath}" "${url}" --add-header "Referer:https://soundcloud.com" --add-header "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)"`;
    
    console.log(`Executing command: ${command}`);
    await execPromise(command);
    
    if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 10000) {
      console.log(`Successfully downloaded SoundCloud audio to ${tempFilePath}`);
      const audioUrl = `/api/stream-file?path=${encodeURIComponent(tempFilePath)}`;
      
      return {
        title: info.title || 'SoundCloud Audio',
        url: audioUrl,
        thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
        isAudio: true,
        localFilePath: tempFilePath
      };
    }
    
    throw new Error('Failed to download SoundCloud audio');
  } catch (error) {
    console.error(`SoundCloud audio extraction error: ${error.message}`);
    
    // Fallback approach - try to locate the stream URL directly
    try {
      console.log('Trying direct page parsing for SoundCloud...');
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        }
      });
      
      const html = response.data;
      
      // Try to extract track metadata from JSON data in page
      const jsonDataMatch = html.match(/window\.__sc_hydration\s*=\s*(\[.*?\]);/);
      if (jsonDataMatch && jsonDataMatch[1]) {
        try {
          const hydrationData = JSON.parse(jsonDataMatch[1]);
          const trackData = hydrationData.find(item => item.hydratable === 'sound');
          
          if (trackData && trackData.data) {
            const title = trackData.data.title || 'SoundCloud Audio';
            let streamUrl = null;
            
            // Look for streaming URL
            if (trackData.data.media && trackData.data.media.transcodings) {
              const mp3Stream = trackData.data.media.transcodings.find(
                t => t.format.protocol === 'progressive' && t.format.mime_type.includes('audio/mpeg')
              );
              
              if (mp3Stream && mp3Stream.url) {
                // Need to get the actual URL from the API URL
                const clientId = html.match(/client_id=([^&"]+)/);
                if (clientId && clientId[1]) {
                  const apiUrl = `${mp3Stream.url}?client_id=${clientId[1]}`;
                  const apiResponse = await axios.get(apiUrl);
                  
                  if (apiResponse.data && apiResponse.data.url) {
                    streamUrl = apiResponse.data.url;
                  }
                }
              }
            }
            
            if (streamUrl) {
              return {
                title,
                url: streamUrl,
                thumbnail: trackData.data.artwork_url || 'https://via.placeholder.com/300x150',
                isAudio: true
              };
            }
          }
        } catch (jsonError) {
          console.error('Error parsing SoundCloud JSON data:', jsonError);
        }
      }
      
      throw new Error('Could not extract stream URL from SoundCloud page');
    } catch (fallbackError) {
      console.error(`SoundCloud fallback extraction failed: ${fallbackError.message}`);
      throw fallbackError;
    }
  }
}

module.exports = { downloadSoundCloudAudio };