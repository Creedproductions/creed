// controllers/youtubeController.js
const axios = require("axios");

// Build a proxied URL so downloads always flow through /api/direct
function makeProxy(mediaUrl, title = 'YouTube Video', ext = 'mp4') {
  const safe = (title || 'YouTube_Video')
    .replace(/[^\w\-]+/g, '_')
    .slice(0, 60);
  return `/api/direct?url=${encodeURIComponent(mediaUrl)}&referer=youtube.com&filename=${encodeURIComponent(safe)}.${ext}`;
}

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
        timeout: 20000
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
      // Normalize shapes
      formats: data.items.map((item) => ({
        type: item.type,                  // 'video' | 'audio' | 'video-only' | 'audio-only'
        quality: item.label || item.quality || "unknown",
        ext: item.ext || item.extension || "mp4",
        url: item.url,
      })),
    };
  } catch (err) {
    throw new Error(`YouTube downloader request failed: ${err.message}`);
  }
}

function qualityToNumber(q) {
  const n = parseInt(String(q || '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

async function downloadYouTubeVideo(url) {
  console.log(`Processing YouTube URL: ${url}`);

  try {
    const data = await fetchYouTubeData(url);

    // Prefer highest p video with audio first
    const videoCandidates = data.formats.filter(f => f.url && f.type === 'video');
    const selectedFormat =
      (videoCandidates.sort((a, b) => qualityToNumber(b.quality) - qualityToNumber(a.quality))[0]) ||
      (data.formats.find(f => f.url)) ||
      null;

    if (!selectedFormat) {
      throw new Error('No valid download URL found');
    }

    const bestUrl = selectedFormat.url;

    // Map ALL returned formats into proxied URLs (NO shortening)
    const formats = data.formats
      .filter(f => f.url)
      .map((f, index) => {
        const isAudioOnly = f.type === 'audio' || f.type === 'audio-only';
        const isVideoOnly = f.type === 'video-only';
        const ext = f.ext || (isAudioOnly ? 'mp3' : 'mp4');

        return {
          itag: String(index),
          quality: f.quality || 'unknown',
          url: makeProxy(f.url, data.title, ext),
          mimeType: `${isAudioOnly ? 'audio' : 'video'}/${ext}`,
          hasAudio: !isVideoOnly,
          hasVideo: !isAudioOnly,
          contentLength: 0
        };
      });

    return {
      success: true,
      data: {
        title: data.title,
        url: makeProxy(bestUrl, data.title, selectedFormat.ext || 'mp4'),
        thumbnail: data.thumbnail || 'https://via.placeholder.com/300x150',
        quality: selectedFormat.quality || 'Best Available',
        duration: data.duration,
        author: 'Unknown',
        source: 'youtube',
        formats
      }
    };

  } catch (error) {
    console.error('YouTube controller failed:', error.message);
    throw new Error(`YouTube download failed: ${error.message}`);
  }
}

module.exports = { downloadYouTubeVideo, fetchYouTubeData };
