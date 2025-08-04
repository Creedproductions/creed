// controllers/youtubeController.js
const ytdl = require('@distube/ytdl-core');
const youtubeDl = require('youtube-dl-exec');

// Set environment variable to disable update check
process.env.YTDL_NO_UPDATE = '1';

async function downloadYouTubeVideo(url) {
  console.log(`Processing YouTube URL: ${url}`);

  try {
    // Method 1: Enhanced @distube/ytdl-core with anti-bot measures
    if (!ytdl.validateURL(url)) {
      throw new Error('Invalid YouTube URL');
    }

    console.log('Getting YouTube info with enhanced options...');

    // Create agent with cookies to avoid bot detection
    const agent = ytdl.createAgent([
      {
        "domain": ".youtube.com",
        "expirationDate": 1735689600,
        "hostOnly": false,
        "httpOnly": false,
        "name": "VISITOR_INFO1_LIVE",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": true,
        "session": false,
        "value": "fPQ4jCL6EiE"
      }
    ]);

    const info = await ytdl.getInfo(url, {
      agent: agent,
      requestOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Upgrade-Insecure-Requests': '1'
        }
      }
    });

    console.log(`Found ${info.formats.length} formats for: ${info.videoDetails.title}`);

    // Enhanced format selection with proper filtering
    let selectedFormat = null;

    // Filter out formats without URLs first
    const validFormats = info.formats.filter(f => f.url && f.url.length > 0);
    console.log(`${validFormats.length} formats have valid URLs`);

    // Try video+audio formats (best for mobile)
    const videoAudioFormats = validFormats.filter(f =>
        f.hasAudio && f.hasVideo && f.qualityLabel
    );

    if (videoAudioFormats.length > 0) {
      // Sort by quality preference
      videoAudioFormats.sort((a, b) => {
        const qualityOrder = {'720p': 3, '480p': 2, '360p': 1};
        const qualityA = qualityOrder[a.qualityLabel] || 0;
        const qualityB = qualityOrder[b.qualityLabel] || 0;
        return qualityB - qualityA;
      });
      selectedFormat = videoAudioFormats[0];
      console.log(`Selected video+audio format: ${selectedFormat.qualityLabel}`);
    }

    // Fallback to any video format
    if (!selectedFormat) {
      const videoFormats = validFormats.filter(f => f.hasVideo);
      if (videoFormats.length > 0) {
        selectedFormat = videoFormats[0];
        console.log(`Selected video-only format: ${selectedFormat.qualityLabel || 'Unknown'}`);
      }
    }

    // Final fallback
    if (!selectedFormat && validFormats.length > 0) {
      selectedFormat = validFormats[0];
      console.log(`Selected fallback format: ${selectedFormat.itag}`);
    }

    if (!selectedFormat) {
      throw new Error('No valid formats found with URLs');
    }

    // Create formats array for Flutter app
    const availableFormats = validFormats
        .slice(0, 8)
        .map(format => ({
          itag: format.itag.toString(),
          quality: format.qualityLabel || (format.audioBitrate ? `${format.audioBitrate}kbps` : 'Unknown'),
          url: format.url,
          mimeType: format.mimeType || 'video/mp4',
          hasAudio: format.hasAudio || false,
          hasVideo: format.hasVideo || false,
          contentLength: format.contentLength || 0
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

    // Method 2: Enhanced youtube-dl-exec with better options
    try {
      console.log('Trying enhanced youtube-dl-exec...');

      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        format: 'best[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        addHeader: [
          'referer:https://www.youtube.com',
          'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ],
        extractor: 'youtube'
      });

      if (info && info.formats && info.formats.length > 0) {
        // Find best format with both video and audio
        let bestFormat = info.formats.find(f =>
            f.vcodec !== 'none' && f.acodec !== 'none' && f.url
        );

        if (!bestFormat) {
          bestFormat = info.formats.find(f => f.url);
        }

        if (!bestFormat) {
          throw new Error('No formats with valid URLs found');
        }

        const availableFormats = info.formats
            .filter(f => f.url)
            .slice(0, 5)
            .map(f => ({
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
      console.error('YouTube fallback failed:', fallbackError.message);
    }

    // Method 3: Last resort with different approach
    try {
      console.log('Trying last resort method...');

      const simpleInfo = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        format: 'worst[ext=mp4]/worst',
        addHeader: [
          'user-agent:Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15'
        ]
      });

      if (simpleInfo && simpleInfo.url) {
        return {
          success: true,
          data: {
            title: simpleInfo.title || 'YouTube Video',
            url: simpleInfo.url,
            thumbnail: simpleInfo.thumbnail || 'https://via.placeholder.com/300x150',
            quality: 'Standard Quality',
            duration: simpleInfo.duration,
            author: simpleInfo.uploader || 'Unknown',
            source: 'youtube',
            formats: [{
              itag: 'fallback',
              quality: 'Standard Quality',
              url: simpleInfo.url,
              mimeType: 'video/mp4',
              hasAudio: true,
              hasVideo: true
            }]
          }
        };
      }

    } catch (lastError) {
      console.error('Last resort also failed:', lastError.message);
    }

    throw new Error(`All YouTube methods failed. Video may be age-restricted or unavailable.`);
  }
}

module.exports = { downloadYouTubeVideo };