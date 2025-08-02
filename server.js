const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const axios = require('axios');

// Import WORKING dependencies from your old server
const { BitlyClient } = require('bitly');
const fetch = require('node-fetch');

// Core working packages from old server
const { ttdl, twitter, igdl } = require('btch-downloader');
const { facebook } = require('@mrnima/facebook-downloader');
const fbAlt = require('@xaviabot/fb-downloader');

// YouTube packages - using recommended youtube-dl-exec
let youtubeDl = null;
try {
    youtubeDl = require('youtube-dl-exec');
    console.log('✅ youtube-dl-exec loaded successfully');
} catch (err) {
    console.warn('⚠️  youtube-dl-exec not available (requires Python)');
}

// Optional ytdl-core as fallback
let ytdlCore = null;
try {
    ytdlCore = require('ytdl-core');
    console.log('✅ ytdl-core loaded as fallback');
} catch (err) {
    console.warn('⚠️  ytdl-core not available');
}

// Import config
let config = {};
try {
    config = require('./config');
} catch (err) {
    console.warn('⚠️  config.js not found, using defaults');
    config = { BITLY_ACCESS_TOKEN: 'your_bitly_token' };
}

// Setup app
const app = express();
const PORT = process.env.PORT || 5000;

// Ensure temp directory exists
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
    console.log('Creating temp directory...');
    try {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
        fs.chmodSync(TEMP_DIR, 0o777);
        console.log(`✅ Temp directory created at ${TEMP_DIR}`);
    } catch (error) {
        console.error(`❌ Error creating temp directory: ${error.message}`);
    }
}

// Middleware
app.use(cors());
app.use(express.json());

// Increase timeout for external requests
http.globalAgent.maxSockets = 25;
https.globalAgent.maxSockets = 25;
http.globalAgent.keepAlive = true;
https.globalAgent.keepAlive = true;

// URL shortener function
const shortenUrl = async (url) => {
    if (!url || url.length < 100) return url;

    try {
        const bitly = new BitlyClient(config.BITLY_ACCESS_TOKEN || 'your_bitly_token');
        const response = await bitly.shorten(url);
        return response.link;
    } catch (error) {
        console.warn("URL shortening failed, using original URL");
        return url;
    }
};

// Platform identification function (from your working old server)
const identifyPlatform = (url) => {
    console.info("🔍 Platform Identification: Determining platform for URL");
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes('instagram.com')) return 'instagram';
    if (lowerUrl.includes('tiktok.com')) return 'tiktok';
    if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch') || lowerUrl.includes('fb.com')) return 'facebook';
    if (lowerUrl.includes('x.com') || lowerUrl.includes('twitter.com')) return 'twitter';
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) return 'youtube';
    if (lowerUrl.includes('pinterest.com') || lowerUrl.includes('pin.it')) return 'pinterest';
    if (lowerUrl.includes('threads.net')) return 'threads';
    if (lowerUrl.includes('reddit.com')) return 'reddit';
    if (lowerUrl.includes('linkedin.com')) return 'linkedin';
    if (lowerUrl.includes('vimeo.com')) return 'vimeo';
    if (lowerUrl.includes('dailymotion.com')) return 'dailymotion';
    if (lowerUrl.includes('twitch.tv')) return 'twitch';
    if (lowerUrl.includes('spotify.com')) return 'spotify';
    if (lowerUrl.includes('soundcloud.com')) return 'soundcloud';

    console.warn("⚠️  Platform not recognized");
    return null;
};

// Enhanced data formatting function (from old server)
const formatData = async (platform, data) => {
    console.info(`📋 Formatting data for platform '${platform}'`);
    const placeholderThumbnail = 'https://via.placeholder.com/300x150';

    switch (platform) {
        case 'youtube':
            const youtubeData = data.data || data;
            return {
                title: youtubeData.title || data.title || 'YouTube Video',
                url: youtubeData.high || youtubeData.low || data.url || '',
                thumbnail: youtubeData.thumbnail || data.thumbnail || placeholderThumbnail,
                sizes: ['High Quality'],
                source: platform,
            };

        case 'instagram':
            if (Array.isArray(data) && data.length > 0) {
                return {
                    title: data[0]?.wm || 'Instagram Media',
                    url: data[0]?.url,
                    thumbnail: data[0]?.thumbnail || placeholderThumbnail,
                    sizes: ['Original Quality'],
                    source: platform,
                };
            }
            return {
                title: data.title || 'Instagram Media',
                url: data.url || '',
                thumbnail: data.thumbnail || placeholderThumbnail,
                sizes: ['Original Quality'],
                source: platform,
            };

        case 'twitter':
            const twitterData = data?.data || data;
            return {
                title: twitterData?.title || data.title || 'Twitter Video',
                url: twitterData?.high || twitterData?.low || data.url || '',
                thumbnail: twitterData?.thumbnail || data.thumbnail || placeholderThumbnail,
                sizes: ['Original Quality'],
                source: platform,
            };

        case 'facebook':
            // Handle multiple Facebook data structures
            if (data.result?.links?.HD || data.result?.links?.SD) {
                return {
                    title: data.title || 'Facebook Video',
                    url: data.result.links.HD || data.result.links.SD,
                    thumbnail: data.result.thumbnail || placeholderThumbnail,
                    sizes: ['Original Quality'],
                    source: platform,
                };
            }
            if (data.hd || data.sd) {
                return {
                    title: data.title || 'Facebook Video',
                    url: data.hd || data.sd,
                    thumbnail: data.thumbnail || placeholderThumbnail,
                    sizes: ['Original Quality'],
                    source: platform,
                };
            }
            return {
                title: data.title || 'Facebook Video',
                url: data.url || '',
                thumbnail: data.thumbnail || placeholderThumbnail,
                sizes: ['Original Quality'],
                source: platform,
            };

        case 'tiktok':
            return {
                title: data.title || 'TikTok Video',
                url: data.video?.[0] || data.url || '',
                thumbnail: data.thumbnail || placeholderThumbnail,
                sizes: ['Original Quality'],
                source: platform,
            };

        case 'pinterest':
            return {
                title: data.title || 'Pinterest Media',
                url: data.url || '',
                thumbnail: data.thumbnail || placeholderThumbnail,
                sizes: ['Original Quality'],
                source: platform,
                isVideo: data.url && data.url.includes('.mp4')
            };

        default:
            return {
                title: data.title || `${platform} Media`,
                url: data.url || '',
                thumbnail: data.thumbnail || placeholderThumbnail,
                sizes: ['Original Quality'],
                source: platform,
            };
    }
};

// Enhanced YouTube handler using youtube-dl-exec
async function processYouTubeVideo(url) {
    console.log(`🎬 Processing YouTube URL: ${url}`);

    try {
        if (!youtubeDl) {
            throw new Error('youtube-dl-exec not available');
        }

        // Get video info first
        const info = await youtubeDl(url, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            extractFlat: false
        });

        if (!info || !info.formats) {
            throw new Error('No video formats found');
        }

        // Find best format (video + audio)
        const bestFormat = info.formats.find(f =>
            f.vcodec !== 'none' && f.acodec !== 'none' &&
            (f.ext === 'mp4' || f.container === 'mp4')
        ) || info.formats.find(f =>
            f.vcodec !== 'none' && f.acodec !== 'none'
        ) || info.formats[0];

        return {
            success: true,
            data: {
                title: info.title || 'YouTube Video',
                url: bestFormat.url,
                thumbnail: info.thumbnail || info.thumbnails?.[0]?.url || 'https://via.placeholder.com/300x150',
                sizes: [`${bestFormat.height || 'Unknown'}p`],
                source: 'youtube',
                duration: info.duration
            }
        };
    } catch (error) {
        console.error(`❌ YouTube processing error: ${error.message}`);

        // Fallback to ytdl-core if available
        if (ytdlCore) {
            try {
                console.log('🔄 Trying ytdl-core fallback...');
                const info = await ytdlCore.getInfo(url);

                const format = info.formats.find(f =>
                    f.hasVideo && f.hasAudio && f.container === 'mp4'
                ) || info.formats.find(f =>
                    f.hasVideo && f.hasAudio
                ) || info.formats[0];

                return {
                    success: true,
                    data: {
                        title: info.videoDetails.title,
                        url: format.url,
                        thumbnail: info.videoDetails.thumbnails?.[0]?.url || 'https://via.placeholder.com/300x150',
                        sizes: [`${format.height || 'Unknown'}p`],
                        source: 'youtube'
                    }
                };
            } catch (fallbackError) {
                console.error(`❌ ytdl-core fallback failed: ${fallbackError.message}`);
            }
        }

        throw error;
    }
}

// Enhanced Pinterest handler using youtube-dl-exec
async function processPinterestMedia(url) {
    console.log(`📌 Processing Pinterest URL: ${url}`);

    try {
        // First try direct page scraping
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch Pinterest page: ${response.status}`);
        }

        const html = await response.text();

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

                console.log(`📹 Found Pinterest video: ${videoUrl}`);

                // Get thumbnail
                let thumbnail = '';
                const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
                if (ogImageMatch && ogImageMatch[1]) {
                    thumbnail = ogImageMatch[1];
                }

                return {
                    success: true,
                    data: {
                        title,
                        url: videoUrl,
                        thumbnail: thumbnail || videoUrl,
                        sizes: ['Original Quality'],
                        source: 'pinterest',
                        isVideo: true
                    }
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
            // Try youtube-dl-exec as last resort
            if (youtubeDl) {
                try {
                    console.log('🔄 Trying youtube-dl-exec for Pinterest...');
                    const info = await youtubeDl(url, {
                        dumpSingleJson: true,
                        noCheckCertificates: true,
                        noWarnings: true
                    });

                    if (info && info.url) {
                        return {
                            success: true,
                            data: {
                                title: info.title || title,
                                url: info.url,
                                thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
                                sizes: ['Original Quality'],
                                source: 'pinterest',
                                isVideo: info.url.includes('.mp4')
                            }
                        };
                    }
                } catch (ytdlError) {
                    console.warn(`youtube-dl-exec failed for Pinterest: ${ytdlError.message}`);
                }
            }

            throw new Error('No media found on Pinterest page');
        }

        // Sort images by quality (originals first)
        imageUrls.sort((a, b) => {
            if (a.includes('/originals/') && !b.includes('/originals/')) return -1;
            if (!a.includes('/originals/') && b.includes('/originals/')) return 1;
            return b.length - a.length;
        });

        const bestImageUrl = imageUrls[0];
        console.log(`🖼️  Found Pinterest image: ${bestImageUrl}`);

        return {
            success: true,
            data: {
                title,
                url: bestImageUrl,
                thumbnail: bestImageUrl,
                sizes: ['Original Quality'],
                source: 'pinterest',
                isVideo: false
            }
        };

    } catch (error) {
        console.error(`❌ Pinterest processing error: ${error.message}`);
        throw error;
    }
}

// Enhanced Twitter handler (from your working old server)
async function processTwitterVideo(url) {
    console.log(`🐦 Processing Twitter URL: ${url}`);

    try {
        // First try btch-downloader (your working package)
        try {
            const twitterData = await twitter(url);
            if (twitterData && twitterData.data && (twitterData.data.high || twitterData.data.low)) {
                console.log('✅ Twitter processed with btch-downloader');
                return {
                    success: true,
                    data: await formatData('twitter', twitterData)
                };
            }
        } catch (btchError) {
            console.warn(`btch-downloader failed: ${btchError.message}`);
        }

        // Fallback to youtube-dl-exec
        if (youtubeDl) {
            const info = await youtubeDl(url, {
                dumpSingleJson: true,
                noCheckCertificates: true,
                noWarnings: true,
                addHeader: [
                    'referer:twitter.com',
                    'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                ]
            });

            if (info && info.formats && info.formats.length > 0) {
                const bestFormat = info.formats.find(f =>
                    f.vcodec !== 'none' && f.acodec !== 'none'
                ) || info.formats[0];

                return {
                    success: true,
                    data: {
                        title: info.title || 'Twitter Video',
                        url: bestFormat.url,
                        thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
                        sizes: ['Original Quality'],
                        source: 'twitter'
                    }
                };
            }
        }

        throw new Error('No working Twitter extraction method available');
    } catch (error) {
        console.error(`❌ Twitter processing error: ${error.message}`);
        throw error;
    }
}

// Routes
app.get('/', (req, res) => {
    res.json({
        message: '🚀 Optimized Social Media Download API',
        version: '2.0.0',
        status: 'running',
        platforms: ['youtube', 'instagram', 'tiktok', 'facebook', 'twitter', 'pinterest'],
        endpoints: ['/api/info', '/api/download', '/api/direct']
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

// Main download endpoint - OPTIMIZED with working packages
app.post('/api/download-media', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }

    const platform = identifyPlatform(url);
    if (!platform) {
        return res.status(400).json({ error: 'Unsupported platform' });
    }

    try {
        console.log(`🔥 Processing ${platform} URL: ${url}`);
        let result;

        switch (platform) {
            case 'instagram':
                try {
                    const igData = await igdl(url);
                    if (igData && igData.length > 0) {
                        const formattedData = await formatData('instagram', igData);
                        result = { success: true, data: formattedData };
                    } else {
                        throw new Error('Instagram data not found');
                    }
                } catch (error) {
                    console.error(`❌ Instagram error: ${error.message}`);
                    throw error;
                }
                break;

            case 'tiktok':
                try {
                    const ttData = await ttdl(url);
                    if (ttData) {
                        const formattedData = await formatData('tiktok', ttData);
                        result = { success: true, data: formattedData };
                    } else {
                        throw new Error('TikTok data not found');
                    }
                } catch (error) {
                    console.error(`❌ TikTok error: ${error.message}`);
                    throw error;
                }
                break;

            case 'facebook':
                try {
                    let fbData;
                    try {
                        fbData = await facebook(url);
                    } catch (primaryError) {
                        console.warn('Primary Facebook downloader failed, trying alternative...');
                        fbData = await fbAlt(url);
                    }

                    if (fbData) {
                        const formattedData = await formatData('facebook', fbData);
                        result = { success: true, data: formattedData };
                    } else {
                        throw new Error('Facebook data not found');
                    }
                } catch (error) {
                    console.error(`❌ Facebook error: ${error.message}`);
                    throw error;
                }
                break;

            case 'twitter':
                result = await processTwitterVideo(url);
                break;

            case 'youtube':
                result = await processYouTubeVideo(url);
                break;

            case 'pinterest':
                result = await processPinterestMedia(url);
                break;

            default:
                throw new Error(`Platform ${platform} not implemented yet`);
        }

        if (!result || !result.success) {
            throw new Error('Processing failed');
        }

        // Shorten URLs if successful
        if (result.data.url) {
            result.data.url = await shortenUrl(result.data.url);
        }
        if (result.data.thumbnail) {
            result.data.thumbnail = await shortenUrl(result.data.thumbnail);
        }

        console.log(`✅ Successfully processed ${platform} media`);
        res.status(200).json(result);

    } catch (error) {
        console.error(`❌ Download error for ${platform}: ${error.message}`);
        res.status(500).json({
            error: 'Failed to download media',
            platform,
            details: error.message
        });
    }
});

// Info endpoint (Flutter app format)
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

        // Call internal download function
        const response = await fetch(`http://localhost:${PORT}/api/download-media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });

        const data = await response.json();

        if (data.success) {
            const isAudioPlatform = ['spotify', 'soundcloud'].includes(platform);
            const isImage = platform === 'pinterest' && !data.data.isVideo;

            const formattedResponse = {
                title: data.data.title,
                formats: [{
                    itag: 'best',
                    quality: 'Best Quality',
                    mimeType: isImage ? 'image/jpeg' : isAudioPlatform ? 'audio/mp3' : 'video/mp4',
                    url: data.data.url,
                    hasAudio: !isImage,
                    hasVideo: !isImage && !isAudioPlatform,
                }],
                thumbnails: [{ url: data.data.thumbnail }],
                platform,
                mediaType: isImage ? 'image' : isAudioPlatform ? 'audio' : 'video',
                directUrl: `/api/direct?url=${encodeURIComponent(data.data.url)}&referer=${platform}.com&title=${encodeURIComponent(data.data.title || '')}`
            };

            return res.json(formattedResponse);
        }

        throw new Error(data.error || 'Processing failed');
    } catch (error) {
        console.error(`❌ API info error: ${error.message}`);
        res.status(500).json({ error: 'Processing failed', details: error.message });
    }
});

// Direct download endpoint
app.get('/api/direct', async (req, res) => {
    const { url, filename, title } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const platform = identifyPlatform(url);

        // Set appropriate headers
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': new URL(url).origin,
        };

        // Platform-specific headers
        if (platform === 'pinterest') {
            headers['Referer'] = 'https://www.pinterest.com/';
        } else if (platform === 'instagram') {
            headers['Referer'] = 'https://www.instagram.com/';
        } else if (platform === 'facebook') {
            headers['Referer'] = 'https://www.facebook.com/';
        }

        const downloadResp = await fetch(url, {
            headers,
            redirect: 'follow',
        });

        if (!downloadResp.ok) {
            throw new Error(`Failed to fetch content: ${downloadResp.status}`);
        }

        // Determine file type and name
        const contentType = downloadResp.headers.get('content-type') || 'application/octet-stream';

        let outputFilename = filename || title || 'download';
        if (!outputFilename.includes('.')) {
            if (contentType.includes('video')) outputFilename += '.mp4';
            else if (contentType.includes('audio')) outputFilename += '.mp3';
            else if (contentType.includes('image')) {
                if (contentType.includes('png')) outputFilename += '.png';
                else outputFilename += '.jpg';
            } else {
                outputFilename += '.mp4'; // default
            }
        }

        // Sanitize filename
        outputFilename = outputFilename.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);

        downloadResp.body.pipe(res);
    } catch (error) {
        console.error(`❌ Direct download error: ${error.message}`);
        res.status(500).json({ error: 'Direct download failed', details: error.message });
    }
});

// Download endpoint with file handling
app.get('/api/download', async (req, res) => {
    const { url, itag, title } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const platform = identifyPlatform(url);
        console.log(`📥 Download request for ${platform}: ${url}`);

        // For direct media URLs, stream directly
        const isDirect = url.includes('.mp4') || url.includes('.jpg') || url.includes('.png') ||
            url.includes('.mp3') || url.includes('cdninstagram.com') ||
            url.includes('fbcdn.net') || url.includes('pinimg.com');

        if (isDirect) {
            console.log('🔗 Direct media URL detected');
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': new URL(url).origin,
                }
            });

            if (!response.ok) {
                throw new Error(`Direct download failed: ${response.status}`);
            }

            const contentType = response.headers.get('content-type') || 'application/octet-stream';
            let filename = title || 'download';
            if (!filename.includes('.')) {
                if (contentType.includes('video')) filename += '.mp4';
                else if (contentType.includes('image')) filename += '.jpg';
                else if (contentType.includes('audio')) filename += '.mp3';
                else filename += '.mp4';
            }

            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            response.body.pipe(res);
            return;
        }

        // For non-direct URLs, use youtube-dl-exec
        if (!youtubeDl) {
            throw new Error('youtube-dl-exec not available for this request');
        }

        const uniqueId = Date.now();
        const tempFilePath = path.join(TEMP_DIR, `download-${uniqueId}`);

        // Determine format based on platform
        let formatOptions = {
            output: tempFilePath + '.%(ext)s',
            noCheckCertificates: true,
            noWarnings: true,
        };

        // Platform-specific format selection
        switch (platform) {
            case 'youtube':
                formatOptions.format = 'best[ext=mp4][height<=1080]/best[ext=mp4]/best';
                break;
            case 'instagram':
            case 'facebook':
            case 'twitter':
            case 'tiktok':
                formatOptions.format = 'best[ext=mp4]/best';
                break;
            case 'pinterest':
                formatOptions.format = 'best';
                break;
            case 'spotify':
            case 'soundcloud':
                formatOptions.extractAudio = true;
                formatOptions.audioFormat = 'mp3';
                formatOptions.format = 'bestaudio';
                break;
            default:
                formatOptions.format = 'best';
        }

        console.log(`⬇️  Downloading with format: ${formatOptions.format}`);
        await youtubeDl(url, formatOptions);

        // Find the downloaded file
        const files = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(`download-${uniqueId}`));
        if (files.length === 0) {
            throw new Error('Download failed - no file created');
        }

        const downloadedFile = path.join(TEMP_DIR, files[0]);
        const stat = fs.statSync(downloadedFile);

        if (stat.size === 0) {
            fs.unlinkSync(downloadedFile);
            throw new Error('Downloaded file is empty');
        }

        // Determine content type and filename
        const ext = path.extname(downloadedFile);
        let contentType = 'application/octet-stream';
        let filename = (title || `${platform}-media`).replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);

        switch (ext.toLowerCase()) {
            case '.mp4':
                contentType = 'video/mp4';
                if (!filename.endsWith('.mp4')) filename += '.mp4';
                break;
            case '.mp3':
                contentType = 'audio/mpeg';
                if (!filename.endsWith('.mp3')) filename += '.mp3';
                break;
            case '.jpg':
            case '.jpeg':
                contentType = 'image/jpeg';
                if (!filename.endsWith('.jpg')) filename += '.jpg';
                break;
            case '.png':
                contentType = 'image/png';
                if (!filename.endsWith('.png')) filename += '.png';
                break;
            case '.webm':
                contentType = 'video/webm';
                if (!filename.endsWith('.webm')) filename += '.webm';
                break;
            default:
                filename += ext;
        }

        console.log(`✅ Serving ${stat.size} bytes as ${contentType}`);

        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        const fileStream = fs.createReadStream(downloadedFile);
        fileStream.pipe(res);

        // Clean up file after sending
        fileStream.on('end', () => {
            fs.unlink(downloadedFile, (err) => {
                if (err) console.error('Error deleting temp file:', err);
                else console.log(`🗑️  Cleaned up: ${downloadedFile}`);
            });
        });

    } catch (error) {
        console.error(`❌ Download error: ${error.message}`);
        res.status(500).json({ error: 'Download failed', details: error.message });
    }
});

// Platform-specific endpoints

// YouTube endpoint
app.get('/api/youtube', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const result = await processYouTubeVideo(url);
        if (result.success) {
            return res.json({
                title: result.data.title,
                formats: [{
                    itag: 'yt_best',
                    quality: 'Best Quality',
                    mimeType: 'video/mp4',
                    url: result.data.url,
                    hasAudio: true,
                    hasVideo: true,
                }],
                thumbnails: [{ url: result.data.thumbnail }],
                platform: 'youtube',
                mediaType: 'video',
                directUrl: `/api/direct?url=${encodeURIComponent(result.data.url)}&title=${encodeURIComponent(result.data.title)}`
            });
        }
        throw new Error('YouTube processing failed');
    } catch (error) {
        console.error(`❌ YouTube endpoint error: ${error.message}`);
        res.status(500).json({ error: 'YouTube processing failed', details: error.message });
    }
});

// Instagram endpoint
app.get('/api/instagram', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const igData = await igdl(url);
        if (igData && igData.length > 0) {
            const formattedData = await formatData('instagram', igData);

            return res.json({
                title: formattedData.title,
                formats: [{
                    itag: 'ig_best',
                    quality: 'Original Quality',
                    mimeType: 'video/mp4',
                    url: formattedData.url,
                    hasAudio: true,
                    hasVideo: true,
                }],
                thumbnails: [{ url: formattedData.thumbnail }],
                platform: 'instagram',
                mediaType: 'video',
                directUrl: `/api/direct?url=${encodeURIComponent(formattedData.url)}&title=${encodeURIComponent(formattedData.title)}`
            });
        }
        throw new Error('Instagram processing failed');
    } catch (error) {
        console.error(`❌ Instagram endpoint error: ${error.message}`);
        res.status(500).json({ error: 'Instagram processing failed', details: error.message });
    }
});

// TikTok endpoint
app.get('/api/tiktok', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const ttData = await ttdl(url);
        if (ttData) {
            const formattedData = await formatData('tiktok', ttData);

            return res.json({
                title: formattedData.title,
                formats: [{
                    itag: 'tt_best',
                    quality: 'Original Quality',
                    mimeType: 'video/mp4',
                    url: formattedData.url,
                    hasAudio: true,
                    hasVideo: true,
                }],
                thumbnails: [{ url: formattedData.thumbnail }],
                platform: 'tiktok',
                mediaType: 'video',
                directUrl: `/api/direct?url=${encodeURIComponent(formattedData.url)}&title=${encodeURIComponent(formattedData.title)}`
            });
        }
        throw new Error('TikTok processing failed');
    } catch (error) {
        console.error(`❌ TikTok endpoint error: ${error.message}`);
        res.status(500).json({ error: 'TikTok processing failed', details: error.message });
    }
});

// Facebook endpoint
app.get('/api/facebook', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        let fbData;

        // Try primary Facebook downloader
        try {
            fbData = await facebook(url);
        } catch (primaryError) {
            console.warn('Primary Facebook downloader failed, trying alternative...');
            fbData = await fbAlt(url);
        }

        if (fbData) {
            const formattedData = await formatData('facebook', fbData);

            return res.json({
                title: formattedData.title,
                formats: [{
                    itag: 'fb_best',
                    quality: 'Original Quality',
                    mimeType: 'video/mp4',
                    url: formattedData.url,
                    hasAudio: true,
                    hasVideo: true,
                }],
                thumbnails: [{ url: formattedData.thumbnail }],
                platform: 'facebook',
                mediaType: 'video',
                directUrl: `/api/direct?url=${encodeURIComponent(formattedData.url)}&title=${encodeURIComponent(formattedData.title)}`
            });
        }
        throw new Error('Facebook processing failed');
    } catch (error) {
        console.error(`❌ Facebook endpoint error: ${error.message}`);
        res.status(500).json({ error: 'Facebook processing failed', details: error.message });
    }
});

// Twitter endpoint
app.get('/api/twitter', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const result = await processTwitterVideo(url);
        if (result.success) {
            return res.json({
                title: result.data.title,
                formats: [{
                    itag: 'tw_best',
                    quality: 'Original Quality',
                    mimeType: 'video/mp4',
                    url: result.data.url,
                    hasAudio: true,
                    hasVideo: true,
                }],
                thumbnails: [{ url: result.data.thumbnail }],
                platform: 'twitter',
                mediaType: 'video',
                directUrl: `/api/direct?url=${encodeURIComponent(result.data.url)}&title=${encodeURIComponent(result.data.title)}`
            });
        }
        throw new Error('Twitter processing failed');
    } catch (error) {
        console.error(`❌ Twitter endpoint error: ${error.message}`);
        res.status(500).json({ error: 'Twitter processing failed', details: error.message });
    }
});

// Pinterest endpoint
app.get('/api/pinterest', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const result = await processPinterestMedia(url);
        if (result.success) {
            const isVideo = result.data.isVideo;

            return res.json({
                title: result.data.title,
                formats: [{
                    itag: 'pin_best',
                    quality: 'Original Quality',
                    mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
                    url: result.data.url,
                    hasAudio: isVideo,
                    hasVideo: isVideo,
                }],
                thumbnails: [{ url: result.data.thumbnail }],
                platform: 'pinterest',
                mediaType: isVideo ? 'video' : 'image',
                directUrl: `/api/direct?url=${encodeURIComponent(result.data.url)}&title=${encodeURIComponent(result.data.title)}`
            });
        }
        throw new Error('Pinterest processing failed');
    } catch (error) {
        console.error(`❌ Pinterest endpoint error: ${error.message}`);
        res.status(500).json({ error: 'Pinterest processing failed', details: error.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        temp_dir: TEMP_DIR,
        temp_files: fs.readdirSync(TEMP_DIR).length,
        dependencies: {
            'youtube-dl-exec': !!youtubeDl,
            'ytdl-core': !!ytdlCore,
            'btch-downloader': true,
            'facebook-downloaders': true
        }
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('❌ Unhandled error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: error.message
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        available_endpoints: [
            '/',
            '/health',
            '/api/info',
            '/api/download-media',
            '/api/download',
            '/api/direct',
            '/api/youtube',
            '/api/instagram',
            '/api/tiktok',
            '/api/facebook',
            '/api/twitter',
            '/api/pinterest'
        ]
    });
});

// Cleanup function for temp files
const cleanupTempFiles = () => {
    try {
        const files = fs.readdirSync(TEMP_DIR);
        const now = Date.now();

        files.forEach(file => {
            const filePath = path.join(TEMP_DIR, file);
            const stats = fs.statSync(filePath);
            const fileAge = now - stats.mtime.getTime();

            // Delete files older than 1 hour
            if (fileAge > 60 * 60 * 1000) {
                fs.unlinkSync(filePath);
                console.log(`🗑️  Cleaned up old temp file: ${file}`);
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
    console.log('\n🚀 ===== OPTIMIZED SOCIAL MEDIA DOWNLOAD SERVER =====');
    console.log(`🌐 Server running on port ${PORT}`);
    console.log(`📁 Temp directory: ${TEMP_DIR}`);
    console.log(`🔗 Access at: http://localhost:${PORT}`);

    console.log('\n📦 Package Status:');
    console.log(`   ${youtubeDl ? '✅' : '❌'} youtube-dl-exec (Primary)`);
    console.log(`   ${ytdlCore ? '✅' : '❌'} ytdl-core (Fallback)`);
    console.log('   ✅ btch-downloader (Instagram, TikTok, Twitter)');
    console.log('   ✅ @mrnima/facebook-downloader (Facebook)');
    console.log('   ✅ @xaviabot/fb-downloader (Facebook Alt)');

    console.log('\n🎯 Supported Platforms:');
    console.log('   📺 YouTube (youtube-dl-exec + ytdl-core fallback)');
    console.log('   📷 Instagram (btch-downloader)');
    console.log('   🎵 TikTok (btch-downloader)');
    console.log('   📘 Facebook (dual downloaders)');
    console.log('   🐦 Twitter (btch-downloader + youtube-dl-exec)');
    console.log('   📌 Pinterest (direct scraping + youtube-dl-exec)');

    console.log('\n🛠️  API Endpoints:');
    console.log('   GET  / - Server info');
    console.log('   GET  /health - Health check');
    console.log('   GET  /api/info?url=... - Media info (Flutter format)');
    console.log('   POST /api/download-media - Main download');
    console.log('   GET  /api/download?url=... - File download');
    console.log('   GET  /api/direct?url=... - Direct proxy');
    console.log('   GET  /api/{platform}?url=... - Platform-specific');

    console.log('\n✨ Optimizations:');
    console.log('   🚀 Working packages prioritized');
    console.log('   🔄 Multiple fallback methods');
    console.log('   📝 Proper filename handling');
    console.log('   🗑️  Automatic temp file cleanup');
    console.log('   ⚡ Enhanced error handling');
    console.log('   📊 Health monitoring');

    console.log('\n🔥 Ready to process downloads!');
    console.log('===============================================\n');
});

module.exports = app;