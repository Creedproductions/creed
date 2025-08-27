// controllers/instagramController.js
const axios = require('axios');
const ytDlp = require('yt-dlp-exec');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

async function downloadInstagramMedia(url) {
  console.log(`Processing Instagram URL: ${url}`);

  try {
    // First try yt-dlp extraction for Instagram
    try {
      console.log('Trying yt-dlp extraction for Instagram...');

      const info = await ytDlp(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: [
          'referer:https://www.instagram.com/',
          'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ],
      });

      if (info) {
        if (info.entries && info.entries.length > 0) {
          // This is a carousel/multiple post
          const firstItem = info.entries[0];
          return {
            title: info.title || 'Instagram Post',
            url: firstItem.url,
            thumbnail: firstItem.thumbnail,
            is_carousel: true,
            total_items: info.entries.length
          };
        } else if (info.url) {
          // This is a single post
          return {
            title: info.title || 'Instagram Post',
            url: info.url,
            thumbnail: info.thumbnail,
          };
        }
      }

      throw new Error('yt-dlp did not return valid Instagram data');
    } catch (ytdlpError) {
      console.warn(`yt-dlp extraction failed: ${ytdlpError.message}`);

      // Try direct page scraping as fallback
      console.log('Trying direct page scraping for Instagram...');

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch Instagram page: ${response.status}`);
      }

      const html = await response.text();

      // Extract video URL
      const videoUrlMatch = html.match(/<meta property="og:video" content="([^"]+)"/i);
      if (videoUrlMatch && videoUrlMatch[1]) {
        const videoUrl = videoUrlMatch[1];

        // Extract thumbnail/image
        const imageUrlMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
        const thumbnail = imageUrlMatch ? imageUrlMatch[1] : '';

        // Extract title
        let title = 'Instagram Video';
        const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1];
        }

        return {
          title,
          url: videoUrl,
          thumbnail,
        };
      }

      // Otherwise extract image URL
      const imageUrlMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
      if (imageUrlMatch && imageUrlMatch[1]) {
        const imageUrl = imageUrlMatch[1];

        // Extract title
        let title = 'Instagram Image';
        const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1];
        }

        return {
          title,
          url: imageUrl,
          thumbnail: imageUrl,
        };
      }

      throw new Error('No media found in Instagram page');
    }
  } catch (error) {
    console.error(`Instagram media extraction error: ${error.message}`);
    throw error;
  }
}

module.exports = { downloadInstagramMedia };