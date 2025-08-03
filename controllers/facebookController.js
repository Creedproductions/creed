// controllers/facebookController.js
const axios = require('axios');

async function downloadFacebookVideo(url) {
  console.log(`📘 Processing Facebook URL: ${url}`);

  try {
    // Method 1: Use jer-api for Facebook
    const { facebook } = require('jer-api');

    try {
      const result = await facebook(url);

      if (result && result.data && result.data.length > 0) {
        const videoData = result.data.find(item => item.resolution.includes('720p')) ||
            result.data.find(item => item.resolution.includes('360p')) ||
            result.data[0];

        if (videoData && videoData.url) {
          console.log(`✅ Facebook video extracted with jer-api`);

          return {
            title: result.title || 'Facebook Video',
            url: videoData.url,
            thumbnail: videoData.thumbnail || 'https://via.placeholder.com/300x150',
            isVideo: true
          };
        }
      }
    } catch (jerError) {
      console.warn(`jer-api failed: ${jerError.message}`);
    }

    // Method 2: Try direct page scraping
    try {
      console.log('Trying direct Facebook page scraping...');

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        }
      });

      const html = response.data;

      // Look for video URLs in the page
      const videoPatterns = [
        /"browser_native_hd_url":"([^"]+)"/,
        /"browser_native_sd_url":"([^"]+)"/,
        /"playable_url":"([^"]+)"/,
        /"playable_url_quality_hd":"([^"]+)"/
      ];

      let videoUrl = null;
      let title = 'Facebook Video';

      // Extract title
      const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1];
      }

      // Find video URL
      for (const pattern of videoPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          videoUrl = match[1]
              .replace(/\\u0025/g, '%')
              .replace(/\\u002F/g, '/')
              .replace(/\\\//g, '/')
              .replace(/\\/g, '')
              .replace(/&amp;/g, '&');
          break;
        }
      }

      if (videoUrl) {
        console.log(`✅ Facebook video extracted with direct scraping`);

        return {
          title,
          url: videoUrl,
          thumbnail: 'https://via.placeholder.com/300x150',
          isVideo: true
        };
      }
    } catch (scrapingError) {
      console.warn(`Direct scraping failed: ${scrapingError.message}`);
    }

    throw new Error('All Facebook extraction methods failed');

  } catch (error) {
    console.error(`❌ Facebook extraction error: ${error.message}`);
    throw new Error(`Failed to download Facebook video: ${error.message}`);
  }
}

module.exports = { downloadFacebookVideo };