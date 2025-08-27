// controllers/pinterestController.js
const axios = require('axios');
const ytDlp = require('yt-dlp-exec');
const fs = require('fs');
const path = require('path');

// Helper function: validate media URL using a HEAD request.
async function validateMediaUrl(url, expectedType) {
    try {
        const response = await axios.head(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const contentType = response.headers['content-type'];
        return contentType && contentType.includes(expectedType);
    } catch (error) {
        console.warn(`Media URL validation failed: ${error.message}`);
        return false;
    }
}

async function downloadPinterestMedia(url) {
    console.log(`Processing Pinterest URL: ${url}`);

    try {
        // Fetch page HTML.
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        });
        const html = response.data;

        // Extract title.
        let title = 'Pinterest Media';
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
            title = titleMatch[1].replace(' | Pinterest', '').trim();
        }
        console.log(`Fetched HTML sample (first 500 chars): ${html.substring(0, 500)}`);

        // ----- Attempt Video Extraction -----
        // 1. Check og:video meta tag.
        let ogVideoMatch = html.match(/<meta property="og:video" content="([^"]+)"\/?>/i);
        if (ogVideoMatch && ogVideoMatch[1]) {
            let candidateVideo = ogVideoMatch[1]
                .replace(/\\u002F/g, '/')
                .replace(/&amp;/g, '&')
                .trim();
            console.log(`Found og:video meta tag: ${candidateVideo}`);
            if (await validateMediaUrl(candidateVideo, 'video')) {
                console.log("og:video URL validated as video.");
                let thumbnail = '';
                const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"\/?>/i);
                if (ogImageMatch && ogImageMatch[1]) {
                    thumbnail = ogImageMatch[1];
                }
                return {
                    imran: {
                        title,
                        url: candidateVideo,
                        thumbnail: thumbnail || candidateVideo,
                        isVideo: true
                    }
                };
            } else {
                console.warn("og:video URL failed validation.");
            }
        }

        // 2. Try regex extraction patterns.
        const videoPatterns = [
            /"video_url":"([^"]+)"/i,
            /"v_720p":"([^"]+)"/i,
            /"v_480p":"([^"]+)"/i,
            /data-video-url="([^"]+)"/i,
            /property="og:video:url" content="([^"]+)"/i
        ];
        for (const pattern of videoPatterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
                let videoUrl = match[1]
                    .replace(/\\u002F/g, '/')
                    .replace(/\\\//g, '/')
                    .replace(/\\/g, '')
                    .replace(/&amp;/g, '&')
                    .trim();
                console.log(`Regex candidate video URL: ${videoUrl.substring(0, 100)}...`);
                if (await validateMediaUrl(videoUrl, 'video')) {
                    console.log("Candidate video URL validated successfully.");
                    let thumbnail = '';
                    const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"\/?>/i);
                    if (ogImageMatch && ogImageMatch[1]) {
                        thumbnail = ogImageMatch[1];
                    }
                    return {
                        imran: {
                            title,
                            url: videoUrl,
                            thumbnail: thumbnail || videoUrl,
                            isVideo: true
                        }
                    };
                } else {
                    console.warn("Candidate video URL failed validation.");
                }
            }
        }

        // 3. Fallback: Use yt-dlp extraction.
        console.log("Falling back to yt-dlp extraction for Pinterest video");
        const TEMP_DIR = path.join(__dirname, '../temp');
        if (!fs.existsSync(TEMP_DIR)) {
            fs.mkdirSync(TEMP_DIR, { recursive: true });
        }
        const uniqueId = Date.now();
        const tempFilePath = path.join(TEMP_DIR, `pinterest-video-${uniqueId}.mp4`);
        try {
            await ytDlp(url, {
                output: tempFilePath,
                noCheckCertificates: true,
                noWarnings: true,
                verbose: true,
                addHeader: [
                    'referer:https://www.pinterest.com',
                    'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                ]
            });
            if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 10000) {
                console.log(`yt-dlp downloaded file: ${tempFilePath}`);
                const videoUrl = `/api/stream-file?path=${encodeURIComponent(tempFilePath)}`;
                return {
                    imran: {
                        title,
                        url: videoUrl,
                        thumbnail: videoUrl, // Optionally, you could use a separate extracted thumbnail if available.
                        isVideo: true,
                        localFilePath: tempFilePath
                    }
                };
            }
        } catch (ytDlpError) {
            console.error(`yt-dlp video extraction failed: ${ytDlpError.message}`);
        }
        // ----- End Video Extraction -----

        // If no video was detected at all, fall back to image extraction.
        console.log("No valid video detected; processing as an image");
        let imageUrls = [];
        const originalImages = html.match(/https:\/\/i\.pinimg\.com\/originals\/[a-zA-Z0-9\/\._-]+\.(?:jpg|jpeg|png|gif|webp)/gi);
        if (originalImages && originalImages.length > 0) {
            console.log(`Found ${originalImages.length} original images`);
            imageUrls = [...new Set(originalImages)];
        }
        if (imageUrls.length === 0) {
            console.log("No originals found, searching for sized images");
            const sizedImages = html.match(/https:\/\/i\.pinimg\.com\/[0-9]+x(?:\/[a-zA-Z0-9\/\._-]+\.(?:jpg|jpeg|png|gif|webp))/gi);
            if (sizedImages && sizedImages.length > 0) {
                imageUrls = [...new Set(sizedImages)];
            }
        }
        if (imageUrls.length === 0) {
            const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"\/?>/i);
            if (ogImageMatch && ogImageMatch[1]) {
                imageUrls.push(ogImageMatch[1]);
            }
        }
        if (imageUrls.length === 0) {
            throw new Error('No media found on this Pinterest page');
        }
        imageUrls.sort((a, b) => {
            if (a.includes('/originals/') && !b.includes('/originals/')) return -1;
            if (!a.includes('/originals/') && b.includes('/originals/')) return 1;
            return b.length - a.length;
        });
        const bestImageUrl = imageUrls[0];
        console.log(`Selected image URL: ${bestImageUrl}`);
        if (!await validateMediaUrl(bestImageUrl, 'image')) {
            throw new Error('Selected image URL failed validation');
        }
        return {
            imran: {
                title,
                url: bestImageUrl,
                thumbnail: bestImageUrl,
                isVideo: false
            }
        };

    } catch (error) {
        console.error(`Pinterest extraction failed: ${error.message}`);
        throw new Error(`Failed to download Pinterest media: ${error.message}`);
    }
}

module.exports = { downloadPinterestMedia };
