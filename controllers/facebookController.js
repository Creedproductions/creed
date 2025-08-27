// controllers/facebookController.js
const snapsave = require("metadownloader");

// Build a proxied URL so downloads always flow through /api/direct
function makeProxy(mediaUrl, title = 'Facebook Video') {
  const safe = (title || 'Facebook Video')
    .replace(/[^\w\-]+/g, '_')
    .slice(0, 60);
  return `/api/direct?url=${encodeURIComponent(mediaUrl)}&referer=facebook.com&filename=${encodeURIComponent(safe)}.mp4`;
}

function cleanTitle(str) {
  if (!str) return 'Facebook Video';
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim() || 'Facebook Video';
}

async function facebookInsta(url) {
  try {
    console.log(`Calling metadownloader with URL: ${url}`);
    const result = await snapsave(url);
    console.log('Metadownloader raw result:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('Metadownloader error:', error);
    throw new Error("Error fetching media: " + error.message);
  }
}

async function downloadFacebookVideo(url) {
  console.log(`Processing Facebook URL: ${url}`);

  try {
    const result = await facebookInsta(url);

    if (!result || !Array.isArray(result.data) || result.data.length === 0) {
      if (!result) {
        throw new Error('No response from metadownloader API');
      } else if (!result.data) {
        throw new Error('Invalid response format: no data property found');
      } else {
        throw new Error('No downloadable links found for this Facebook video');
      }
    }

    const title = cleanTitle(result.title || 'Facebook Video');
    const thumbnail = result.thumbnail || 'https://via.placeholder.com/300x150';
    const duration = result.duration || null;

    // First/best
    const first = result.data[0];

    // Build proxied formats (NO shortening)
    const formats = result.data.map((link, index) => ({
      itag: String(index),
      quality: link.resolution || 'Unknown',
      url: makeProxy(link.url, title),
      mimeType: 'video/mp4',
      hasAudio: true,
      hasVideo: true,
      contentLength: 0
    }));

    return {
        success: true,
        data: {
            title,
            url: first.url, // Direct URL instead of proxy
            thumbnail,
            quality: first.resolution || 'Best Available',
            duration,
            source: 'facebook'
        }
    };
  } catch (error) {
    console.error('Facebook controller failed:', error.message);
    if (error.message.includes('Error fetching media:')) {
      throw new Error(`Facebook download failed: ${error.message}`);
    } else {
      throw new Error(`Facebook download failed: ${error.message}`);
    }
  }
}

module.exports = { downloadFacebookVideo, facebookInsta };
