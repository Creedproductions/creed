// controllers/facebookController.js
const snapsave = require("metadownloader");
const { shortenUrl } = require("../utils/urlShortener");

async function facebookInsta(url) {
  try {
    console.log(`Calling metadownloader with URL: ${url}`);
    const result = await snapsave(url);
    console.log('Metadownloader raw result:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('Metadownloader error:', error);
    throw new Error("Error fetching media: " + error.message);
  }
}

async function downloadFacebookVideo(url) {
  console.log(`Processing Facebook URL: ${url}`);

  try {
    console.log('Using metadownloader (snapsave)...');

    const result = await facebookInsta(url);

    if (result && result.data && result.data.length > 0) {
      console.log(`metadownloader success: Found ${result.data.length} media items`);

      // Get the first/best quality video
      const videoLink = result.data[0];
      const videoUrl = videoLink.url;

      // Shorten the main video URL
      console.log('Shortening Facebook download URL...');
      const shortenedUrl = await shortenUrl(videoUrl);

      // Extract title with fallback
      let title = result.title || 'Facebook Video';
      
      // Clean the title
      if (title) {
        title = title
          .replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
          .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&nbsp;/g, ' ')
          .trim();

        if (title.length < 3 || title === 'Facebook') {
          title = 'Facebook Video';
        }
      }

      const thumbnail = result.thumbnail || 'https://via.placeholder.com/300x150';
      const duration = result.duration || null;

      console.log(`Video URL: ${videoUrl.substring(0, 100)}...`);
      console.log(`Shortened URL: ${shortenedUrl.substring(0, 100)}...`);
      console.log(`Title: ${title}`);
      console.log(`Thumbnail: ${thumbnail.substring(0, 100)}...`);

      // Create formats array from all available links with shortened URLs
      const availableFormats = await Promise.all(
        result.data.map(async (link, index) => {
          const shortenedFormatUrl = await shortenUrl(link.url);
          return {
            itag: index.toString(),
            quality: link.resolution || 'Unknown',
            url: shortenedFormatUrl,
            mimeType: 'video/mp4',
            hasAudio: true,
            hasVideo: true,
            contentLength: 0
          };
        })
      );

      return {
        success: true,
        data: {
          title: title,
          url: shortenedUrl,
          thumbnail: thumbnail,
          quality: videoLink.resolution || 'Best Available',
          duration: duration,
          source: 'facebook',
          formats: availableFormats
        }
      };
    } else {
      console.log('metadownloader: No video URLs found in result');
      console.log('Result structure:', result ? Object.keys(result) : 'null result');
      
      if (!result) {
        throw new Error('No response from metadownloader API');
      } else if (!result.data) {
        throw new Error('Invalid response format: no data property found');
      } else if (result.data.length === 0) {
        throw new Error('No downloadable links found for this Facebook video');
      } else {
        throw new Error('Unknown error: data exists but is invalid');
      }
    }
  } catch (error) {
    console.error('metadownloader failed:', error.message);
    
    // Provide more helpful error messages
    if (error.message.includes('Error fetching media:')) {
      throw new Error(`Facebook download failed: ${error.message}`);
    } else if (error.message.includes('No response') || error.message.includes('Invalid response')) {
      throw new Error(`Facebook download failed: ${error.message}. The video might be private, deleted, or the URL is invalid.`);
    } else {
      throw new Error(`Facebook download failed: ${error.message}`);
    }
  }
}

module.exports = { downloadFacebookVideo, facebookInsta };