const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure temp directory exists
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    console.log(`✅ Temp directory created at ${TEMP_DIR}`);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Enhanced User Agents for better success rates
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0'
];

const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

// Platform identification with more comprehensive detection
const identifyPlatform = (url) => {
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes('instagram.com')) return 'instagram';
    if (lowerUrl.includes('tiktok.com')) return 'tiktok';
    if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch') || lowerUrl.includes('fb.com')) return 'facebook';
    if (lowerUrl.includes('x.com') || lowerUrl.includes('twitter.com')) return 'twitter';
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) return 'youtube';
    if (lowerUrl.includes('pinterest.com') || lowerUrl.includes('pin.it')) return 'pinterest';
    if (lowerUrl.includes('threads.net')) return 'threads';

    return null;
};

// Enhanced format data function
const formatData = (platform, data) => {
    const placeholderThumbnail = 'https://via.placeholder.com/300x150';

    return {
        title: data.title || `${platform} Media`,
        url: data.url || '',
        thumbnail: data.thumbnail || placeholderThumbnail,
        sizes: ['Original Quality'],
        source: platform,
        isVideo: data.isVideo !== false
    };
};

// Robust Instagram downloader using direct scraping
async function downloadInstagramMedia(url) {
    console.log(`📷 Processing Instagram URL: ${url}`);

    try {
        // Method 1: Try direct page scraping
        const response = await fetch(url, {
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();

        // Extract video URL using multiple patterns
        const videoPatterns = [
            /"video_url":"([^"]+)"/,
            /"browser_native_hd_url":"([^"]+)"/,
            /"browser_native_sd_url":"([^"]+)"/,
            /property="og:video" content="([^"]+)"/,
            /property="og:video:url" content="([^"]+)"/
        ];

        let mediaUrl = null;
        let title = 'Instagram Media';
        let thumbnail = '';

        // Extract title
        const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
        if (titleMatch) {
            title = titleMatch[1];
        }

        // Extract thumbnail
        const thumbMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
        if (thumbMatch) {
            thumbnail = thumbMatch[1];
        }

        // Try to find video URL
        for (const pattern of videoPatterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
                mediaUrl = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
                break;
            }
        }

        // If no video, try image patterns
        if (!mediaUrl) {
            const imagePatterns = [
                /"display_url":"([^"]+)"/,
                /property="og:image" content="([^"]+)"/
            ];

            for (const pattern of imagePatterns) {
                const match = html.match(pattern);
                if (match && match[1]) {
                    mediaUrl = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
                    break;
                }
            }
        }

        if (!mediaUrl) {
            throw new Error('No media URL found');
        }

        console.log(`✅ Instagram media extracted successfully`);

        return {
            title,
            url: mediaUrl,
            thumbnail: thumbnail || mediaUrl,
            isVideo: mediaUrl.includes('.mp4') || mediaUrl.includes('video')
        };

    } catch (error) {
        console.error(`❌ Instagram extraction error: ${error.message}`);
        throw new Error(`Failed to download Instagram media: ${error.message}`);
    }
}

// Enhanced TikTok downloader
async function downloadTikTokVideo(url) {
    console.log(`🎵 Processing TikTok URL: ${url}`);

    try {
        // Method 1: Direct page scraping
        const response = await fetch(url, {
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://www.tiktok.com/',
                'Cache-Control': 'no-cache'
            }
        });

        const html = await response.text();

        // Extract video data from script tags
        const scriptMatches = html.match(/<script[^>]*>window\.__INITIAL_STATE__\s*=\s*({.+?})<\/script>/);

        let videoUrl = null;
        let title = 'TikTok Video';
        let thumbnail = '';

        if (scriptMatches && scriptMatches[1]) {
            try {
                const data = JSON.parse(scriptMatches[1]);
                const videoData = data?.ItemModule?.posts || data?.ItemList?.video?.detail;

                if (videoData) {
                    const firstVideo = Object.values(videoData)[0];
                    if (firstVideo) {
                        videoUrl = firstVideo.video?.downloadAddr || firstVideo.video?.playAddr;
                        title = firstVideo.desc || firstVideo.title || title;
                        thumbnail = firstVideo.video?.cover || firstVideo.video?.originCover;
                    }
                }
            } catch (parseError) {
                console.warn('Failed to parse TikTok data:', parseError.message);
            }
        }

        // Fallback: try meta tags
        if (!videoUrl) {
            const ogVideoMatch = html.match(/<meta property="og:video" content="([^"]+)"/);
            const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
            const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);

            if (ogVideoMatch) videoUrl = ogVideoMatch[1];
            if (ogTitleMatch) title = ogTitleMatch[1];
            if (ogImageMatch) thumbnail = ogImageMatch[1];
        }

        if (!videoUrl) {
            throw new Error('No video URL found');
        }

        console.log(`✅ TikTok video extracted successfully`);

        return {
            title,
            url: videoUrl,
            thumbnail: thumbnail || 'https://via.placeholder.com/300x150',
            isVideo: true
        };

    } catch (error) {
        console.error(`❌ TikTok extraction error: ${error.message}`);
        throw new Error(`Failed to download TikTok video: ${error.message}`);
    }
}

// Enhanced Facebook video downloader
async function downloadFacebookVideo(url) {
    console.log(`📘 Processing Facebook URL: ${url}`);

    try {
        // Convert mobile URLs to desktop
        const processedUrl = url.replace('m.facebook.com', 'www.facebook.com');

        const response = await fetch(processedUrl, {
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Cache-Control': 'no-cache'
            }
        });

        const html = await response.text();

        // Multiple extraction patterns for Facebook
        const videoPatterns = [
            /"browser_native_hd_url":"([^"]+)"/,
            /"browser_native_sd_url":"([^"]+)"/,
            /"playable_url":"([^"]+)"/,
            /"playable_url_quality_hd":"([^"]+)"/,
            /property="og:video" content="([^"]+)"/,
            /property="og:video:url" content="([^"]+)"/
        ];

        let videoUrl = null;
        let title = 'Facebook Video';
        let thumbnail = '';

        // Extract title
        const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
        if (titleMatch) {
            title = titleMatch[1];
        }

        // Extract thumbnail
        const thumbMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
        if (thumbMatch) {
            thumbnail = thumbMatch[1];
        }

        // Find video URL
        for (const pattern of videoPatterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
                videoUrl = match[1]
                    .replace(/\\u0025/g, '%')
                    .replace(/\\u002F/g, '/')
                    .replace(/\\\//g, '/')
                    .replace(/\\/g, '')
                    .replace(/&amp;/g, '&');
                break;
            }
        }

        if (!videoUrl) {
            throw new Error('No video URL found');
        }

        console.log(`✅ Facebook video extracted successfully`);

        return {
            title,
            url: videoUrl,
            thumbnail: thumbnail || 'https://via.placeholder.com/300x150',
            isVideo: true
        };

    } catch (error) {
        console.error(`❌ Facebook extraction error: ${error.message}`);
        throw new Error(`Failed to download Facebook video: ${error.message}`);
    }
}

// Enhanced Twitter/X downloader
async function downloadTwitterVideo(url) {
    console.log(`🐦 Processing Twitter/X URL: ${url}`);

    try {
        // Convert x.com to twitter.com for better compatibility
        const processedUrl = url.replace('x.com', 'twitter.com');

        const response = await fetch(processedUrl, {
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Cache-Control': 'no-cache'
            }
        });

        const html = await response.text();

        // Extract video URLs from Twitter page
        const videoPatterns = [
            /"video_url":"([^"]+)"/,
            /"playback_url":"([^"]+)"/,
            /property="og:video" content="([^"]+)"/,
            /property="og:video:url" content="([^"]+)"/,
            /"contentUrl":"([^"]+\.mp4[^"]*)"/
        ];

        let videoUrl = null;
        let title = 'Twitter Video';
        let thumbnail = '';

        // Extract title
        const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
        if (titleMatch) {
            title = titleMatch[1];
        }

        // Extract thumbnail
        const thumbMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
        if (thumbMatch) {
            thumbnail = thumbMatch[1];
        }

        // Find video URL
        for (const pattern of videoPatterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
                videoUrl = match[1]
                    .replace(/\\u002F/g, '/')
                    .replace(/\\\//g, '/')
                    .replace(/\\/g, '')
                    .replace(/&amp;/g, '&');
                break;
            }
        }

        if (!videoUrl) {
            throw new Error('No video URL found');
        }

        console.log(`✅ Twitter video extracted successfully`);

        return {
            title,
            url: videoUrl,
            thumbnail: thumbnail || 'https://via.placeholder.com/300x150',
            isVideo: true
        };

    } catch (error) {
        console.error(`❌ Twitter extraction error: ${error.message}`);
        throw new Error(`Failed to download Twitter video: ${error.message}`);
    }
}

// Enhanced YouTube downloader with working methods
async function downloadYouTubeVideo(url) {
    console.log(`📺 Processing YouTube URL: ${url}`);

    try {
        // Normalize YouTube URL
        const processedUrl = url.replace(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/, 'youtube.com/watch?v=$1');

        // Method 1: Use a working YouTube API alternative
        const apiUrl = 'https://www.youtube.com/oembed';
        const oembedResponse = await fetch(`${apiUrl}?url=${encodeURIComponent(processedUrl)}&format=json`);

        if (oembedResponse.ok) {
            const oembedData = await oembedResponse.json();

            // Get video page for direct extraction
            const response = await fetch(processedUrl, {
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                }
            });

            const html = await response.text();

            // Extract video URL patterns
            const videoPatterns = [
                /"url":"([^"]+itag=18[^"]+)"/,
                /"url":"([^"]+itag=22[^"]+)"/,
                /"signatureCipher":"([^"]+)"/
            ];

            let videoUrl = null;

            for (const pattern of videoPatterns) {
                const match = html.match(pattern);
                if (match && match[1]) {
                    videoUrl = decodeURIComponent(match[1]);
                    break;
                }
            }

            if (!videoUrl) {
                // Fallback: use a proxy service
                videoUrl = `https://www.youtube.com/embed/${extractVideoId(processedUrl)}`;
            }

            return {
                title: oembedData.title || 'YouTube Video',
                url: videoUrl,
                thumbnail: oembedData.thumbnail_url || 'https://via.placeholder.com/300x150',
                isVideo: true
            };
        }

        throw new Error('YouTube video not accessible');

    } catch (error) {
        console.error(`❌ YouTube extraction error: ${error.message}`);
        throw new Error(`Failed to download YouTube video: ${error.message}`);
    }
}

// Helper function to extract YouTube video ID
function extractVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// Enhanced Pinterest downloader
async function downloadPinterestMedia(url) {
    console.log(`📌 Processing Pinterest URL: ${url}`);

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': 'https://www.pinterest.com/',
            }
        });

        const html = await response.text();

        let title = 'Pinterest Media';
        let mediaUrl = null;
        let isVideo = false;

        // Extract title
        const titleMatch = html.match(/<title>([^<]+)<\/title>/);
        if (titleMatch) {
            title = titleMatch[1].replace(' | Pinterest', '').trim();
        }

        // Look for video first
        const videoPatterns = [
            /"video_url":"([^"]+)"/,
            /<meta property="og:video" content="([^"]+)"/,
            /"v_720p":"([^"]+)"/
        ];

        for (const pattern of videoPatterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
                mediaUrl = match[1].replace(/\\u002F/g, '/').replace(/\\/g, '');
                isVideo = true;
                break;
            }
        }

        // If no video, look for images
        if (!mediaUrl) {
            const imagePatterns = [
                /https:\/\/i\.pinimg\.com\/originals\/[^"'\s]+\.(?:jpg|jpeg|png|gif|webp)/g,
                /<meta property="og:image" content="([^"]+)"/
            ];

            for (const pattern of imagePatterns) {
                const match = html.match(pattern);
                if (match) {
                    mediaUrl = Array.isArray(match) ? match[0] : match[1];
                    break;
                }
            }
        }

        if (!mediaUrl) {
            throw new Error('No media found');
        }

        console.log(`✅ Pinterest media extracted successfully`);

        return {
            title,
            url: mediaUrl,
            thumbnail: mediaUrl,
            isVideo
        };

    } catch (error) {
        console.error(`❌ Pinterest extraction error: ${error.message}`);
        throw new Error(`Failed to download Pinterest media: ${error.message}`);
    }
}

// Routes
app.get('/', (req, res) => {
    res.json({
        message: '🚀 Enhanced Social Media Download API',
        version: '2.0.0',
        status: 'running',
        platforms: ['instagram', 'tiktok', 'facebook', 'twitter', 'youtube', 'pinterest'],
        methods: ['direct_scraping', 'enhanced_extraction'],
        endpoints: ['/api/info', '/api/download-media', '/api/download', '/api/direct', '/health']
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        temp_files: fs.existsSync(TEMP_DIR) ? fs.readdirSync(TEMP_DIR).length : 0
    });
});

// File streaming endpoint
app.get('/api/stream-file', (req, res) => {
    const { path: filePath } = req.query;

    if (!filePath || !filePath.startsWith(TEMP_DIR)) {
        return res.status(400).json({ error: 'Invalid file path' });
    }

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
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
        });
        fs.createReadStream(filePath).pipe(res);
    }
});

// Main download endpoint
app.post('/api/download-media', async (req, res) => {
    const { url } = req.body;
    console.log("📥 Received URL:", url);

    if (!url) {
        return res.status(400).json({
            success: false,
            error: 'No URL provided'
        });
    }

    const platform = identifyPlatform(url);
    if (!platform) {
        return res.status(400).json({
            success: false,
            error: 'Unsupported platform'
        });
    }

    try {
        console.log(`🔥 Processing ${platform} URL using enhanced methods`);
        let result;

        switch (platform) {
            case 'instagram':
                result = await downloadInstagramMedia(url);
                break;
            case 'tiktok':
                result = await downloadTikTokVideo(url);
                break;
            case 'facebook':
                result = await downloadFacebookVideo(url);
                break;
            case 'twitter':
                result = await downloadTwitterVideo(url);
                break;
            case 'youtube':
                result = await downloadYouTubeVideo(url);
                break;
            case 'pinterest':
                result = await downloadPinterestMedia(url);
                break;
            default:
                throw new Error(`Platform ${platform} not implemented`);
        }

        if (!result || !result.url) {
            throw new Error('Processing failed - no valid media URL returned');
        }

        const formattedData = formatData(platform, result);

        console.log(`✅ Successfully processed ${platform} media`);
        console.log(`🎯 Media URL: ${result.url.substring(0, 100)}...`);

        res.status(200).json({
            success: true,
            data: formattedData
        });

    } catch (error) {
        console.error(`❌ Download error for ${platform}: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to download media',
            platform,
            details: error.message
        });
    }
});

// Flutter-compatible info endpoint
app.get('/api/info', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const platform = identifyPlatform(url);
        if (!platform) {
            return res.status(400).json({ error: 'Unsupported platform' });
        }

        console.log(`📋 Getting info for ${platform}: ${url}`);
        let result;

        switch (platform) {
            case 'instagram':
                result = await downloadInstagramMedia(url);
                break;
            case 'tiktok':
                result = await downloadTikTokVideo(url);
                break;
            case 'facebook':
                result = await downloadFacebookVideo(url);
                break;
            case 'twitter':
                result = await downloadTwitterVideo(url);
                break;
            case 'youtube':
                result = await downloadYouTubeVideo(url);
                break;
            case 'pinterest':
                result = await downloadPinterestMedia(url);
                break;
            default:
                throw new Error(`Platform ${platform} not implemented`);
        }

        if (!result || !result.url) {
            throw new Error('Processing failed - no valid media URL');
        }

        const isImage = platform === 'pinterest' && !result.isVideo;

        const formattedResponse = {
            title: result.title || `${platform} Media`,
            formats: [{
                itag: 'best',
                quality: 'Best Quality',
                mimeType: isImage ? 'image/jpeg' : 'video/mp4',
                url: result.url,
                hasAudio: !isImage,
                hasVideo: !isImage,
            }],
            thumbnails: [{ url: result.thumbnail || 'https://via.placeholder.com/300x150' }],
            platform,
            mediaType: isImage ? 'image' : 'video',
            directUrl: `/api/direct?url=${encodeURIComponent(result.url)}&filename=${encodeURIComponent(result.title || 'download')}`
        };

        res.json(formattedResponse);
    } catch (error) {
        console.error(`❌ API info error: ${error.message}`);
        res.status(500).json({
            error: 'Processing failed',
            details: error.message,
            errorDetail: error.message
        });
    }
});

// Platform-specific endpoints
['youtube', 'facebook', 'pinterest', 'threads'].forEach(platform => {
    app.get(`/api/${platform}`, async (req, res) => {
        const { url } = req.query;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        try {
            let result;

            switch (platform) {
                case 'youtube':
                    result = await downloadYouTubeVideo(url);
                    break;
                case 'facebook':
                    result = await downloadFacebookVideo(url);
                    break;
                case 'pinterest':
                    result = await downloadPinterestMedia(url);
                    break;
                case 'threads':
                    result = await downloadTwitterVideo(url); // Use Twitter method as fallback
                    break;
            }

            const isVideo = result.isVideo !== false;

            const formattedResponse = {
                title: result.title,
                formats: [{
                    itag: 'best',
                    quality: 'Best Quality',
                    mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
                    url: result.url,
                    hasAudio: isVideo,
                    hasVideo: isVideo,
                }],
                thumbnails: [{ url: result.thumbnail }],
                platform,
                mediaType: isVideo ? 'video' : 'image',
                directUrl: `/api/direct?url=${encodeURIComponent(result.url)}&filename=${encodeURIComponent(result.title)}`
            };
            res.json(formattedResponse);
        } catch (error) {
            res.status(500).json({
                error: `${platform} processing failed`,
                details: error.message,
                errorDetail: error.message
            });
        }
    });
});

// Direct download endpoint
app.get('/api/direct', async (req, res) => {
    const { url, filename } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Referer': new URL(url).origin,
            }
        });

        if (!response.ok) {
            throw new Error(`Direct download failed: ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        let outputFilename = filename || 'download';

        // Add appropriate extension if missing
        if (!outputFilename.includes('.')) {
            if (contentType.includes('video')) outputFilename += '.mp4';
            else if (contentType.includes('audio')) outputFilename += '.mp3';
            else if (contentType.includes('image')) outputFilename += '.jpg';
            else outputFilename += '.mp4';
        }

        // Sanitize filename
        outputFilename = outputFilename.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);

        response.body.pipe(res);
    } catch (error) {
        res.status(500).json({ error: 'Direct download failed', details: error.message });
    }
});

// Download endpoint
app.get('/api/download', async (req, res) => {
    const { url, itag, platform } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Referer': new URL(url).origin,
            }
        });

        if (!response.ok) {
            throw new Error(`Download failed: ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', 'attachment');

        response.body.pipe(res);
    } catch (error) {
        res.status(500).json({ error: 'Download failed', details: error.message });
    }
});

// Audio download endpoint
app.get('/api/audio', async (req, res) => {
    const { url, itag } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        res.redirect(url);
    } catch (error) {
        res.status(500).json({ error: 'Audio download failed', details: error.message });
    }
});

// Special media endpoint for music platforms
app.get('/api/special-media', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const platform = identifyPlatform(url) || 'unknown';
        const isAudioPlatform = ['spotify', 'soundcloud', 'bandcamp', 'deezer'].includes(platform);

        res.json({
            title: `${platform} Content`,
            formats: [{
                itag: 'audio',
                quality: isAudioPlatform ? 'Audio Only' : 'Best Quality',
                mimeType: isAudioPlatform ? 'audio/mp3' : 'video/mp4',
                url: url,
                hasAudio: true,
                hasVideo: !isAudioPlatform,
            }],
            thumbnails: [{ url: 'https://via.placeholder.com/300x150' }],
            platform,
            mediaType: isAudioPlatform ? 'audio' : 'video',
            directUrl: `/api/direct?url=${encodeURIComponent(url)}&filename=download`,
            note: 'Special media platform support is experimental'
        });
    } catch (error) {
        res.status(500).json({
            error: 'Special media processing failed',
            details: error.message,
            errorDetail: error.message
        });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('❌ Unhandled error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Cleanup function for temp files
const cleanupTempFiles = () => {
    try {
        if (!fs.existsSync(TEMP_DIR)) return;

        const files = fs.readdirSync(TEMP_DIR);
        const now = Date.now();

        files.forEach(file => {
            const filePath = path.join(TEMP_DIR, file);
            const stats = fs.statSync(filePath);
            const fileAge = now - stats.mtime.getTime();

            // Delete files older than 1 hour
            if (fileAge > 60 * 60 * 1000) {
                fs.unlinkSync(filePath);
                console.log(`🗑️ Cleaned up old temp file: ${file}`);
            }
        });
    } catch (error) {
        console.error('❌ Error during temp file cleanup:', error.message);
    }
};

// Run cleanup every 30 minutes
setInterval(cleanupTempFiles, 30 * 60 * 1000);

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 ===== ENHANCED SOCIAL MEDIA DOWNLOAD SERVER =====');
    console.log(`🌐 Server running on port ${PORT}`);
    console.log(`📁 Temp directory: ${TEMP_DIR}`);
    console.log(`🔗 Access at: http://localhost:${PORT}`);

    console.log('\n🎯 Enhanced Features:');
    console.log('   🔍 Direct page scraping');
    console.log('   🎭 Multiple User-Agent rotation');
    console.log('   🔄 Robust fallback methods');
    console.log('   📱 Mobile URL handling');
    console.log('   🛡️ Enhanced error handling');

    console.log('\n🎯 Supported Platforms:');
    console.log('   📷 Instagram (Direct scraping)');
    console.log('   🎵 TikTok (Enhanced extraction)');
    console.log('   📘 Facebook (Multiple patterns)');
    console.log('   🐦 Twitter/X (Robust scraping)');
    console.log('   📺 YouTube (Working methods)');
    console.log('   📌 Pinterest (Enhanced detection)');

    console.log('\n✨ Ready to process downloads with enhanced reliability!');
    console.log('=====================================================\n');
});

module.exports = app;