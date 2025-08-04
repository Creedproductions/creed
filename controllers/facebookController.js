// controllers/facebookController.js - STREAMLINED VERSION
const { getFbVideoInfo } = require('fb-downloader-scrapper');

async function downloadFacebookVideo(url) {
  console.log(`Processing Facebook URL: ${url}`);

  try {
    console.log('Using fb-downloader-scrapper...');

    const result = await getFbVideoInfo(url);

    if (result && (result.hd || result.sd)) {
      console.log(`fb-downloader-scrapper success: Found ${result.hd ? 'HD' : 'SD'} quality`);

      // Extract and clean video info
      const videoUrl = result.hd || result.sd;

      // Proper title extraction and cleaning
      let title = 'Facebook Video'; // Default fallback

      if (result.title) {
        // Clean the title properly
        title = result.title
                // Decode HTML entities
                .replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
                .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
                // Clean up common issues
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&nbsp;/g, ' ')
                // Remove extra whitespace
                .trim()
            // If title is empty or just "Facebook", use default
            || 'Facebook Video';

        // If title is still just "Facebook" or very short, try to make it more descriptive
        if (title === 'Facebook' || title.length < 3) {
          title = 'Facebook Video';
        }

        console.log(`Cleaned title: "${title}"`);
      }

      const thumbnail = result.thumbnail || 'https://via.placeholder.com/300x150';
      const duration = result.duration_ms ? Math.round(result.duration_ms / 1000) : null;

      console.log(`Video URL: ${videoUrl.substring(0, 100)}...`);
      console.log(`Title: ${title}`);
      console.log(`Thumbnail: ${thumbnail.substring(0, 100)}...`);

      return {
        success: true,
        data: {
          title: title,
          url: videoUrl,
          thumbnail: thumbnail,
          quality: result.hd ? 'HD Quality' : 'SD Quality',
          duration: duration,
          source: 'facebook'
        }
      };
    } else {
      console.log('fb-downloader-scrapper: No video URLs found in result');
      throw new Error('No video URLs found');
    }
  } catch (error) {
    console.error('fb-downloader-scrapper failed:', error.message);
    throw new Error(`Facebook download failed: ${error.message}`);
  }
}

module.exports = { downloadFacebookVideo };