// controllers/musicPlatformController.js
const ytDlp = require('yt-dlp-exec');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function downloadMusicPlatformAudio(url, platform) {
  console.log(`Processing ${platform} URL: ${url}`);
  
  const TEMP_DIR = path.join(__dirname, '../temp');
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  
  // Get the domain for referer header
  const domain = url.match(/https?:\/\/([^\/]+)/)[1];
  const referer = `https://${domain}`;
  
  try {
    // Try to extract with yt-dlp
    console.log(`Using yt-dlp to extract audio from ${platform}...`);
    
    const uniqueId = Date.now();
    const tempFilePath = path.join(TEMP_DIR, `${platform}-${uniqueId}.mp3`);
    
    // Use yt-dlp to extract audio
    const ytDlpPath = require('yt-dlp-exec').path;
    const command = `"${ytDlpPath}" "${url}" -x --audio-format mp3 --audio-quality 0 -o "${tempFilePath}" --add-header "Referer:${referer}" --add-header "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)"`;
    
    console.log(`Executing command: ${command}`);
    await execPromise(command);
    
    if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 10000) {
      console.log(`Successfully downloaded ${platform} audio to ${tempFilePath}`);
      const audioUrl = `/api/stream-file?path=${encodeURIComponent(tempFilePath)}`;
      
      // Try to get metadata
      let title = `${platform} Audio`;
      let thumbnail = 'https://via.placeholder.com/300x150';
      
      try {
        // Get metadata
        const info = await ytDlp(url, {
          dumpSingleJson: true,
          skipDownload: true,
          noCheckCertificates: true,
          noWarnings: true,
        });
        
        if (info) {
          title = info.title || title;
          thumbnail = info.thumbnail || thumbnail;
        }
      } catch (metadataError) {
        console.warn(`Could not get metadata for ${platform}: ${metadataError.message}`);
      }
      
      return {
        title,
        url: audioUrl,
        thumbnail,
        isAudio: true,
        localFilePath: tempFilePath
      };
    }
    
    throw new Error(`Failed to download ${platform} audio`);
  } catch (error) {
    console.error(`${platform} audio extraction error: ${error.message}`);
    
    // Fallback - try to get page metadata and search YouTube as a last resort
    try {
      console.log(`Trying to extract metadata from ${platform} page...`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Referer': referer
        }
      });
      
      const html = response.data;
      
      // Try to extract title from meta tags
      const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i) || 
                         html.match(/<title>([^<]+)<\/title>/i);
      
      const artistMatch = html.match(/<meta property="og:description" content="([^"]+)"/i) ||
                          html.match(/<meta name="description" content="([^"]+)"/i);
      
      const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
      
      if (titleMatch && titleMatch[1]) {
        const title = titleMatch[1].replace(` | ${platform}`, '').replace(` - ${platform}`, '').trim();
        const artist = artistMatch && artistMatch[1] ? artistMatch[1].split('·')[0].trim() : '';
        const thumbnail = imageMatch && imageMatch[1] ? imageMatch[1] : 'https://via.placeholder.com/300x150';
        
        const searchQuery = `${artist ? artist + ' - ' : ''}${title} audio`;
        console.log(`Using search query for YouTube: ${searchQuery}`);
        
        // Use yt-dlp to search and download from YouTube
        const uniqueId = Date.now();
        const tempFilePath = path.join(TEMP_DIR, `${platform}-${uniqueId}.mp3`);
        
        const ytDlpPath = require('yt-dlp-exec').path;
        const command = `"${ytDlpPath}" "ytsearch:${searchQuery.replace(/"/g, '\\"')}" -x --audio-format mp3 --audio-quality 0 -o "${tempFilePath}" --max-downloads 1`;
        
        console.log(`Executing command: ${command}`);
        await execPromise(command);
        
        if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 10000) {
          console.log(`Successfully downloaded audio to ${tempFilePath}`);
          const audioUrl = `/api/stream-file?path=${encodeURIComponent(tempFilePath)}`;
          
          return {
            title: `${artist ? artist + ' - ' : ''}${title}`,
            url: audioUrl,
            thumbnail,
            isAudio: true,
            localFilePath: tempFilePath,
            note: `This is a YouTube search result for the ${platform} track.`
          };
        }
      }
      
      throw new Error(`Could not extract track information from ${platform} page`);
    } catch (fallbackError) {
      console.error(`${platform} fallback extraction failed: ${fallbackError.message}`);
      throw fallbackError;
    }
  }
}

module.exports = { downloadMusicPlatformAudio };