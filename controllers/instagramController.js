// controllers/instagramController.js
const { igdl } = require('btch-downloader');

async function downloadInstagramMedia(url) {
  console.log(`📷 Processing Instagram URL: ${url}`);

  try {
    const result = await igdl(url);

    if (!result || !Array.isArray(result) || result.length === 0) {
      throw new Error('No Instagram data returned');
    }

    const mediaData = result[0];

    if (!mediaData || !mediaData.url) {
      throw new Error('Invalid Instagram media data');
    }

    console.log(`✅ Instagram media extracted successfully`);

    return {
      title: mediaData.wm || 'Instagram Media',
      url: mediaData.url,
      thumbnail: mediaData.thumbnail || mediaData.url,
      isVideo: mediaData.url.includes('.mp4') || mediaData.url.includes('video')
    };

  } catch (error) {
    console.error(`❌ Instagram extraction error: ${error.message}`);
    throw new Error(`Failed to download Instagram media: ${error.message}`);
  }
}

module.exports = { downloadInstagramMedia };