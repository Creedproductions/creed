// controllers/youtubeController.js
const ytdl = require('@distube/ytdl-core');

async function downloadYouTubeVideo(url) {
  console.log(`Processing YouTube URL: ${url}`);

  try {
    // Validate URL
    if (!ytdl.validateURL(url)) {
      throw new Error('Invalid YouTube URL');
    }

    // Get video info
    const info = await ytdl.getInfo(url, {
      requestOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }
    });

    // Choose best format with both video and audio
    const format = ytdl.chooseFormat(info.formats, {
      quality: 'highestvideo',
      filter: 'audioandvideo'
    });

    if (!format) {
      // Fallback to any format with audio
      const audioFormat = ytdl.chooseFormat(info.formats, {
        filter: 'audioonly'
      });

      if (audioFormat) {
        return {
          success: true,
          data: {
            title: info.videoDetails.title,
            url: audioFormat.url,
            thumbnail: info.videoDetails.thumbnails[0]?.url || '',
            quality: 'Audio Only',
            source: 'youtube'
          }
        };
      }

      throw new Error('No suitable format found');
    }

    return {
      success: true,
      data: {
        title: info.videoDetails.title,
        url: format.url,
        thumbnail: info.videoDetails.thumbnails[0]?.url || '',
        quality: format.qualityLabel || 'Best Quality',
        source: 'youtube',
        formats: info.formats.map(f => ({
          itag: f.itag,
          quality: f.qualityLabel || 'Unknown',
          url: f.url,
          mimeType: f.mimeType,
          hasAudio: f.hasAudio,
          hasVideo: f.hasVideo
        }))
      }
    };

  } catch (error) {
    console.error('YouTube download error:', error.message);
    throw new Error(`YouTube download failed: ${error.message}`);
  }
}

module.exports = { downloadYouTubeVideo };