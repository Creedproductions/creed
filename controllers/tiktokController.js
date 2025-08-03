// controllers/tiktokController.js
const axios = require('axios');
const ytDlp = require('yt-dlp-exec');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

async function downloadTikTokVideo(url) {
  console.log(`Processing TikTok URL: ${url}`);

  try {
    // First try yt-dlp extraction
    try {
      console.log('Trying yt-dlp extraction for TikTok...');

      const info = await ytDlp(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: [
          'referer:https://www.tiktok.com/',
          'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ],
      });

      if (info && info.url) {
        return {
          title: info.title || 'TikTok Video',
          url: info.url,
          thumbnail: info.thumbnail,
        };
      }

      throw new Error('yt-dlp did not return valid TikTok video URL');
    } catch (ytdlpError) {
      console.warn(`yt-dlp extraction failed: ${ytdlpError.message}`);

      // Try direct download to file
      console.log('Trying direct download for TikTok...');

      const TEMP_DIR = path.join(__dirname, '../temp');
      if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
      }

      const uniqueId = Date.now();
      const tempFilePath = path.join(TEMP_DIR, `tiktok-${uniqueId}.mp4`);

      await ytDlp(url, {
        output: tempFilePath,
        format: 'best[ext=mp4]/best',
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: [
          'referer:https://www.tiktok.com/',
          'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ],
      });

      if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 10000) {
        console.log(`Successfully downloaded TikTok video to ${tempFilePath}`);
        const videoUrl = `/api/stream-file?path=${encodeURIComponent(tempFilePath)}`;

        return {
          title: 'TikTok Video',
          url: videoUrl,
          thumbnail: 'https://via.placeholder.com/300x150',
          localFilePath: tempFilePath
        };
      }

      throw new Error('Failed to download TikTok video');
    }
  } catch (error) {
    console.error(`TikTok video extraction error: ${error.message}`);
    throw error;
  }
}

module.exports = { downloadTikTokVideo };