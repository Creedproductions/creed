// controllers/youtubeController.js
const ytdl = require('@distube/ytdl-core');
const youtubeDl = require('youtube-dl-exec');

async function downloadYouTubeVideo(url) {
  console.log(`Processing YouTube URL: ${url}`);

  try {
    // Method 1: Try @distube/ytdl-core first
    if (!ytdl.validateURL(url)) {
      throw new Error('Invalid YouTube URL');
    }

    console.log('Getting YouTube info with @distube/ytdl-core...');
    const info = await ytdl.getInfo(url, {
      requestOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }
    });

    console.log(`Found ${info.formats.length} formats for: ${info.videoDetails.title}`);

    // Smart format selection
    let selectedFormat = null;

    // Try video+audio formats first
    const videoAudioFormats = info.formats.filter(f =>
        f.hasAudio && f.hasVideo && f.url
    );

    if (videoAudioFormats.length > 0) {
      videoAudioFormats.sort((a, b) => {
        const heightA = parseInt(a.qualityLabel) || 0;
        const heightB = parseInt(b.qualityLabel) || 0;
        return heightB - heightA;
      });
      selectedFormat = videoAudioFormats[0];
    }

    // Fallback to video-only
    if (!selectedFormat) {
      const videoOnlyFormats = info.formats.filter(f =>
          f.hasVideo && f.url
      );
      if (videoOnlyFormats.length > 0) {
        selectedFormat = videoOnlyFormats[0];
      }
    }

    // Final fallback to any format
    if (!selectedFormat) {
      const anyFormats = info.formats.filter(f => f.url);
      if (anyFormats.length > 0) {
        selectedFormat = anyFormats[0];
      }
    }

    if (!selectedFormat || !selectedFormat.url) {
      throw new Error('No downloadable formats found');
    }

    // Create formats array for Flutter app
    const availableFormats = info.formats
        .filter(f => f.url)
        .slice(0, 10)
        .map(format => ({
          itag: format.itag,
          quality: format.qualityLabel || (format.audioBitrate ? `${format.audioBitrate}kbps` : 'Unknown'),
          url: format.url,
          mimeType: format.mimeType || 'video/mp4',
          hasAudio: format.hasAudio || false,
          hasVideo: format.hasVideo || false
        }));

    return {
      success: true,
      data: {
        title: info.videoDetails.title,
        url: selectedFormat.url,
        thumbnail: info.videoDetails.thumbnails && info.videoDetails.thumbnails.length > 0
            ? info.videoDetails.thumbnails[0].url
            : 'https://via.placeholder.com/300x150',
        quality: selectedFormat.qualityLabel || 'Best Available',
        duration: info.videoDetails.lengthSeconds,
        author: info.videoDetails.author.name,
        source: 'youtube',
        formats: availableFormats
      }
    };

  } catch (error) {
    console.error('@distube/ytdl-core failed:', error.message);

    // Method 2: Fallback to youtube-dl-exec
    try {
      console.log('Trying youtube-dl-exec fallback...');

      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        format: 'best[height<=720]+bestaudio/best',
        addHeader: [
          'referer:youtube.com',
          'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        ]
      });

      if (info && info.formats && info.formats.length > 0) {
        const bestFormat = info.formats.find(f =>
            f.vcodec !== 'none' && f.acodec !== 'none'
        ) || info.formats[0];

        const availableFormats = info.formats.slice(0, 5).map(f => ({
          itag: f.format_id,
          quality: f.height ? `${f.height}p` : (f.format_note || 'Unknown'),
          url: f.url,
          mimeType: f.ext ? `video/${f.ext}` : 'video/mp4',
          hasAudio: f.acodec !== 'none',
          hasVideo: f.vcodec !== 'none'
        }));

        return {
          success: true,
          data: {
            title: info.title || 'YouTube Video',
            url: bestFormat.url,
            thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
            quality: bestFormat.height ? `${bestFormat.height}p` : 'Best Available',
            duration: info.duration,
            author: info.uploader || 'Unknown',
            source: 'youtube',
            formats: availableFormats
          }
        };
      }

    } catch (fallbackError) {
      console.error('YouTube fallback also failed:', fallbackError.message);
    }

    throw new Error(`YouTube download failed: ${error.message}`);
  }
}

module.exports = { downloadYouTubeVideo };