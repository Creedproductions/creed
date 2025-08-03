// controllers/pinterestController.js
const axios = require('axios');

async function downloadPinterestMedia(url) {
    console.log(`📌 Processing Pinterest URL: ${url}`);

    try {
        // Method 1: Try jer-api first
        try {
            const { pindl } = require('jer-api');

            const result = await pindl(url);

            if (result && result.data && result.data.result) {
                console.log(`✅ Pinterest media extracted with jer-api`);

                return {
                    title: 'Pinterest Media',
                    url: result.data.result,
                    thumbnail: result.data.result,
                    isVideo: result.data.result.includes('.mp4')
                };
            }
        } catch (jerError) {
            console.warn(`jer-api failed for Pinterest: ${jerError.message}`);
        }

        // Method 2: Direct page scraping
        try {
            console.log('Trying direct Pinterest page scraping...');

            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                }
            });

            const html = response.data;

            // Extract title
            let title = 'Pinterest Media';
            const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
            if (titleMatch && titleMatch[1]) {
                title = titleMatch[1].replace(' | Pinterest', '').trim();
            }

            // Look for video first
            const videoPatterns = [
                /"video_url":"([^"]+)"/i,
                /<meta property="og:video" content="([^"]+)"/i,
                /"v_720p":"([^"]+)"/i,
                /"v_480p":"([^"]+)"/i
            ];

            for (const pattern of videoPatterns) {
                const match = html.match(pattern);
                if (match && match[1]) {
                    let videoUrl = match[1]
                        .replace(/\\u002F/g, '/')
                        .replace(/\\\//g, '/')
                        .replace(/\\/g, '')
                        .replace(/&amp;/g, '&');

                    console.log(`✅ Pinterest video found`);

                    // Get thumbnail
                    let thumbnail = '';
                    const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
                    if (ogImageMatch && ogImageMatch[1]) {
                        thumbnail = ogImageMatch[1];
                    }

                    return {
                        title,
                        url: videoUrl,
                        thumbnail: thumbnail || videoUrl,
                        isVideo: true
                    };
                }
            }

            // If no video, look for images
            let imageUrls = [];

            // Look for high-res originals
            const originalImages = html.match(/https:\/\/i\.pinimg\.com\/originals\/[a-zA-Z0-9\/\._-]+\.(?:jpg|jpeg|png|gif|webp)/gi);
            if (originalImages && originalImages.length > 0) {
                imageUrls = [...new Set(originalImages)];
            }

            if (imageUrls.length === 0) {
                // Look for sized images
                const sizedImages = html.match(/https:\/\/i\.pinimg\.com\/[0-9]+x(?:\/[a-zA-Z0-9\/\._-]+\.(?:jpg|jpeg|png|gif|webp))/gi);
                if (sizedImages && sizedImages.length > 0) {
                    imageUrls = [...new Set(sizedImages)];
                }
            }

            if (imageUrls.length === 0) {
                // Fallback to og:image
                const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
                if (ogImageMatch && ogImageMatch[1]) {
                    imageUrls.push(ogImageMatch[1]);
                }
            }

            if (imageUrls.length === 0) {
                throw new Error('No media found on Pinterest page');
            }

            // Sort images by quality (originals first)
            imageUrls.sort((a, b) => {
                if (a.includes('/originals/') && !b.includes('/originals/')) return -1;
                if (!a.includes('/originals/') && b.includes('/originals/')) return 1;
                return b.length - a.length;
            });

            const bestImageUrl = imageUrls[0];
            console.log(`✅ Pinterest image found`);

            return {
                title,
                url: bestImageUrl,
                thumbnail: bestImageUrl,
                isVideo: false
            };

        } catch (scrapingError) {
            console.error(`Direct scraping failed: ${scrapingError.message}`);
            throw scrapingError;
        }

    } catch (error) {
        console.error(`❌ Pinterest extraction error: ${error.message}`);
        throw new Error(`Failed to download Pinterest media: ${error.message}`);
    }
}

module.exports = { downloadPinterestMedia };