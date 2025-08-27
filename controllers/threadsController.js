// controllers/threadsController.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

async function downloadThreadsMedia(url) {
  console.log(`Processing Threads URL: ${url}`);
  
  try {
    // Fetch the Threads page content
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Threads page: ${response.status}`);
    }

    const html = await response.text();

    // Extract title
    let title = 'Threads Post';
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim();
    }

    // First try to detect video via Open Graph meta tag
    const ogVideoMatch = html.match(/<meta property="og:video" content="([^"]+)"\/?>/i) ||
      html.match(/<meta property="og:video:url" content="([^"]+)"\/?>/i);

    if (ogVideoMatch && ogVideoMatch[1]) {
      let videoUrl = ogVideoMatch[1].replace(/&amp;/g, '&');

      // Check if the URL needs a protocol
      if (videoUrl.startsWith('//')) {
        videoUrl = 'https:' + videoUrl;
      }

      const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"\/?>/i);
      const thumbnail = ogImageMatch ? ogImageMatch[1] : '';

      return {
        title,
        url: videoUrl,
        thumbnail: thumbnail || 'https://via.placeholder.com/300x150',
      };
    }

    // Otherwise try image meta tag
    const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"\/?>/i);
    if (ogImageMatch && ogImageMatch[1]) {
      const imageUrl = ogImageMatch[1];

      return {
        title,
        url: imageUrl,
        thumbnail: imageUrl,
      };
    }

    // Also look for video URLs in the content
    const videoRegexes = [
      /"video_url":"([^"]+)"/,
      /"playbackUrl":"([^"]+)"/,
      /"mediaUrl":"([^"]+)"/,
      /"videoUrl":"([^"]+)"/,
      /"url":"([^"]+\.mp4[^"]*)"/
    ];

    let videoUrl = null;

    for (const regex of videoRegexes) {
      const match = html.match(regex);
      if (match && match[1]) {
        videoUrl = match[1]
          .replace(/\\u002F/g, '/')
          .replace(/\\\//g, '/')
          .replace(/\\/g, '')
          .replace(/&amp;/g, '&');
        break;
      }
    }

    if (videoUrl) {
      return {
        title,
        url: videoUrl,
        thumbnail: 'https://via.placeholder.com/300x150',
      };
    }

    throw new Error('No media found in this Threads post');
  } catch (error) {
    console.error(`Threads media extraction error: ${error.message}`);
    throw error;
  }
}

module.exports = { downloadThreadsMedia };