// controllers/facebookController.js
const axios = require('axios');
const cheerio = require('cheerio');
const fbVideos = require('fbvideos');
const UserAgent = require('user-agents');

async function downloadFacebookVideo(url) {
  console.log(`Processing Facebook URL: ${url}`);

  // Method 1: Try fbvideos package first (fastest)
  try {
    console.log('Trying fbvideos package...');
    const result = await fbVideos.high(url);

    if (result && result.url) {
      return {
        success: true,
        data: {
          title: 'Facebook Video',
          url: result.url,
          thumbnail: 'https://via.placeholder.com/300x150',
          quality: 'High Quality',
          source: 'facebook'
        }
      };
    }
  } catch (error) {
    console.warn('fbvideos failed, trying mobile scraping...');
  }

  // Method 2: Mobile Facebook scraping (lightweight)
  try {
    const mobileUrl = url.replace('www.facebook.com', 'm.facebook.com')
        .replace('facebook.com', 'm.facebook.com');

    const userAgent = new UserAgent({ deviceCategory: 'mobile' });

    const response = await axios.get(mobileUrl, {
      headers: {
        'User-Agent': userAgent.toString(),
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    let videoUrl = null;
    const title = $('title').text() || 'Facebook Video';

    // Look for video in mobile page
    $('video source').each((i, elem) => {
      const src = $(elem).attr('src');
      if (src && src.includes('video')) {
        videoUrl = src;
        return false;
      }
    });

    // If no video element, look in page source
    if (!videoUrl) {
      const pageSource = response.data;
      const videoMatch = pageSource.match(/"src":"([^"]*video[^"]*)"/);
      if (videoMatch) {
        videoUrl = videoMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
      }
    }

    if (videoUrl) {
      return {
        success: true,
        data: {
          title: title,
          url: videoUrl,
          thumbnail: 'https://via.placeholder.com/300x150',
          quality: 'Original Quality',
          source: 'facebook'
        }
      };
    }

  } catch (error) {
    console.error('Facebook mobile scraping failed:', error.message);
  }

  throw new Error('All Facebook download methods failed');
}

module.exports = { downloadFacebookVideo };