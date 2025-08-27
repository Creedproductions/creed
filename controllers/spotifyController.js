// controllers/spotifyController.js
const ytDlp = require('yt-dlp-exec');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function downloadSpotifyAudio(url) {
  console.log(`Processing Spotify URL: ${url}`);
  
  const TEMP_DIR = path.join(__dirname, '../temp');
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  
  try {
    // First, try to get metadata to extract title, artist, etc.
    console.log('Fetching Spotify track metadata...');
    
    const info = await ytDlp(url, {
      dumpSingleJson: true,
      skipDownload: true,
      noCheckCertificates: true,
      noWarnings: true,
      addHeader: [
        'referer:https://open.spotify.com',
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ],
    });
    
    // For Spotify, direct URLs aren't provided, so we need to download from YouTube or other source
    if (info && info.title) {
      const searchQuery = `${info.artist ? info.artist + ' - ' : ''}${info.title} audio`;
      console.log(`Using search query for YouTube: ${searchQuery}`);
      
      // Use yt-dlp to search and download from YouTube
      const uniqueId = Date.now();
      const tempFilePath = path.join(TEMP_DIR, `spotify-${uniqueId}.mp3`);
      
      const ytDlpPath = require('yt-dlp-exec').path;
      const command = `"${ytDlpPath}" "ytsearch:${searchQuery.replace(/"/g, '\\"')}" -x --audio-format mp3 --audio-quality 0 -o "${tempFilePath}" --max-downloads 1`;
      
      console.log(`Executing command: ${command}`);
      await execPromise(command);
      
      if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 10000) {
        console.log(`Successfully downloaded audio to ${tempFilePath}`);
        const audioUrl = `/api/stream-file?path=${encodeURIComponent(tempFilePath)}`;
        
        return {
          title: `${info.artist ? info.artist + ' - ' : ''}${info.title}`,
          url: audioUrl,
          thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
          isAudio: true,
          localFilePath: tempFilePath,
          originalSpotifyUrl: url
        };
      }
    }
    
    throw new Error('Could not find audio for Spotify track');
  } catch (error) {
    console.error(`Spotify extraction error: ${error.message}`);
    
    // Fallback approach - try to extract track info and search YouTube
    try {
      console.log('Trying direct page parsing for Spotify...');
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        }
      });
      
      const html = response.data;
      
      // Extract title and artist from meta tags
      const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
      const artistMatch = html.match(/<meta property="og:description" content="([^"]+)"/i);
      const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
      
      if (titleMatch && titleMatch[1]) {
        const title = titleMatch[1];
        const artist = artistMatch && artistMatch[1] ? artistMatch[1].split('·')[0].trim() : '';
        const thumbnail = imageMatch && imageMatch[1] ? imageMatch[1] : 'https://via.placeholder.com/300x150';
        
        const searchQuery = `${artist ? artist + ' - ' : ''}${title} audio`;
        console.log(`Using search query for YouTube: ${searchQuery}`);
        
        // Use yt-dlp to search and download from YouTube
        const uniqueId = Date.now();
        const tempFilePath = path.join(TEMP_DIR, `spotify-${uniqueId}.mp3`);
        
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
            originalSpotifyUrl: url
          };
        }
      }
      
      throw new Error('Could not extract track information from Spotify page');
    } catch (fallbackError) {
      console.error(`Spotify fallback extraction failed: ${fallbackError.message}`);
      throw fallbackError;
    }
  }
}

module.exports = { downloadSpotifyAudio };