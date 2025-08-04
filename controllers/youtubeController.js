// controllers/youtubeController.js
const axios = require("axios");
const { shortenUrl } = require("../utils/urlShortener");

async function fetchYouTubeData(url) {
  try {
    const res = await axios.get(
      "https://api.vidfly.ai/api/media/youtube/download",
      {
        params: { url },
        headers: {
          accept: "*/*",
          "content-type": "application/json",
          "x-app-name": "vidfly-web",
          "x-app-version": "1.0.0",
          Referer: "https://vidfly.ai/",
        },
      }
    );

    const data = res.data?.data;
    if (!data || !data.items || !data.title) {
      throw new Error("Invalid or empty response from YouTube downloader API");
    }

    return {
      title: data.title,
      thumbnail: data.cover,
      duration: data.duration,
      formats: data.items.map((item) => ({
        type: item.type,
        quality: item.label || "unknown",
        extension: item.ext || item.extension || "unknown",
        url: item.url,
      })),
    };
  } catch (err) {
    throw new Error(`YouTube downloader request failed: ${err.message}`);
  }
}

async function downloadYouTubeVideo(url) {
  console.log(`Processing YouTube URL: ${url}`);

  try {
    const data = await fetchYouTubeData(url);
    
    // Find the best format (prefer video with highest quality)
    let selectedFormat = null;
    let bestUrl = null;

    if (data.formats && data.formats.length > 0) {
      // First try to find a video format
      const videoFormats = data.formats.filter(f => f.type === 'video' && f.url);
      
      if (videoFormats.length > 0) {
        // Sort by quality preference (720p > 480p > 360p > others)
        videoFormats.sort((a, b) => {
          const qualityOrder = {'720p': 3, '480p': 2, '360p': 1};
          const qualityA = qualityOrder[a.quality] || 0;
          const qualityB = qualityOrder[b.quality] || 0;
          return qualityB - qualityA;
        });
        selectedFormat = videoFormats[0];
      } else {
        // Fallback to any format with a URL
        const validFormats = data.formats.filter(f => f.url);
        if (validFormats.length > 0) {
          selectedFormat = validFormats[0];
        }
      }

      if (selectedFormat) {
        bestUrl = selectedFormat.url;
      }
    }

    if (!bestUrl) {
      throw new Error('No valid download URL found');
    }

    // Shorten the best URL
    console.log('Shortening YouTube download URL...');
    const shortenedUrl = await shortenUrl(bestUrl);

    // Convert to the expected format for your app
    const availableFormats = await Promise.all(
      data.formats
        .filter(f => f.url)
        .map(async (format, index) => {
          const shortenedFormatUrl = await shortenUrl(format.url);
          return {
            itag: index.toString(),
            quality: format.quality,
            url: shortenedFormatUrl,
            mimeType: format.extension ? `video/${format.extension}` : 'video/mp4',
            hasAudio: format.type !== 'video-only',
            hasVideo: format.type !== 'audio-only',
            contentLength: 0
          };
        })
    );

    return {
      success: true,
      data: {
        title: data.title,
        url: shortenedUrl,
        thumbnail: data.thumbnail || 'https://via.placeholder.com/300x150',
        quality: selectedFormat ? selectedFormat.quality : 'Best Available',
        duration: data.duration,
        author: 'Unknown',
        source: 'youtube',
        formats: availableFormats
      }
    };

  } catch (error) {
    console.error('VidFly API failed:', error.message);
    throw new Error(`YouTube download failed: ${error.message}`);
  }
}

module.exports = { downloadYouTubeVideo, fetchYouTubeData };