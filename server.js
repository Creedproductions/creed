// server.js
/* eslint-disable no-console */
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const axios = require('axios');
const fetch = require('node-fetch');
const puppeteer = require('puppeteer-core');
const youtubeDl = require('youtube-dl-exec');

// controllers (USE MY PATCHED FILES)
const { downloadFacebookVideo } = require('./controllers/facebookController');
const { downloadYouTubeVideo } = require('./controllers/youtubeController');

// utilities
const { shortenUrl } = require('./utils/urlShortener');
const config = require('./config');

// packages
const { alldown, threads } = require('herxa-media-downloader');
const { ttdl, igdl } = require('btch-downloader');

// optional shorteners (some utils may use these)
const { BitlyClient } = require('bitly');
const tinyurl = require('tinyurl');

// ---------------------------------------------------------------------

process.env.YTDL_NO_UPDATE = '1';

const app = express();
const PORT = process.env.PORT || 5000;
const bitly = new BitlyClient(config.BITLY_ACCESS_TOKEN || 'your_bitly_token');

const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  console.log('Creating temp directory...');
  try {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    fs.chmodSync(TEMP_DIR, 0o777);
    console.log(`Temp directory created at ${TEMP_DIR}`);
  } catch (error) {
    console.error(`Error creating temp directory: ${error.message}`);
  }
}

app.use(cors());
app.use(express.json());

// keepalive and sane concurrency
http.globalAgent.maxSockets = 25;
https.globalAgent.maxSockets = 25;
http.globalAgent.keepAlive = true;
https.globalAgent.keepAlive = true;

// ---------------------------------------------------------------------
// Helpers

const identifyPlatform = (url) => {
  const u = (url || '').toLowerCase();
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('facebook.com') || u.includes('fb.watch') || u.includes('fb.com')) return 'facebook';
  if (u.includes('x.com') || u.includes('twitter.com')) return 'twitter';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('pinterest.com') || u.includes('pin.it')) return 'pinterest';
  if (u.includes('threads.net')) return 'threads';
  if (u.includes('reddit.com')) return 'reddit';
  if (u.includes('linkedin.com')) return 'linkedin';
  if (u.includes('tumblr.com')) return 'tumblr';
  if (u.includes('vk.com')) return 'vk';
  if (u.includes('bilibili.com')) return 'bilibili';
  if (u.includes('snapchat.com')) return 'snapchat';
  if (u.includes('spotify.com')) return 'spotify';
  if (u.includes('soundcloud.com')) return 'soundcloud';
  if (u.includes('bandcamp.com')) return 'bandcamp';
  if (u.includes('deezer.com')) return 'deezer';
  if (u.includes('music.apple.com')) return 'apple_music';
  if (u.includes('music.amazon.com')) return 'amazon_music';
  if (u.includes('mixcloud.com')) return 'mixcloud';
  if (u.includes('audiomack.com')) return 'audiomack';
  if (u.includes('vimeo.com')) return 'vimeo';
  if (u.includes('dailymotion.com')) return 'dailymotion';
  if (u.includes('twitch.tv')) return 'twitch';
  return null;
};

const formatData = async (platform, data) => {
  const placeholderThumbnail = 'https://via.placeholder.com/300x150';

  switch (platform) {
    case 'youtube': {
      // When we use our controller, we return a normalized shape already.
      // But download-media may pass raw shapes. Handle both.
      const y = data?.data || data;
      return {
        title: y.title || 'YouTube Video',
        url: y.url || '',
        thumbnail: y.thumbnail || placeholderThumbnail,
        sizes: [y.quality || 'Best Available'],
        source: platform,
        formats: y.formats || [],
      };
    }

    case 'instagram': {
      if (!data || !data[0]?.url) throw new Error('Instagram data is missing or invalid.');
      return {
        title: data[0]?.wm || 'Untitled Media',
        url: data[0]?.url,
        thumbnail: data[0]?.thumbnail || placeholderThumbnail,
        sizes: ['Original Quality'],
        source: platform,
      };
    }

    case 'twitter': {
      const t = data?.data || data;
      const videoUrl = t?.high || t?.low || t?.url || '';
      return {
        title: t?.title || 'Twitter Video',
        url: videoUrl,
        thumbnail: t?.thumbnail || placeholderThumbnail,
        sizes: ['Original Quality'],
        source: platform,
      };
    }

    case 'facebook': {
      // Our controller returns { success, data: { title, url, thumbnail, quality, duration, formats } }
      if (data?.success && data?.data) {
        return {
          title: data.data.title || 'Facebook Video',
          url: data.data.url || '',
          thumbnail: data.data.thumbnail || placeholderThumbnail,
          sizes: [data.data.quality || 'Original Quality'],
          source: platform,
          formats: data.data.formats || [],
        };
      }

      // fallbacks if someone passes other libs
      if (data?.result?.links?.HD || data?.result?.links?.SD) {
        return {
          title: data.title || 'Facebook Video',
          url: data.result.links.HD || data.result.links.SD || '',
          thumbnail: data.result.thumbnail || placeholderThumbnail,
          sizes: ['Original Quality'],
          source: platform,
        };
      }

      return {
        title: data?.title || 'Facebook Video',
        url: data?.url || '',
        thumbnail: data?.thumbnail || placeholderThumbnail,
        sizes: ['Original Quality'],
        source: platform,
      };
    }

    case 'pinterest': {
      return {
        title: data.title || 'Pinterest Media',
        url: data.url || '',
        thumbnail: data.thumbnail || placeholderThumbnail,
        sizes: ['Original Quality'],
        source: platform,
      };
    }

    case 'tiktok': {
      const d = data || {};
      return {
        title: d.title || 'TikTok',
        url: d.video?.[0] || d.url || '',
        thumbnail: d.thumbnail || placeholderThumbnail,
        sizes: ['Original Quality'],
        source: platform,
      };
    }

    case 'threads': {
      const d = data?.data || data || {};
      return {
        title: d.title || 'Threads',
        url: d.video || d.url || '',
        thumbnail: d.thumbnail || placeholderThumbnail,
        sizes: ['Original Quality'],
        source: platform,
      };
    }

    default: {
      const d = data || {};
      return {
        title: d.title || 'Untitled Media',
        url: d.url || '',
        thumbnail: d.thumbnail || placeholderThumbnail,
        sizes: d.sizes?.length ? d.sizes : ['Original Quality'],
        source: platform,
      };
    }
  }
};

// youtube generic helper (used for non-controller platforms too)
async function processGenericUrlWithYtdl(url, platform) {
  console.log(`Processing ${platform} URL with youtube-dl: ${url}`);
  try {
    const isAudioPlatform = [
      'spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple_music',
      'amazon_music', 'mixcloud', 'audiomack'
    ].includes(platform);

    const info = await youtubeDl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      format: isAudioPlatform ? 'bestaudio' : 'best',
      addHeader: [
        'referer:' + new URL(url).origin,
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ],
    });

    let bestUrl = info.url;
    let quality = 'Standard Quality';

    if (!bestUrl && Array.isArray(info.formats) && info.formats.length) {
      if (isAudioPlatform) {
        const bestAudio = info.formats
          .filter(f => f.acodec !== 'none')
          .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
        bestUrl = bestAudio?.url || info.formats[0].url;
        if (bestAudio?.abr) quality = `${bestAudio.abr}kbps`;
      } else {
        const bestMuxed = info.formats
          .filter(f => f.vcodec !== 'none' && f.acodec !== 'none')
          .sort((a, b) => (b.height || 0) - (a.height || 0))[0];
        bestUrl = bestMuxed?.url || info.formats[0].url;
        if (bestMuxed?.height) quality = `${bestMuxed.height}p`;
      }
    }

    if (!bestUrl) throw new Error('No media URL found');

    return {
      success: true,
      data: {
        title: info.title || `${platform} Media`,
        url: bestUrl,
        thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
        sizes: [quality],
        source: platform,
        mediaType: isAudioPlatform ? 'audio' : 'video',
      }
    };
  } catch (err) {
    console.error(`youtube-dl error for ${platform}: ${err.message}`);
    throw err;
  }
}

async function processTwitterWithYtdl(url) {
  // super short: try ytdl first, else quick regex fallback would go here
  try {
    const info = await youtubeDl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      addHeader: [
        'referer:twitter.com',
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      ],
    });

    const muxed = (info.formats || [])
      .filter(f => f.vcodec !== 'none' && f.acodec !== 'none')
      .sort((a, b) => (b.height || 0) - (a.height || 0))[0];

    const urlOut = muxed?.url || info.url;
    if (!urlOut) throw new Error('No muxed video URL found');

    return {
      success: true,
      data: {
        title: info.title || 'Twitter/X Video',
        url: urlOut,
        thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
        sizes: [(muxed?.height ? `${muxed.height}p` : 'Original Quality')],
        source: 'twitter',
      }
    };
  } catch (err) {
    console.error('Twitter/X download error:', err.message);
    throw err;
  }
}

async function processYoutubeWithYtdl(url) {
  // wrapper to our controller (patched version)
  return await downloadYouTubeVideo(url);
}

async function processFacebookUrl(url) {
  return await downloadFacebookVideo(url);
}

// (Used by /api/threads route fallback)
async function fetchThreadsPage(url) {
  let browser = null;
  try {
    const possiblePaths = [
      '/opt/render/project/.render/chrome/opt/google/chrome/chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable'
    ];

    let executablePath = null;
    for (const p of possiblePaths) {
      try { if (fs.existsSync(p)) { executablePath = p; break; } } catch (_) {}
    }

    if (!executablePath) {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.threads.net/'
        }
      });
      return await resp.text();
    }

    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--disable-gpu']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    return await page.content();
  } finally {
    if (browser) { try { await browser.close(); } catch(_) {} }
  }
}

// ---------------------------------------------------------------------
// Routes

app.get('/', (_req, res) => {
  res.send('Social Media Download API is running');
});

// Core endpoint used by the app
app.post('/api/download-media', async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'No URL provided' });

  const platform = identifyPlatform(url);
  if (!platform) return res.status(400).json({ error: 'Unsupported platform' });

  try {
    let data;

    switch (platform) {
      case 'instagram':
        data = await igdl(url);
        break;

      case 'tiktok':
        data = await ttdl(url);
        break;

      case 'facebook': {
        console.log('Using enhanced Facebook controller...');
        const fb = await processFacebookUrl(url);
        if (!fb?.success) throw new Error('Facebook processing failed');
        data = fb; // pass through to formatter (knows controller shape)
        break;
      }

      case 'twitter': {
        const tw = await processTwitterWithYtdl(url);
        return res.status(200).json(tw);
      }

      case 'youtube': {
        const yt = await processYoutubeWithYtdl(url); // controller (NO alldown)
        if (!yt?.success) throw new Error('YouTube processing failed');
        data = yt; // controller shape
        break;
      }

      case 'pinterest': {
        // call our own endpoint to resolve, then map to formatter shape
        const pinResp = await fetch(`http://localhost:${PORT}/api/pinterest?url=${encodeURIComponent(url)}`);
        const pinJson = await pinResp.json();
        if (!pinResp.ok) throw new Error(pinJson?.error || 'Pinterest processing failed');

        const firstFmt = (pinJson.formats || [])[0];
        data = {
          title: pinJson.title || 'Pinterest',
          url: firstFmt?.url || '',
          thumbnail: (pinJson.thumbnails && pinJson.thumbnails[0]?.url) || firstFmt?.url || '',
        };
        break;
      }

      case 'threads':
        data = await threads(url);
        break;

      default: {
        const generic = await processGenericUrlWithYtdl(url, platform);
        return res.status(200).json(generic);
      }
    }

    if (!data) return res.status(404).json({ error: 'Data not found for the platform' });

    const formattedData = await formatData(platform, data);

    // Safety-net: FORCE proxy for Facebook/YouTube through /api/direct
    if (['facebook', 'youtube'].includes(platform) && formattedData.url && !String(formattedData.url).startsWith('/api/direct')) {
      const referer = platform === 'facebook' ? 'facebook.com' : 'youtube.com';
      const safe = (formattedData.title || `${platform} Video`).replace(/[^\w\-]+/g, '_').slice(0, 60);
      formattedData.url = `/api/direct?url=${encodeURIComponent(formattedData.url)}&referer=${referer}&filename=${encodeURIComponent(safe)}.mp4`;

      if (Array.isArray(formattedData.formats)) {
        formattedData.formats = formattedData.formats.map(f => {
          if (!f?.url) return f;
          if (String(f.url).startsWith('/api/direct')) return f;
          return {
            ...f,
            url: `/api/direct?url=${encodeURIComponent(f.url)}&referer=${referer}&filename=${encodeURIComponent(safe)}.mp4`
          };
        });
      }
    }

    // Never shorten for platforms that require strict headers (FB/YT)
    if (!['facebook', 'youtube', 'threads'].includes(platform)) {
      try {
        if (formattedData.url) formattedData.url = await shortenUrl(formattedData.url);
        if (formattedData.thumbnail) formattedData.thumbnail = await shortenUrl(formattedData.thumbnail);
      } catch (e) {
        console.warn('Shorten skipped:', e.message);
      }
    }

    return res.status(200).json({ success: true, data: formattedData });
  } catch (error) {
    console.error(`Download Media: Error - ${error.message}`);
    return res.status(500).json({ error: 'Failed to download media', details: error.message });
  }
});

// Info endpoint (simple wrapper around /api/download-media)
app.get('/api/info', async (req, res) => {
  const { url } = req.query || {};
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const platform = identifyPlatform(url);
    if (!platform) return res.status(400).json({ error: 'Unsupported platform' });

    const resp = await fetch(`http://localhost:${PORT}/api/download-media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await resp.json();
    if (!resp.ok || !data?.success) throw new Error(data?.error || 'Processing failed');

    const isAudioPlatform = ['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple_music', 'amazon_music', 'mixcloud', 'audiomack'].includes(platform);
    const isImage = (platform === 'pinterest') ||
      (data.data.url && /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(data.data.url));

    // best-effort directUrl
    let directUrl = data.data.url;
    if (!String(directUrl).startsWith('/api/direct')) {
      directUrl = `/api/direct?url=${encodeURIComponent(data.data.url)}&referer=${platform}.com`;
    }

    return res.json({
      title: data.data.title,
      formats: [{
        itag: 'best',
        quality: data.data.sizes?.[0] || 'Best Quality',
        mimeType: isImage ? 'image/jpeg' : (isAudioPlatform ? 'audio/mp3' : 'video/mp4'),
        url: data.data.url,
        hasAudio: !isImage,
        hasVideo: !isImage && !isAudioPlatform,
      }],
      thumbnails: [{ url: data.data.thumbnail }],
      platform,
      mediaType: isImage ? 'image' : (isAudioPlatform ? 'audio' : 'video'),
      directUrl
    });
  } catch (err) {
    console.error('API info error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch info', details: err.message });
  }
});

// Twitter (explicit route, if needed by your app)
app.get('/api/twitter', async (req, res) => {
  const { url } = req.query || {};
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const tw = await processTwitterWithYtdl(url);
    if (!tw?.success) throw new Error('Twitter processing failed');

    return res.json({
      title: tw.data.title,
      formats: [{
        itag: 'twitter_0',
        quality: tw.data.sizes?.[0] || 'Original Quality',
        mimeType: 'video/mp4',
        url: tw.data.url,
        hasAudio: true,
        hasVideo: true
      }],
      thumbnails: [{ url: tw.data.thumbnail }],
      platform: 'twitter',
      mediaType: 'video',
      directUrl: `/api/direct?url=${encodeURIComponent(tw.data.url)}&referer=twitter.com`
    });
  } catch (err) {
    console.error('Twitter endpoint error:', err.message);
    return res.status(500).json({ error: 'Twitter processing failed', details: err.message });
  }
});

// YouTube (explicit route, uses controller)
app.get('/api/youtube', async (req, res) => {
  const { url } = req.query || {};
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const yt = await processYoutubeWithYtdl(url);
    if (!yt?.success) throw new Error('YouTube processing failed');

    return res.json({
      title: yt.data.title,
      formats: yt.data.formats?.length ? yt.data.formats : [{
        itag: 'youtube_best',
        quality: yt.data.quality || 'Best Available',
        mimeType: 'video/mp4',
        url: yt.data.url,
        hasAudio: true,
        hasVideo: true
      }],
      thumbnails: [{ url: yt.data.thumbnail }],
      platform: 'youtube',
      mediaType: 'video'
    });
  } catch (err) {
    console.error('YouTube endpoint error:', err.message);
    return res.status(500).json({ error: 'YouTube processing failed', details: err.message });
  }
});

// Threads (kept in case you call it directly)
app.get('/api/threads', async (req, res) => {
  const { url } = req.query || {};
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    // first try lib
    try {
      const threadsData = await threads(url);
      if (threadsData?.data?.video) {
        const formatted = await formatData('threads', threadsData);
        return res.json({
          title: formatted.title,
          formats: [{
            itag: 'threads_0',
            quality: 'Original Quality',
            mimeType: 'video/mp4',
            url: formatted.url,
            hasAudio: true,
            hasVideo: true,
          }],
          thumbnails: [{ url: formatted.thumbnail }],
          platform: 'threads',
          mediaType: 'video',
        });
      }
    } catch (e) {
      console.warn('Threads lib failed:', e.message);
    }

    // fallback html scrape
    const html = await fetchThreadsPage(url);
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch?.[1]?.trim() || 'Threads Post';
    const ogVideo = html.match(/<meta property="og:video(:url)?" content="([^"]+)"\/?>/i);
    const ogImage = html.match(/<meta property="og:image" content="([^"]+)"\/?>/i);
    const mediaUrl = (ogVideo?.[2] || ogImage?.[1] || '').replace(/&amp;/g, '&');

    if (!mediaUrl) throw new Error('No media found');

    const isVideo = /\.mp4(\?|$)/i.test(mediaUrl);

    return res.json({
      title,
      formats: [{
        itag: 'threads_0',
        quality: 'Original Quality',
        mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
        url: mediaUrl,
        hasAudio: isVideo,
        hasVideo: isVideo,
      }],
      thumbnails: [{ url: ogImage?.[1] || mediaUrl }],
      platform: 'threads',
      mediaType: isVideo ? 'video' : 'image',
    });
  } catch (err) {
    console.error('Threads endpoint error:', err.message);
    return res.status(500).json({ error: 'Threads processing failed', details: err.message });
  }
});

// Pinterest (dedicated resolver your other routes reuse)
app.get('/api/pinterest', async (req, res) => {
  try {
    const { url } = req.query || {};
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const response = await fetch(url, {
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });
    if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);

    const html = await response.text();
    const title = (html.match(/<title>([^<]+)<\/title>/i)?.[1] || 'Pinterest Media').replace(' | Pinterest', '').trim();

    // try video first
    const videoPatterns = [
      /"video_url":"([^"]+)"/i,
      /"contentUrl":\s*"(https:\/\/v\.pinimg\.com[^"]+)"/i,
      /"contentUrl":\s*"([^"]+\.mp4[^"]*)"/i,
      /<meta\s+property="og:video(:url)?"\s+content="([^"]+)"/i,
      /https:\/\/v\.pinimg\.com\/videos\/mc\/[^"'\s]+\.mp4/i
    ];

    let videoUrl = null;
    for (const p of videoPatterns) {
      const m = html.match(p);
      const raw = m?.[1] || m?.[2];
      if (raw) { videoUrl = raw.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/\\/g, '').replace(/&amp;/g, '&'); break; }
    }

    if (videoUrl) {
      const thumb = html.match(/<meta property="og:image" content="([^"]+)"/i)?.[1] || '';
      return res.json({
        title,
        thumbnails: [{ url: thumb || 'https://via.placeholder.com/300x150', width: 480, height: 480 }],
        formats: [{
          itag: 'pin_video_0',
          quality: 'Original Quality',
          mimeType: 'video/mp4',
          url: videoUrl,
          hasAudio: true,
          hasVideo: true,
          contentLength: 0,
          container: 'mp4'
        }],
        platform: 'pinterest',
        mediaType: 'video',
        directUrl: `/api/direct?url=${encodeURIComponent(videoUrl)}&referer=pinterest.com`,
        thumbnailUrl: thumb || 'https://via.placeholder.com/300x150'
      });
    }

    // images
    let images = [];
    images = images.concat(html.match(/https:\/\/i\.pinimg\.com\/originals\/[a-zA-Z0-9\/\._-]+\.(?:jpg|jpeg|png|gif)/gi) || []);
    if (!images.length) {
      images = images.concat(html.match(/https:\/\/i\.pinimg\.com\/[0-9]+x\/[a-zA-Z0-9\/\._-]+\.(?:jpg|jpeg|png|gif)/gi) || []);
    }
    images = [...new Set(images)].filter(u => u && u.startsWith('http'));

    if (!images.length) return res.status(404).json({ error: 'No images or videos found on this Pinterest page' });

    const formats = images.map((u, i) => {
      const ext = (u.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i)?.[1] || 'jpg').toLowerCase();
      return {
        itag: `pin_${i}`,
        quality: u.includes('/originals/') ? 'Original' : 'Standard',
        mimeType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        url: u,
        hasAudio: false,
        hasVideo: false,
        contentLength: 0,
        container: ext
      };
    });

    return res.json({
      title,
      thumbnails: [{ url: images[0], width: 480, height: 480 }],
      formats,
      platform: 'pinterest',
      mediaType: 'image',
      directUrl: `/api/direct?url=${encodeURIComponent(images[0])}&referer=pinterest.com`
    });
  } catch (err) {
    console.error('Pinterest error:', err.message);
    return res.status(500).json({ error: 'Pinterest processing failed', details: err.message });
  }
});

// Stream a local temp file (Twitter fallback etc.)
app.get('/api/stream-file', (req, res) => {
  const { path: filePath } = req.query || {};
  if (!filePath) return res.status(400).json({ error: 'File path is required' });
  if (!filePath.startsWith(TEMP_DIR)) return res.status(403).json({ error: 'Access denied' });
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    });

    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Content-Disposition': 'attachment; filename="video.mp4"'
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// DIRECT PROXY — resolves shorteners up front + strict headers for FB/YT/Pinterest
app.get('/api/direct', async (req, res) => {
  let { url, filename } = req.query; // let (not const) because we might rewrite
  if (!url) return res.status(400).json({ error: 'URL is required' });

  // 0) Resolve shortened URLs (HEAD follow)
  try {
    const head = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (head.ok && head.url && head.url !== url) {
      console.log(`Shortener resolved → ${head.url}`);
      url = head.url;
    }
  } catch (e) {
    console.warn('Shortener resolve skipped:', e.message);
  }

  // normalized referer
  const refererParam = req.query.referer;
  const refererHost = refererParam
    ? (refererParam.startsWith('http') ? refererParam : `https://${refererParam}`)
    : (new URL(url).origin);

  // 1) Pinterest
  if (/pinimg\.com/i.test(url)) {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Range': req.headers.range || 'bytes=0-',
      'Referer': 'https://www.pinterest.com/',
      'Origin': 'https://www.pinterest.com',
      'Sec-Fetch-Dest': 'video',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site'
    };

    try {
      const resp = await fetch(url, { headers, redirect: 'follow' });
      if (!resp.ok) throw new Error(`Pinterest fetch failed: ${resp.status}`);

      const contentType = resp.headers.get('content-type') || 'application/octet-stream';
      const contentLength = resp.headers.get('content-length');
      const out = filename || (contentType.includes('video') ? 'pinterest-video.mp4' : 'pinterest-file');

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${out}"`);
      if (contentLength) res.setHeader('Content-Length', contentLength);
      return void resp.body.pipe(res);
    } catch (err) {
      console.error('Pinterest /api/direct error:', err.message);
      return res.status(500).json({ error: 'Pinterest download failed', details: err.message });
    }
  }

  // 2) Facebook
  if (/facebook\.com|fbcdn\.net|fb\.watch|fb\.com/i.test(url)) {
    const headers = {
      'User-Agent': url.includes('m.facebook.com')
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Range': req.headers.range || 'bytes=0-',
      'Referer': 'https://www.facebook.com/',
      'Origin': 'https://www.facebook.com',
      'Sec-Fetch-Dest': 'video',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'Connection': 'keep-alive'
    };

    try {
      const resp = await fetch(url, { headers, redirect: 'follow' });
      if (!resp.ok) throw new Error(`Facebook fetch failed: ${resp.status}`);
      const contentType = resp.headers.get('content-type') || 'video/mp4';
      const contentLength = resp.headers.get('content-length');
      const out = filename || 'facebook-video.mp4';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${out.includes('.') ? out : `${out}.mp4`}"`);
      if (contentLength) res.setHeader('Content-Length', contentLength);
      return void resp.body.pipe(res);
    } catch (err) {
      console.error('Facebook /api/direct error:', err.message);
      return res.status(500).json({ error: 'Facebook download failed', details: err.message });
    }
  }

  // 3) YouTube / googlevideo
  if (/googlevideo\.com|youtube\.com|ytimg\.com/i.test(url)) {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.youtube.com/',
      'Origin': 'https://www.youtube.com',
      'Sec-Fetch-Dest': 'video',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'Range': req.headers.range || 'bytes=0-',
    };

    try {
      const resp = await fetch(url, { headers, redirect: 'follow' });
      if (!resp.ok) throw new Error(`YouTube fetch failed: ${resp.status}`);
      const contentType = resp.headers.get('content-type') || 'video/mp4';
      const contentLength = resp.headers.get('content-length');
      const out = filename || 'youtube-video.mp4';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${out.includes('.') ? out : `${out}.mp4`}"`);
      if (contentLength) res.setHeader('Content-Length', contentLength);
      return void resp.body.pipe(res);
    } catch (err) {
      console.error('YouTube /api/direct error:', err.message);
      return res.status(500).json({ error: 'YouTube download failed', details: err.message });
    }
  }

  // 4) Generic
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': refererHost
    };

    const resp = await fetch(url, { headers, redirect: 'follow' });
    if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);

    const contentType = resp.headers.get('content-type') || 'application/octet-stream';
    const contentLength = resp.headers.get('content-length');

    let out = filename || 'download';
    if (!/\.[a-z0-9]+$/i.test(out)) {
      if (contentType.includes('video')) out += '.mp4';
      else if (contentType.includes('audio')) out += '.mp3';
      else if (contentType.includes('png')) out += '.png';
      else if (contentType.includes('gif')) out += '.gif';
      else if (contentType.includes('jpg') || contentType.includes('jpeg')) out += '.jpg';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${out}"`);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    return void resp.body.pipe(res);
  } catch (err) {
    console.error('Generic /api/direct error:', err.message);
    return res.status(500).json({ error: 'Download failed', details: err.message });
  }
});

// ---------------------------------------------------------------------

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Server accessible at http://localhost:${PORT}`);
  console.log(`Temporary directory: ${TEMP_DIR}`);
});
