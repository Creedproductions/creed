// controllers/facebookController.js
const axios = require('axios');
const cheerio = require('cheerio');
const fbVideos = require('fbvideos');
const UserAgent = require('user-agents');

async function downloadFacebookVideo(url) {
  console.log(`Processing Facebook URL: ${url}`);

  // Method 1: Try fbvideos package first
  try {
    console.log('Trying fbvideos high quality...');
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
    console.warn('fbvideos high failed, trying low...');
    try {
      const result = await fbVideos.low(url);
      if (result && result.url) {
        return {
          success: true,
          data: {
            title: 'Facebook Video',
            url: result.url,
            thumbnail: 'https://via.placeholder.com/300x150',
            quality: 'Standard Quality',
            source: 'facebook'
          }
        };
      }
    } catch (lowError) {
      console.warn('fbvideos failed completely, trying scraping...');
    }
  }

  // Method 2: Mobile scraping with enhanced patterns
  try {
    console.log('Trying mobile Facebook scraping...');

    // Handle different Facebook URL types
    let mobileUrl = url;
    if (url.includes('/reel/')) {
      const reelMatch = url.match(/\/reel\/(\d+)/);
      if (reelMatch) {
        mobileUrl = `https://m.facebook.com/watch/?v=${reelMatch[1]}`;
      }
    } else {
      mobileUrl = url.replace('www.facebook.com', 'm.facebook.com');
      if (!mobileUrl.includes('m.facebook.com')) {
        mobileUrl = url.replace('facebook.com', 'm.facebook.com');
      }
    }

    const userAgent = new UserAgent({ deviceCategory: 'mobile' });
    const response = await axios.get(mobileUrl, {
      headers: {
        'User-Agent': userAgent.toString(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 20000
    });

    const $ = cheerio.load(response.data);
    let videoUrl = null;
    const title = $('title').text() || 'Facebook Video';

    // Look for video sources
    $('video source, video').each((i, elem) => {
      const src = $(elem).attr('src');
      if (src && src.includes('video')) {
        videoUrl = src;
        return false;
      }
    });

    // Enhanced pattern matching
    if (!videoUrl) {
      const pageSource = response.data;
      const patterns = [
        /"src":"([^"]*video[^"]*)"/,
        /"hd_src":"([^"]+)"/,
        /"sd_src":"([^"]+)"/,
        /"browser_native_hd_url":"([^"]+)"/,
        /"browser_native_sd_url":"([^"]+)"/,
        /"playable_url":"([^"]+)"/,
        /"playable_url_quality_hd":"([^"]+)"/,
        /"video_url":"([^"]+)"/
      ];

      for (const pattern of patterns) {
        const match = pageSource.match(pattern);
        if (match && match[1]) {
          videoUrl = match[1]
              .replace(/\\u0026/g, '&')
              .replace(/\\\//g, '/')
              .replace(/\\"/g, '"');
          break;
        }
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
    console.error('Mobile scraping failed:', error.message);
  }

  // Method 3: Desktop scraping fallback
  try {
    console.log('Trying desktop Facebook scraping...');

    const userAgent = new UserAgent({ deviceCategory: 'desktop' });
    const response = await axios.get(url, {
      headers: {
        'User-Agent': userAgent.toString(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 25000
    });

    const pageSource = response.data;
    const patterns = [
      /"playable_url":"([^"]+)"/,
      /"playable_url_quality_hd":"([^"]+)"/,
      /"browser_native_hd_url":"([^"]+)"/,
      /"browser_native_sd_url":"([^"]+)"/,
      /"hd_src":"([^"]+)"/,
      /"sd_src":"([^"]+)"/
    ];

    for (const pattern of patterns) {
      const match = pageSource.match(pattern);
      if (match && match[1]) {
        const videoUrl = match[1]
            .replace(/\\u0026/g, '&')
            .replace(/\\\//g, '/')
            .replace(/\\"/g, '"');

        return {
          success: true,
          data: {
            title: 'Facebook Video',
            url: videoUrl,
            thumbnail: 'https://via.placeholder.com/300x150',
            quality: 'Original Quality',
            source: 'facebook'
          }
        };
      }
    }

  } catch (error) {
    console.error('Desktop scraping failed:', error.message);
  }

  throw new Error('All Facebook download methods failed. Video may be private or restricted.');
}

module.exports = { downloadFacebookVideo };