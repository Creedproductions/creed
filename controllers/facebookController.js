// controllers/facebookController.js
const axios = require('axios');
const cheerio = require('cheerio');
const fbVideos = require('fbvideos');
const UserAgent = require('user-agents');

async function downloadFacebookVideo(url) {
  console.log(`Processing Facebook URL: ${url}`);

  // Method 1: Enhanced fbvideos with retry
  try {
    console.log('Trying fbvideos with multiple attempts...');

    // Try high quality first
    let result = await fbVideos.high(url).catch(() => null);

    // If high fails, try low
    if (!result || !result.url) {
      result = await fbVideos.low(url).catch(() => null);
    }

    if (result && result.url && result.url.startsWith('http')) {
      console.log(`fbvideos success: ${result.url.substring(0, 100)}...`);
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
    console.warn('fbvideos failed:', error.message);
  }

  // Method 2: Enhanced mobile scraping with better patterns
  try {
    console.log('Trying enhanced mobile scraping...');

    // Convert URL for mobile access
    let mobileUrl = url;

    // Handle reels specially
    if (url.includes('/reel/')) {
      const reelMatch = url.match(/\/reel\/(\d+)/);
      if (reelMatch) {
        mobileUrl = `https://m.facebook.com/watch/?v=${reelMatch[1]}`;
        console.log(`Converted reel to: ${mobileUrl}`);
      }
    } else if (url.includes('fb.watch')) {
      // Extract video ID from fb.watch
      const watchMatch = url.match(/fb\.watch\/([^\/\?\&]+)/);
      if (watchMatch) {
        mobileUrl = `https://m.facebook.com/watch/?v=${watchMatch[1]}`;
      }
    } else {
      // Regular conversion
      mobileUrl = url.replace('www.facebook.com', 'm.facebook.com');
      if (!mobileUrl.includes('m.facebook.com')) {
        mobileUrl = url.replace('facebook.com', 'm.facebook.com');
      }
    }

    console.log(`Using mobile URL: ${mobileUrl}`);

    const response = await axios.get(mobileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 25000,
      maxRedirects: 5
    });

    console.log(`Mobile page loaded: ${response.data.length} bytes`);

    const $ = cheerio.load(response.data);
    let videoUrl = null;
    const title = $('title').text() || 'Facebook Video';

    // Method A: Look for video elements
    $('video').each((i, elem) => {
      const src = $(elem).attr('src');
      if (src && src.includes('video') && src.startsWith('http')) {
        videoUrl = src;
        console.log(`Found video element: ${src.substring(0, 100)}...`);
        return false;
      }
    });

    // Method B: Look for source elements
    if (!videoUrl) {
      $('video source').each((i, elem) => {
        const src = $(elem).attr('src');
        if (src && src.includes('video') && src.startsWith('http')) {
          videoUrl = src;
          console.log(`Found source element: ${src.substring(0, 100)}...`);
          return false;
        }
      });
    }

    // Method C: Enhanced regex patterns on page source
    if (!videoUrl) {
      const pageSource = response.data;
      console.log('Searching page source with enhanced patterns...');

      const enhancedPatterns = [
        // High definition patterns
        /"hd_src":"([^"]+)"/,
        /"hd_src_no_ratelimit":"([^"]+)"/,
        // Standard definition patterns
        /"sd_src":"([^"]+)"/,
        /"sd_src_no_ratelimit":"([^"]+)"/,
        // Browser native patterns
        /"browser_native_hd_url":"([^"]+)"/,
        /"browser_native_sd_url":"([^"]+)"/,
        // Playable URL patterns
        /"playable_url":"([^"]+)"/,
        /"playable_url_quality_hd":"([^"]+)"/,
        // Generic video patterns
        /"video_url":"([^"]+)"/,
        /"src":"([^"]*\.mp4[^"]*)"/,
        // Escaped format patterns
        /\\"hd_src\\":\\"([^"]+)\\"/,
        /\\"sd_src\\":\\"([^"]+)\\"/,
        // Direct video patterns
        /https:\/\/video[^"'\s]*\.facebook\.com[^"'\s]*\.mp4[^"'\s]*/,
        /https:\/\/[^"'\s]*\.fbcdn\.net[^"'\s]*\.mp4[^"'\s]*/
      ];

      for (let i = 0; i < enhancedPatterns.length; i++) {
        const pattern = enhancedPatterns[i];
        let match;

        if (pattern.global) {
          const matches = pageSource.match(pattern);
          if (matches && matches.length > 0) {
            match = [null, matches[0]];
          }
        } else {
          match = pageSource.match(pattern);
        }

        if (match && match[1]) {
          videoUrl = match[1]
              .replace(/\\u0026/g, '&')
              .replace(/\\\//g, '/')
              .replace(/\\"/g, '"')
              .replace(/\\/g, '');

          // Validate URL
          if (videoUrl.startsWith('http') && videoUrl.includes('video')) {
            console.log(`Found with pattern ${i + 1}: ${videoUrl.substring(0, 100)}...`);
            break;
          } else {
            videoUrl = null;
          }
        }
      }
    }

    if (videoUrl && videoUrl.startsWith('http')) {
      console.log(`Mobile scraping success: ${videoUrl.substring(0, 100)}...`);
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

  // Method 3: Desktop scraping with different approach
  try {
    console.log('Trying desktop scraping...');

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.facebook.com/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin'
      },
      timeout: 30000
    });

    const pageSource = response.data;
    console.log(`Desktop page loaded: ${pageSource.length} bytes`);

    // Desktop-specific patterns
    const desktopPatterns = [
      /"playable_url":"([^"]+)"/,
      /"playable_url_quality_hd":"([^"]+)"/,
      /"browser_native_hd_url":"([^"]+)"/,
      /"browser_native_sd_url":"([^"]+)"/,
      /"hd_src":"([^"]+)"/,
      /"sd_src":"([^"]+)"/,
      // More aggressive patterns for desktop
      /,"url":"([^"]*video[^"]*\.mp4[^"]*)"/,
      /"video":\{"[^"]*":"([^"]*\.mp4[^"]*)"/
    ];

    for (const pattern of desktopPatterns) {
      const match = pageSource.match(pattern);
      if (match && match[1]) {
        let videoUrl = match[1]
            .replace(/\\u0026/g, '&')
            .replace(/\\\//g, '/')
            .replace(/\\"/g, '"');

        if (videoUrl.startsWith('http') && videoUrl.includes('video')) {
          console.log(`Desktop scraping success: ${videoUrl.substring(0, 100)}...`);
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
    }

  } catch (error) {
    console.error('Desktop scraping failed:', error.message);
  }

  throw new Error('All Facebook download methods failed. Video may be private, restricted, or require login.');
}

module.exports = { downloadFacebookVideo };