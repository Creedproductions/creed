// controllers/tiktokController.js
const { ttdl } = require('btch-downloader');

async function downloadTikTokVideo(url) {
  console.log(`🎵 Processing TikTok URL: ${url}`);

  try {
    const result = await ttdl(url);

    if (!result) {
      throw new Error('No TikTok data returned');
    }

    console.log(`✅ TikTok video extracted successfully`);

    return {
      title: result.title || 'TikTok Video',
      url: result.video?.[0] || result.url || '',
      thumbnail: result.thumbnail || 'https://via.placeholder.com/300x150',
      isVideo: true
    };

  } catch (error) {
    console.error(`❌ TikTok extraction error: ${error.message}`);
    throw new Error(`Failed to download TikTok video: ${error.message}`);
  }
}

module.exports = { downloadTikTokVideo };