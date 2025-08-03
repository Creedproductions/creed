// controllers/youtubeController.js
const ytdl = require('ytdl-core');

// Normalize YouTube URLs (convert shorts to regular format)
function normalizeYouTubeUrl(url) {
  const shortsRegex = /youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/;
  const match = url.match(shortsRegex);
  if (match) {
    return `https://www.youtube.com/watch?v=${match[1]}`;
  }
  return url;
}

async function downloadYouTubeVideo(url) {
  console.log(`📺 Processing YouTube URL: ${url}`);

  try {
    // Normalize the URL first
    const processedUrl = normalizeYouTubeUrl(url);

    // Method 1: Try jer-api first
    try {
      const { ytdl: jerYtdl } = require('jer-api');

      const result = await jerYtdl(processedUrl);

      if (result && result.data && result.data.mp4) {
        console.log(`✅ YouTube video extracted with jer-api`);

        return {
          title: result.data.info?.title || 'YouTube Video',
          url: result.data.mp4,
          thumbnail: result.data.info?.thumbnail || 'https://via.placeholder.com/300x150',
          isVideo: true
        };
      }
    } catch (jerError) {
      console.warn(`jer-api failed: ${jerError.message}`);
    }

    // Method 2: Use ytdl-core as fallback
    try {
      console.log('Trying ytdl-core for YouTube...');

      if (!ytdl.validateURL(processedUrl)) {
        throw new Error('Invalid YouTube URL');
      }

      const info = await ytdl.getInfo(processedUrl);

      if (!info || !info.formats || info.formats.length === 0) {
        throw new Error('No video formats found');
      }

      // Find the best format (video + audio)
      const format = info.formats.find(f =>
          f.hasVideo && f.hasAudio && f.container === 'mp4'
      ) || info.formats.find(f =>
          f.hasVideo && f.hasAudio
      ) || info.formats.find(f =>
          f.hasVideo
      ) || info.formats[0];

      if (!format || !format.url) {
        throw new Error('No suitable video format found');
      }

      console.log(`✅ YouTube video extracted with ytdl-core`);

      return {
        title: info.videoDetails?.title || 'YouTube Video',
        url: format.url,
        thumbnail: info.videoDetails?.thumbnails?.[0]?.url || 'https://via.placeholder.com/300x150',
        isVideo: true
      };

    } catch (ytdlError) {
      console.error(`ytdl-core failed: ${ytdlError.message}`);
      throw ytdlError;
    }

  } catch (error) {
    console.error(`❌ YouTube extraction error: ${error.message}`);
    throw new Error(`Failed to download YouTube video: ${error.message}`);
  }
}

module.exports = { downloadYouTubeVideo };