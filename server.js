const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const axios = require('axios');

// Import working dependencies (with error handling for Python-dependent packages)
const { BitlyClient } = require('bitly');
const config = require('./config');
const fetch = require('node-fetch');

// Try to import Python-dependent packages with fallbacks
let youtubeDl = null;
try {
    youtubeDl = require('youtube-dl-exec');
    console.log('✅ youtube-dl-exec loaded');
} catch (err) {
    console.warn('⚠️  youtube-dl-exec not available (Python required)');
}

// Import from your working old packages
const { ttdl, twitter, igdl } = require('btch-downloader');
const { facebook } = require('@mrnima/facebook-downloader');
const fbAlt = require('@xaviabot/fb-downloader');

// Alternative for threads and youtube (removing shaon-media-downloader)
let ytdlCore = null;
try {
    ytdlCore = require('ytdl-core');
    console.log('✅ ytdl-core loaded for YouTube');
} catch (err) {
    console.warn('⚠️  ytdl-core not available, using fallback methods');
}

// Simple URL shortener replacement (since tinyurl is deprecated)
const simpleShorten = async (url) => {
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

// Import controllers with error handling
const controllers = {};

// List of all controllers to import
const controllerList = [
    'youtubeController',
    'facebookController',
    'instagramController',
    'twitterController',
    'tiktokController',
    'threadsController',
    'pinterestController',
    'soundcloudController',
    'spotifyController',
    'dailymotionController',
    'vimeoController',
    'twitchController',
    'musicPlatformController'
];

// Load each controller with error handling
controllerList.forEach(controllerName => {
    try {
        controllers[controllerName] = require(`./controllers/${controllerName}`);
        console.log(`✅ Loaded ${controllerName}`);
    } catch (err) {
        console.warn(`⚠️  ${controllerName} not found or has errors: ${err.message}`);
        controllers[controllerName] = null;
    }
});

// Setup app
const app = express();
const PORT = process.env.PORT || 5000;
const bitly = new BitlyClient(config.BITLY_ACCESS_TOKEN || 'your_bitly_token');

// Ensure temp directory exists with proper permissions
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
    console.log('Creating temp directory...');
    try {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
        fs.chmodSync(TEMP_DIR, 0o777);
        console.log(`Temp directory created at ${TEMP_DIR}`);
    } catch (error) {
        console.error(`Error creating temp directory: ${error.message}`);
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

// Enhanced filename sanitization function
function sanitizeFilename(filename) {
    if (!filename) return 'untitled';

    return filename
        .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid characters
        .replace(/[^\w\s\-_.()]/g, '_') // Replace special characters
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .replace(/_+/g, '_') // Replace multiple underscores with single
        .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
        .substring(0, 100); // Limit length
}

// Enhanced file type detection function
function detectFileTypeFromUrl(url, platform, mediaTitle = '') {
    const urlLower = url.toLowerCase();

    // Video extensions
    if (urlLower.includes('.mp4') || urlLower.includes('.m4v')) return { ext: '.mp4', type: 'video/mp4' };
    if (urlLower.includes('.webm')) return { ext: '.webm', type: 'video/webm' };
    if (urlLower.includes('.avi')) return { ext: '.avi', type: 'video/x-msvideo' };
    if (urlLower.includes('.mov')) return { ext: '.mov', type: 'video/quicktime' };
    if (urlLower.includes('.mkv')) return { ext: '.mkv', type: 'video/x-matroska' };

    // Audio extensions
    if (urlLower.includes('.mp3')) return { ext: '.mp3', type: 'audio/mpeg' };
    if (urlLower.includes('.m4a')) return { ext: '.m4a', type: 'audio/mp4' };
    if (urlLower.includes('.wav')) return { ext: '.wav', type: 'audio/wav' };
    if (urlLower.includes('.flac')) return { ext: '.flac', type: 'audio/flac' };
    if (urlLower.includes('.ogg')) return { ext: '.ogg', type: 'audio/ogg' };

    // Image extensions
    if (urlLower.includes('.jpg') || urlLower.includes('.jpeg')) return { ext: '.jpg', type: 'image/jpeg' };
    if (urlLower.includes('.png')) return { ext: '.png', type: 'image/png' };
    if (urlLower.includes('.gif')) return { ext: '.gif', type: 'image/gif' };
    if (urlLower.includes('.webp')) return { ext: '.webp', type: 'image/webp' };
    if (urlLower.includes('.bmp')) return { ext: '.bmp', type: 'image/bmp' };

    // Platform-based defaults
    if (platform) {
        if (['youtube', 'facebook', 'instagram', 'tiktok', 'twitter', 'vimeo', 'dailymotion', 'twitch'].includes(platform)) {
            return { ext: '.mp4', type: 'video/mp4' };
        }
        if (['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple_music', 'amazon_music', 'mixcloud', 'audiomack'].includes(platform)) {
            return { ext: '.mp3', type: 'audio/mpeg' };
        }
        if (platform === 'pinterest') {
            if (mediaTitle && (mediaTitle.toLowerCase().includes('video') || mediaTitle.toLowerCase().includes('gif'))) {
                return { ext: '.mp4', type: 'video/mp4' };
            }
            return { ext: '.jpg', type: 'image/jpeg' };
        }
        if (platform === 'threads') {
            return { ext: '.jpg', type: 'image/jpeg' };
        }
    }

    return { ext: '.mp4', type: 'video/mp4' };
}

// Enhanced content type detection from response headers
function detectContentTypeFromHeaders(headers, platform, url, mediaTitle = '') {
    const contentType = headers.get('content-type');

    if (contentType) {
        if (contentType.includes('video/mp4')) return { ext: '.mp4', type: 'video/mp4' };
        if (contentType.includes('video/webm')) return { ext: '.webm', type: 'video/webm' };
        if (contentType.includes('video/')) return { ext: '.mp4', type: contentType };

        if (contentType.includes('audio/mpeg')) return { ext: '.mp3', type: 'audio/mpeg' };
        if (contentType.includes('audio/mp4')) return { ext: '.m4a', type: 'audio/mp4' };
        if (contentType.includes('audio/')) return { ext: '.mp3', type: contentType };

        if (contentType.includes('image/jpeg')) return { ext: '.jpg', type: 'image/jpeg' };
        if (contentType.includes('image/png')) return { ext: '.png', type: 'image/png' };
        if (contentType.includes('image/gif')) return { ext: '.gif', type: 'image/gif' };
        if (contentType.includes('image/webp')) return { ext: '.webp', type: 'image/webp' };
        if (contentType.includes('image/')) return { ext: '.jpg', type: contentType };
    }

    return detectFileTypeFromUrl(url, platform, mediaTitle);
}

// Function to shorten URL with fallback
const shortenUrl = async (url) => {
    if (!url) {
        console.warn("Shorten URL: No URL provided.");
        return url;
    }

    return await simpleShorten(url);
};

// Function to identify platform (from old server)
const identifyPlatform = (url) => {
    console.info("Platform Identification: Determining the platform for the given URL.");
    const lowerUrl = url.toLowerCase();

    // Social Media Platforms
    if (lowerUrl.includes('instagram.com')) return 'instagram';
    if (lowerUrl.includes('tiktok.com')) return 'tiktok';
    if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch') || lowerUrl.includes('fb.com')) return 'facebook';
    if (lowerUrl.includes('x.com') || lowerUrl.includes('twitter.com')) return 'twitter';
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) return 'youtube';
    if (lowerUrl.includes('pinterest.com') || lowerUrl.includes('pin.it')) return 'pinterest';
    if (lowerUrl.includes('threads.net')) return 'threads';
    if (lowerUrl.includes('reddit.com')) return 'reddit';
    if (lowerUrl.includes('linkedin.com')) return 'linkedin';
    if (lowerUrl.includes('tumblr.com')) return 'tumblr';
    if (lowerUrl.includes('vk.com')) return 'vk';
    if (lowerUrl.includes('bilibili.com')) return 'bilibili';
    if (lowerUrl.includes('snapchat.com')) return 'snapchat';

    // Music Platforms
    if (lowerUrl.includes('spotify.com')) return 'spotify';
    if (lowerUrl.includes('soundcloud.com')) return 'soundcloud';
    if (lowerUrl.includes('bandcamp.com')) return 'bandcamp';
    if (lowerUrl.includes('deezer.com')) return 'deezer';
    if (lowerUrl.includes('music.apple.com')) return 'apple_music';
    if (lowerUrl.includes('music.amazon.com')) return 'amazon_music';
    if (lowerUrl.includes('mixcloud.com')) return 'mixcloud';
    if (lowerUrl.includes('audiomack.com')) return 'audiomack';

    // Video Platforms
    if (lowerUrl.includes('vimeo.com')) return 'vimeo';
    if (lowerUrl.includes('dailymotion.com')) return 'dailymotion';
    if (lowerUrl.includes('twitch.tv')) return 'twitch';

    console.warn("Platform Identification: Unable to identify the platform.");
    return null;
};

// Standardize the response for different platforms (from old server)
const formatData = async (platform, data) => {
    console.info(`Data Formatting: Formatting data for platform '${platform}'.`);
    const placeholderThumbnail = 'https://via.placeholder.com/300x150';

    // Handle controller response format
    if (data && (data.title || data.url)) {
        return {
            title: data.title || `${platform.charAt(0).toUpperCase() + platform.slice(1)} Media`,
            url: data.url || '',
            thumbnail: data.thumbnail || placeholderThumbnail,
            sizes: ['Original Quality'],
            source: platform,
            isVideo: data.isVideo,
            isAudio: data.isAudio,
            localFilePath: data.localFilePath
        };
    }

    switch (platform) {
        case 'youtube': {
            const youtubeData = data.data || data;
            if (!youtubeData || (!youtubeData.low && !youtubeData.high)) {
                throw new Error("Data Formatting: YouTube data is incomplete or improperly formatted.");
            }
            console.info("Data Formatting: YouTube data formatted successfully.");
            return {
                title: youtubeData.title || 'Untitled Video',
                url: youtubeData.low || youtubeData.high || '',
                thumbnail: youtubeData.thumbnail || placeholderThumbnail,
                sizes: ['Low Quality', 'High Quality'],
                source: platform,
            };
        }

        case 'instagram': {
            if (!data || !data[0]?.url) {
                console.error("Data Formatting: Instagram data is missing or invalid.");
                throw new Error("Instagram data is missing or invalid.");
            }
            console.info("Data Formatting: Instagram data formatted successfully.");
            return {
                title: data[0]?.wm || 'Untitled Media',
                url: data[0]?.url,
                thumbnail: data[0]?.thumbnail || placeholderThumbnail,
                sizes: ['Original Quality'],
                source: platform,
            };
        }

        case 'twitter': {
            const twitterData = data?.data || data;
            const videoUrl = twitterData?.high || twitterData?.low || twitterData?.url || '';
            console.info("Data Formatting: Twitter data formatted successfully.");
            return {
                title: twitterData?.title || 'Untitled Video',
                url: videoUrl,
                thumbnail: twitterData?.thumbnail || placeholderThumbnail,
                sizes: twitterData?.high && twitterData?.low ? ['High Quality', 'Low Quality'] : ['Original Quality'],
                source: platform,
            };
        }

        case 'facebook': {
            console.log("Processing Facebook data...");

            // Structure from @mrnima/facebook-downloader
            if (data.result?.links?.HD || data.result?.links?.SD) {
                return {
                    title: data.title || 'Untitled Video',
                    url: data.result.links.HD || data.result.links.SD || '',
                    thumbnail: data.result.thumbnail || placeholderThumbnail,
                    sizes: ['Original Quality'],
                    source: platform,
                };
            }

            // Structure from @xaviabot/fb-downloader
            if (data.hd || data.sd) {
                return {
                    title: data.title || 'Untitled Video',
                    url: data.hd || data.sd || '',
                    thumbnail: data.thumbnail || placeholderThumbnail,
                    sizes: ['Original Quality'],
                    source: platform,
                };
            }

            // Generic fallback
            return {
                title: data.title || 'Facebook Video',
                url: data.url || data.download_url || data.videoUrl || '',
                thumbnail: data.thumbnail || data.image || placeholderThumbnail,
                sizes: ['Original Quality'],
                source: platform,
            };
        }

        case 'tiktok':
            console.log("Processing TikTok data...");
            return {
                title: data.title || 'Untitled Video',
                url: data.video?.[0] || data.url || '',
                thumbnail: data.thumbnail || placeholderThumbnail,
                sizes: ['Original Quality'],
                audio: data.audio?.[0] || '',
                source: platform,
            };

        case 'pinterest':
            // Handle Pinterest controller format
            if (data.imran) {
                return {
                    title: data.imran.title || 'Pinterest Media',
                    url: data.imran.url || '',
                    thumbnail: data.imran.thumbnail || placeholderThumbnail,
                    sizes: ['Original Quality'],
                    source: platform,
                    isVideo: data.imran.isVideo
                };
            }
            return {
                title: data.title || 'Pinterest Image',
                url: data.url || '',
                thumbnail: data.thumbnail || placeholderThumbnail,
                sizes: ['Original Quality'],
                source: platform,
            };

        case 'threads':
            console.log("Processing Threads data...");
            return {
                title: data.title || 'Untitled Post',
                url: data.data?.video || data.url || '',
                thumbnail: data.thumbnail || placeholderThumbnail,
                sizes: ['Original Quality'],
                source: platform,
            };

        default:
            console.warn("Data Formatting: Generic formatting applied.");
            return {
                title: data.title || 'Untitled Media',
                url: data.url || '',
                thumbnail: data.thumbnail || placeholderThumbnail,
                sizes: data.sizes?.length > 0 ? data.sizes : ['Original Quality'],
                source: platform,
            };
    }
};

// Enhanced Twitter Handler with direct download approach (from old server)
async function processTwitterWithYtdl(url) {
    console.log(`Processing Twitter/X URL with youtube-dl: ${url}`);

    try {
        // First, try to fetch the Twitter page to extract videos directly
        console.log('Fetching Twitter page content...');
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch Twitter page: ${response.status}`);
        }

        const html = await response.text();

        // Extract title
        let title = 'Twitter/X Video';
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
            title = titleMatch[1].replace(' / X', '').replace(' / Twitter', '').trim();
        }

        // First look for video in the page content
        console.log('Looking for video URLs in Twitter page...');

        // Different patterns to find Twitter video URLs
        const videoUrlPatterns = [
            /video_url":"([^"]+)"/,
            /playbackUrl":"([^"]+)"/,
            /video_info\"\:.*?\{\"bitrate\"\:.*?\"url\"\:\"([^\"]+)\"/,
            /"(?:https?:\/\/video\.twimg\.com\/[^"]+\.mp4[^"]*)"/g,
            /https?:\/\/video\.twimg\.com\/[^"'\s]+\.mp4[^"'\s]*/g
        ];

        let videoUrl = null;

        for (const pattern of videoUrlPatterns) {
            if (pattern.global) {
                const matches = html.match(pattern);
                if (matches && matches.length > 0) {
                    videoUrl = matches[0].replace(/"/g, '').replace(/&amp;/g, '&');
                    console.log(`Found Twitter video URL with global pattern: ${videoUrl.substring(0, 100)}...`);
                    break;
                }
            } else {
                const match = pattern.exec(html);
                if (match && match[1]) {
                    videoUrl = match[1]
                        .replace(/\\u002F/g, '/')
                        .replace(/\\\//g, '/')
                        .replace(/\\/g, '')
                        .replace(/&amp;/g, '&');
                    console.log(`Found Twitter video URL with pattern: ${videoUrl.substring(0, 100)}...`);
                    break;
                }
            }
        }

        // If we found a direct video URL, return it
        if (videoUrl) {
            // Extract thumbnail
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
                    thumbnail: thumbnail || 'https://via.placeholder.com/300x150',
                    sizes: ['Original Quality'],
                    source: 'twitter',
                }
            };
        }

        // If direct extraction fails, try youtube-dl
        console.log('Direct video extraction failed, trying youtube-dl...');

        const info = await youtubeDl(url, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            addHeader: [
                'referer:twitter.com',
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            ],
        });

        if (info && info.formats && info.formats.length > 0) {
            // Find the best video format
            const formats = info.formats.filter(f => f.vcodec !== 'none' && f.acodec !== 'none');

            // Sort by quality (resolution)
            formats.sort((a, b) => {
                const heightA = a.height || 0;
                const heightB = b.height || 0;
                return heightB - heightA;
            });

            const bestFormat = formats[0] || info.formats[0];

            console.log(`Selected Twitter format: ${bestFormat.format_note || 'Unknown'} (${bestFormat.height || 'Unknown'}p)`);

            return {
                success: true,
                data: {
                    title: info.title || title,
                    url: bestFormat.url,
                    thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
                    sizes: ['Original Quality'],
                    source: 'twitter',
                }
            };
        }

        // If we get here, we couldn't find a video
        throw new Error('No video found in Twitter content');

    } catch (error) {
        console.error('Twitter/X download error:', error);

        // One last attempt - try to download directly to file
        try {
            console.log('Attempting direct file download for Twitter...');

            // Create a temporary unique filename
            const tempId = Date.now();
            const tempFilePath = path.join(TEMP_DIR, `twitter-${tempId}.mp4`);

            const ytDlOptions = {
                output: tempFilePath,
                format: 'best[ext=mp4]/best',
                noCheckCertificates: true,
                noWarnings: true,
                addHeader: [
                    'referer:twitter.com',
                    'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                ],
            };

            console.log(`Downloading Twitter video to ${tempFilePath}`);
            await youtubeDl(url, ytDlOptions);

            // Check if file was created and has content
            if (fs.existsSync(tempFilePath)) {
                const stats = fs.statSync(tempFilePath);
                if (stats.size > 0) {
                    console.log(`Successfully downloaded Twitter video (${stats.size} bytes)`);

                    // Get video URL for streaming
                    const videoUrl = `/api/stream-file?path=${encodeURIComponent(tempFilePath)}`;

                    return {
                        success: true,
                        data: {
                            title: 'Twitter/X Video',
                            url: videoUrl,
                            localFilePath: tempFilePath,
                            thumbnail: 'https://via.placeholder.com/300x150',
                            sizes: ['Original Quality'],
                            source: 'twitter',
                        }
                    };
                } else {
                    fs.unlinkSync(tempFilePath); // Delete empty file
                }
            }

            throw new Error('Failed to download Twitter video to file');
        } catch (finalError) {
            console.error('All Twitter download methods failed:', finalError);
            throw finalError;
        }
    }
}

// Facebook Handler (from old server)
async function processFacebookUrl(url) {
    console.log(`Processing Facebook URL: ${url}`);

    try {
        // Try @mrnima/facebook-downloader first
        try {
            const result = await facebook(url);

            if (result && result.result && (result.result.links?.HD || result.result.links?.SD)) {
                return {
                    success: true,
                    data: {
                        title: result.title || 'Facebook Video',
                        url: result.result.links.HD || result.result.links.SD,
                        thumbnail: result.result.thumbnail || 'https://via.placeholder.com/300x150',
                        sizes: ['Original Quality'],
                        source: 'facebook',
                    }
                };
            }
        } catch (primaryError) {
            console.warn(`Primary Facebook downloader failed: ${primaryError.message}`);
        }

        // Try @xaviabot/fb-downloader as fallback
        try {
            const altResult = await fbAlt(url);

            if (altResult && (altResult.hd || altResult.sd)) {
                return {
                    success: true,
                    data: {
                        title: altResult.title || 'Facebook Video',
                        url: altResult.hd || altResult.sd,
                        thumbnail: altResult.thumbnail || 'https://via.placeholder.com/300x150',
                        sizes: ['Original Quality'],
                        source: 'facebook',
                    }
                };
            }
        } catch (altError) {
            console.warn(`Alternative Facebook downloader failed: ${altError.message}`);
        }

        // Fallback to youtube-dl
        const info = await youtubeDl(url, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
        });

        if (info && info.formats && info.formats.length > 0) {
            // Find the best format
            const videoFormat = info.formats.find(f => f.vcodec !== 'none' && f.acodec !== 'none') || info.formats[0];

            return {
                success: true,
                data: {
                    title: info.title || 'Facebook Video',
                    url: videoFormat.url,
                    thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
                    sizes: ['Original Quality'],
                    source: 'facebook',
                }
            };
        }

        throw new Error('No Facebook video formats found');
    } catch (error) {
        console.error('Facebook processing error:', error);
        throw error;
    }
}

// YouTube Handler with youtube-dl-exec (fallback) - only if available
async function processYoutubeWithYtdl(url) {
    if (!youtubeDl) {
        throw new Error('youtube-dl-exec not available (requires Python)');
    }

    console.log(`Processing YouTube URL with youtube-dl-exec: ${url}`);

    try {
        const info = await youtubeDl(url, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
        });

        if (info && info.formats && info.formats.length > 0) {
            // Find a good quality format
            const format = info.formats.find(f =>
                f.format_note === '720p' && f.vcodec !== 'none' && f.acodec !== 'none'
            ) || info.formats.find(f =>
                f.vcodec !== 'none' && f.acodec !== 'none'
            ) || info.formats[0];

            return {
                success: true,
                data: {
                    title: info.title || 'YouTube Video',
                    url: format.url,
                    thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
                    sizes: ['Original Quality'],
                    source: 'youtube',
                }
            };
        }

        throw new Error('No video formats found');
    } catch (error) {
        console.error('YouTube download error:', error);
        throw error;
    }
}

// Enhanced Threads Handler using direct page parsing (better alternative to shaon)
async function processThreadsUrlDirect(url) {
    console.log(`Processing Threads URL with direct parsing: ${url}`);

    try {
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
                success: true,
                data: {
                    title,
                    url: videoUrl,
                    thumbnail: thumbnail || 'https://via.placeholder.com/300x150',
                    sizes: ['Original Quality'],
                    source: 'threads',
                }
            };
        }

        // Otherwise try image meta tag
        const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"\/?>/i);
        if (ogImageMatch && ogImageMatch[1]) {
            const imageUrl = ogImageMatch[1];

            return {
                success: true,
                data: {
                    title,
                    url: imageUrl,
                    thumbnail: imageUrl,
                    sizes: ['Original Quality'],
                    source: 'threads',
                }
            };
        }

        // Look for video URLs in the content
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
                success: true,
                data: {
                    title,
                    url: videoUrl,
                    thumbnail: 'https://via.placeholder.com/300x150',
                    sizes: ['Original Quality'],
                    source: 'threads',
                }
            };
        }

        throw new Error('No media found in this Threads post');
    } catch (error) {
        console.error('Threads processing error:', error);
        throw error;
    }
}

// Enhanced YouTube Handler using ytdl-core (better alternative)
async function processYoutubeWithYtdlCore(url) {
    console.log(`Processing YouTube URL with ytdl-core: ${url}`);

    try {
        if (!ytdlCore) {
            throw new Error('ytdl-core not available, falling back to youtube-dl-exec');
        }

        const info = await ytdlCore.getInfo(url);

        if (info && info.formats && info.formats.length > 0) {
            // Find a good quality format with both video and audio
            const format = info.formats.find(f =>
                f.hasVideo && f.hasAudio && f.container === 'mp4'
            ) || info.formats.find(f =>
                f.hasVideo && f.hasAudio
            ) || info.formats[0];

            return {
                success: true,
                data: {
                    title: info.videoDetails.title || 'YouTube Video',
                    url: format.url,
                    thumbnail: info.videoDetails.thumbnails?.[0]?.url || 'https://via.placeholder.com/300x150',
                    sizes: [`${format.height || 'Unknown'}p`],
                    source: 'youtube',
                }
            };
        }

        throw new Error('No YouTube formats found');
    } catch (error) {
        console.warn(`ytdl-core failed: ${error.message}, falling back to youtube-dl-exec`);

        // Fallback to youtube-dl-exec
        return await processYoutubeWithYtdl(url);
    }
}

// Routes
app.get('/', (req, res) => {
    res.send('Social Media Download API is running');
});

// File streaming endpoint for downloaded files
app.get('/api/stream-file', (req, res) => {
    const { path: filePath } = req.query;

    if (!filePath) {
        return res.status(400).json({ error: 'File path is required' });
    }

    // Security check to ensure we're only serving files from the temp directory
    if (!filePath.startsWith(TEMP_DIR)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        // Handle range requests for video streaming
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
        // Handle normal requests
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
            'Content-Disposition': 'attachment; filename="media-file.mp4"'
        });

        fs.createReadStream(filePath).pipe(res);
    }
});

// Main download endpoint (using old server logic)
app.post('/api/download-media', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        console.warn("Download Media: No URL provided in the request.");
        return res.status(400).json({ error: 'No URL provided' });
    }

    const platform = identifyPlatform(url);

    if (!platform) {
        console.warn("Download Media: Unsupported platform for the given URL.");
        return res.status(400).json({ error: 'Unsupported platform' });
    }

    try {
        console.info(`Download Media: Fetching data for platform '${platform}'.`);
        let data;

        // Use old server logic - direct package calls first, then controller fallbacks
        switch (platform) {
            case 'instagram':
                try {
                    data = await igdl(url);
                    if (!data) throw new Error('igdl returned no data');
                } catch (err) {
                    console.warn(`igdl failed: ${err.message}, trying controller`);
                    if (controllers.instagramController) {
                        data = await controllers.instagramController.downloadInstagramMedia(url);
                    } else {
                        throw err;
                    }
                }
                break;

            case 'tiktok':
                try {
                    data = await ttdl(url);
                    if (!data) throw new Error('ttdl returned no data');
                } catch (err) {
                    console.warn(`ttdl failed: ${err.message}, trying controller`);
                    if (controllers.tiktokController) {
                        data = await controllers.tiktokController.downloadTikTokVideo(url);
                    } else {
                        throw err;
                    }
                }
                break;

            case 'facebook':
                try {
                    data = await facebook(url);
                    if (!data) throw new Error('facebook downloader returned no data');
                } catch (err) {
                    console.warn(`facebook downloader failed: ${err.message}, trying controller`);
                    if (controllers.facebookController) {
                        data = await controllers.facebookController.downloadFacebookVideo(url);
                    } else {
                        throw err;
                    }
                }
                break;

            case 'twitter':
                try {
                    data = await twitter(url);
                    if (!data) throw new Error('twitter downloader returned no data');
                } catch (err) {
                    console.warn(`twitter downloader failed: ${err.message}, trying controller`);
                    if (controllers.twitterController) {
                        data = await controllers.twitterController.downloadTwitterVideo(url);
                    } else {
                        // Use old server method
                        const twitterResult = await processTwitterWithYtdl(url);
                        return res.status(200).json(twitterResult);
                    }
                }
                break;

            case 'youtube':
                try {
                    // Try ytdl-core first (better alternative)
                    if (ytdlCore) {
                        const info = await ytdlCore.getInfo(url);
                        if (info && info.formats && info.formats.length > 0) {
                            // Find a good quality format
                            const format = info.formats.find(f =>
                                f.hasVideo && f.hasAudio && f.container === 'mp4'
                            ) || info.formats.find(f =>
                                f.hasVideo && f.hasAudio
                            ) || info.formats[0];

                            data = {
                                data: {
                                    title: info.videoDetails.title,
                                    high: format.url,
                                    low: format.url,
                                    thumbnail: info.videoDetails.thumbnails?.[0]?.url
                                }
                            };
                        }
                    }

                    if (!data) throw new Error('ytdl-core failed or not available');
                } catch (err) {
                    console.warn(`ytdl-core failed: ${err.message}, trying controller`);
                    if (controllers.youtubeController) {
                        data = await controllers.youtubeController.downloadYouTubeVideo(url);
                    } else if (youtubeDl) {
                        const ytResult = await processYoutubeWithYtdl(url);
                        return res.status(200).json(ytResult);
                    } else {
                        throw new Error('No YouTube processing method available');
                    }
                }
                break;

            case 'pinterest':
                if (controllers.pinterestController) {
                    try {
                        data = await controllers.pinterestController.downloadPinterestMedia(url);
                    } catch (err) {
                        console.warn(`Pinterest controller failed: ${err.message}`);
                        throw err;
                    }
                } else {
                    throw new Error('Pinterest controller not available');
                }
                break;

            case 'threads':
                try {
                    // Use direct parsing (better alternative to shaon)
                    const threadsResult = await processThreadsUrlDirect(url);
                    return res.status(200).json(threadsResult);
                } catch (err) {
                    console.warn(`Direct threads parsing failed: ${err.message}, trying controller`);
                    if (controllers.threadsController) {
                        data = await controllers.threadsController.downloadThreadsMedia(url);
                    } else {
                        throw err;
                    }
                }
                break;

            case 'soundcloud':
                if (controllers.soundcloudController) {
                    try {
                        data = await controllers.soundcloudController.downloadSoundCloudAudio(url);
                    } catch (err) {
                        console.warn(`SoundCloud controller failed: ${err.message}`);
                        throw err;
                    }
                } else {
                    throw new Error('SoundCloud controller not available');
                }
                break;

            case 'spotify':
                if (controllers.spotifyController) {
                    try {
                        data = await controllers.spotifyController.downloadSpotifyAudio(url);
                    } catch (err) {
                        console.warn(`Spotify controller failed: ${err.message}`);
                        throw err;
                    }
                } else {
                    throw new Error('Spotify controller not available');
                }
                break;

            case 'vimeo':
                if (controllers.vimeoController) {
                    try {
                        data = await controllers.vimeoController.downloadVimeoVideo(url);
                    } catch (err) {
                        console.warn(`Vimeo controller failed: ${err.message}`);
                        throw err;
                    }
                } else {
                    throw new Error('Vimeo controller not available');
                }
                break;

            case 'dailymotion':
                if (controllers.dailymotionController) {
                    try {
                        data = await controllers.dailymotionController.downloadDailymotionVideo(url);
                    } catch (err) {
                        console.warn(`Dailymotion controller failed: ${err.message}`);
                        throw err;
                    }
                } else {
                    throw new Error('Dailymotion controller not available');
                }
                break;

            case 'twitch':
                if (controllers.twitchController) {
                    try {
                        data = await controllers.twitchController.downloadTwitchVideo(url);
                    } catch (err) {
                        console.warn(`Twitch controller failed: ${err.message}`);
                        throw err;
                    }
                } else {
                    throw new Error('Twitch controller not available');
                }
                break;

            default:
                // For music platforms, try music platform controller
                if (['bandcamp', 'deezer', 'apple_music', 'amazon_music', 'mixcloud', 'audiomack'].includes(platform)) {
                    if (controllers.musicPlatformController) {
                        try {
                            data = await controllers.musicPlatformController.downloadMusicPlatformAudio(url, platform);
                        } catch (err) {
                            console.warn(`Music platform controller failed: ${err.message}`);
                            throw err;
                        }
                    } else {
                        throw new Error('Music platform controller not available');
                    }
                } else {
                    throw new Error(`Unsupported platform: ${platform}`);
                }
        }

        if (!data) {
            console.error("Download Media: No data returned for the platform.");
            return res.status(404).json({ error: 'Data not found for the platform' });
        }

        const formattedData = await formatData(platform, data);

        // Shorten URLs for all platforms except local files
        if (!formattedData.localFilePath) {
            formattedData.url = await shortenUrl(formattedData.url);
            formattedData.thumbnail = await shortenUrl(formattedData.thumbnail);
        }

        console.info("Download Media: Media successfully downloaded and formatted.");

        // 200 OK: Successful response
        res.status(200).json({
            success: true,
            data: formattedData,
        });
    } catch (error) {
        console.error(`Download Media: Error occurred - ${error.message}`);
        res.status(500).json({ error: 'Failed to download media', details: error.message });
    }
});

// API info endpoint (simplified and faster)
app.get('/api/info', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const platform = identifyPlatform(url);
        console.log(`Detected platform for ${url}: ${platform}`);

        if (!platform) {
            return res.status(400).json({ error: 'Unsupported platform' });
        }

        // Call our internal download function
        const response = await fetch(`http://localhost:${PORT}/api/download-media`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url }),
        });

        const data = await response.json();

        if (data.success) {
            // Transform response to format expected by Flutter app
            const isAudioPlatform = ['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple_music',
                'amazon_music', 'mixcloud', 'audiomack'].includes(platform);

            const isImage = platform === 'pinterest' ||
                (data.data.url && (data.data.url.includes('.jpg') ||
                    data.data.url.includes('.jpeg') ||
                    data.data.url.includes('.png')));

            const formattedResponse = {
                title: data.data.title,
                formats: [{
                    itag: 'best',
                    quality: 'Best Quality',
                    mimeType: isImage ? 'image/jpeg' :
                        isAudioPlatform ? 'audio/mp3' : 'video/mp4',
                    url: data.data.url,
                    hasAudio: !isImage,
                    hasVideo: !isImage && !isAudioPlatform,
                }],
                thumbnails: [{ url: data.data.thumbnail }],
                platform,
                mediaType: isImage ? 'image' :
                    isAudioPlatform ? 'audio' : 'video',
                directUrl: data.data.localFilePath ? data.data.url : `/api/direct?url=${encodeURIComponent(data.data.url)}&referer=${platform}.com&title=${encodeURIComponent(data.data.title || '')}`
            };

            return res.json(formattedResponse);
        }

        throw new Error(data.error || 'Processing failed');
    } catch (error) {
        console.error('API info error:', error);
        res.status(500).json({ error: 'Processing failed', details: error.message });
    }
});

// Enhanced /api/direct endpoint with media name preservation
app.get('/api/direct', async (req, res) => {
    const { url, filename, title } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        console.log(`Processing direct download: ${url}`);
        const platform = identifyPlatform(url);

        // Enhanced headers with platform-specific optimizations
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': new URL(url).origin,
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'video',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site'
        };

        // Platform-specific header adjustments
        if (platform === 'pinterest') {
            headers['Referer'] = 'https://www.pinterest.com/';
            headers['Origin'] = 'https://www.pinterest.com';
        } else if (platform === 'instagram') {
            headers['Referer'] = 'https://www.instagram.com/';
            headers['Origin'] = 'https://www.instagram.com';
        } else if (platform === 'facebook') {
            headers['Referer'] = 'https://www.facebook.com/';
            headers['Origin'] = 'https://www.facebook.com';
        }

        // Add custom referer if provided
        if (req.query.referer) {
            headers['Referer'] = req.query.referer.startsWith('http')
                ? req.query.referer
                : `https://${req.query.referer}`;
        }

        const downloadResp = await fetch(url, {
            headers: headers,
            redirect: 'follow',
        });

        if (!downloadResp.ok) {
            throw new Error(`Failed to fetch content: ${downloadResp.status}`);
        }

        // Enhanced file type detection
        const fileType = detectContentTypeFromHeaders(downloadResp.headers, platform, url, title);

        // Generate proper filename with media name preservation
        let outputFilename = '';

        if (filename) {
            outputFilename = sanitizeFilename(filename);
        } else if (title) {
            outputFilename = sanitizeFilename(title);
        } else {
            outputFilename = `${platform || 'download'}-${Date.now()}`;
        }

        // Remove existing extension if present
        if (outputFilename.includes('.')) {
            outputFilename = outputFilename.substring(0, outputFilename.lastIndexOf('.'));
        }

        // Add correct extension
        outputFilename += fileType.ext;

        console.log(`Serving as ${fileType.type} with filename: ${outputFilename}`);

        res.setHeader('Content-Type', fileType.type);
        res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);

        // Add content length if available
        const contentLength = downloadResp.headers.get('content-length');
        if (contentLength) {
            res.setHeader('Content-Length', contentLength);
        }

        downloadResp.body.pipe(res);
    } catch (error) {
        console.error('Direct download error:', error);
        res.status(500).json({ error: 'Direct download failed', details: error.message });
    }
});

// Enhanced /api/download endpoint with media name preservation
app.get('/api/download', async (req, res) => {
    try {
        let { url, itag, title } = req.query;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        url = url.trim();
        const platform = identifyPlatform(url);
        console.log(`Download request for ${platform} platform: ${url}`);

        // Get media title if not provided
        let mediaTitle = title;
        if (!mediaTitle) {
            try {
                const infoResponse = await fetch(`http://localhost:${PORT}/api/info?url=${encodeURIComponent(url)}`);
                const infoData = await infoResponse.json();
                if (infoData.title) {
                    mediaTitle = infoData.title;
                }
            } catch (infoError) {
                console.warn('Could not get media title:', infoError.message);
            }
        }

        // Detect expected file type
        const expectedFileType = detectFileTypeFromUrl(url, platform, mediaTitle);

        // For direct media URLs, don't use youtube-dl
        const isDirect = url.includes('.mp4') || url.includes('.jpg') || url.includes('.png') ||
            url.includes('.mp3') || url.includes('.m4a') || url.includes('.webm') ||
            url.includes('scontent.cdninstagram.com') || url.includes('fbcdn.net') ||
            url.includes('pinimg.com');

        const uniqueId = Date.now();
        const tempFilePath = path.join(TEMP_DIR, `download-${uniqueId}${expectedFileType.ext}`);

        if (isDirect) {
            console.log('Direct media URL detected, using direct download');
            const downloadResponse = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': new URL(url).origin,
                    'Accept': '*/*',
                },
            });

            if (!downloadResponse.ok) {
                throw new Error(`Direct download failed with status: ${downloadResponse.status}`);
            }

            const fileStream = fs.createWriteStream(tempFilePath);
            await new Promise((resolve, reject) => {
                downloadResponse.body.pipe(fileStream);
                downloadResponse.body.on('error', reject);
                fileStream.on('finish', resolve);
            });

            console.log(`Successfully downloaded file to ${tempFilePath}`);
        } else {
            // Use youtube-dl for non-direct URLs with enhanced format selection
            const options = {
                output: tempFilePath,
                noCheckCertificates: true,
                noWarnings: true,
                preferFreeFormats: true,
                addHeader: [
                    'referer:' + new URL(url).origin,
                    'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                ],
            };

            // Enhanced format selection based on platform and requested quality
            if (itag && itag !== 'best') {
                options.format = itag;
            } else {
                // Platform-specific format selection for best quality and compatibility
                switch (platform) {
                    case 'youtube':
                        options.format = 'best[ext=mp4][height<=1080]/best[ext=mp4]/best';
                        break;
                    case 'tiktok':
                    case 'instagram':
                    case 'facebook':
                    case 'twitter':
                        options.format = 'best[ext=mp4]/best';
                        break;
                    case 'spotify':
                    case 'soundcloud':
                    case 'bandcamp':
                    case 'deezer':
                    case 'apple_music':
                    case 'amazon_music':
                        options.extractAudio = true;
                        options.audioFormat = 'mp3';
                        options.audioQuality = 0;
                        options.format = 'bestaudio[ext=m4a]/bestaudio';
                        break;
                    case 'vimeo':
                    case 'dailymotion':
                        options.format = 'best[ext=mp4][height<=720]/best[ext=mp4]/best';
                        break;
                    default:
                        options.format = 'best[ext=mp4]/best';
                }
            }

            try {
                console.log(`Using youtube-dl with format: ${options.format} for ${platform}`);
                await youtubeDl(url, options);
            } catch (ytdlErr) {
                console.error('youtube-dl download error:', ytdlErr);

                // Enhanced fallback with multiple attempts
                if (!fs.existsSync(tempFilePath)) {
                    console.log('Attempting direct fallback download...');

                    // Try to get media info first
                    try {
                        const infoResponse = await fetch(`http://localhost:${PORT}/api/info?url=${encodeURIComponent(url)}`);
                        const infoData = await infoResponse.json();

                        if (infoData.formats && infoData.formats.length > 0) {
                            const bestFormat = infoData.formats[0];
                            console.log(`Using format URL from info: ${bestFormat.url}`);

                            const downloadResponse = await fetch(bestFormat.url, {
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                    'Referer': new URL(url).origin,
                                },
                            });

                            if (downloadResponse.ok) {
                                const fileStream = fs.createWriteStream(tempFilePath);
                                await new Promise((resolve, reject) => {
                                    downloadResponse.body.pipe(fileStream);
                                    downloadResponse.body.on('error', reject);
                                    fileStream.on('finish', resolve);
                                });
                            }
                        }
                    } catch (fallbackError) {
                        console.error('Info-based fallback failed:', fallbackError.message);

                        // Last resort: direct URL download
                        const downloadResponse = await fetch(url, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                'Referer': new URL(url).origin,
                            },
                        });

                        if (!downloadResponse.ok) {
                            throw new Error(`All download methods failed. Last status: ${downloadResponse.status}`);
                        }

                        const fileStream = fs.createWriteStream(tempFilePath);
                        await new Promise((resolve, reject) => {
                            downloadResponse.body.pipe(fileStream);
                            downloadResponse.body.on('error', reject);
                            fileStream.on('finish', resolve);
                        });
                    }
                }
            }
        }

        if (!fs.existsSync(tempFilePath)) {
            throw new Error('Download failed - file not created');
        }

        const stat = fs.statSync(tempFilePath);

        if (stat.size === 0) {
            fs.unlinkSync(tempFilePath);
            throw new Error('Downloaded file is empty');
        }

        // Enhanced content type and filename detection
        let fileInfo = detectFileTypeFromUrl(tempFilePath, platform, mediaTitle);

        // Override with actual file extension if different
        const actualExtension = path.extname(tempFilePath);
        if (actualExtension && actualExtension !== fileInfo.ext) {
            if (actualExtension === '.mp4') fileInfo = { ext: '.mp4', type: 'video/mp4' };
            else if (actualExtension === '.mp3') fileInfo = { ext: '.mp3', type: 'audio/mpeg' };
            else if (actualExtension === '.m4a') fileInfo = { ext: '.m4a', type: 'audio/mp4' };
            else if (actualExtension === '.webm') fileInfo = { ext: '.webm', type: 'video/webm' };
            else if (actualExtension === '.jpg') fileInfo = { ext: '.jpg', type: 'image/jpeg' };
            else if (actualExtension === '.png') fileInfo = { ext: '.png', type: 'image/png' };
        }

        // Generate descriptive filename with preserved media name
        let downloadFilename = '';

        if (mediaTitle) {
            downloadFilename = sanitizeFilename(mediaTitle) + fileInfo.ext;
        } else {
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            downloadFilename = `${platform || 'media'}-${timestamp}${fileInfo.ext}`;
        }

        console.log(`Serving ${stat.size} bytes as ${fileInfo.type} with filename: ${downloadFilename}`);

        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Type', fileInfo.type);
        res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
        res.setHeader('Cache-Control', 'no-cache');

        const fileStream = fs.createReadStream(tempFilePath);
        fileStream.pipe(res);

        fileStream.on('end', () => {
            fs.unlink(tempFilePath, (err) => {
                if (err) console.error('Error deleting temp file:', err);
                else console.log(`Cleaned up temp file: ${tempFilePath}`);
            });
        });

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed', details: error.message });
    }
});

// Platform-specific endpoints using old server logic

// YouTube endpoint
app.get('/api/youtube', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        let ytData;

        // Try ytdl-core first (better alternative)
        try {
            if (ytdlCore) {
                const info = await ytdlCore.getInfo(url);
                if (info && info.formats && info.formats.length > 0) {
                    const format = info.formats.find(f =>
                        f.hasVideo && f.hasAudio && f.container === 'mp4'
                    ) || info.formats.find(f =>
                        f.hasVideo && f.hasAudio
                    ) || info.formats[0];

                    ytData = {
                        title: info.videoDetails.title,
                        high: format.url,
                        thumbnail: info.videoDetails.thumbnails?.[0]?.url
                    };
                }
            }
        } catch (ytdlCoreError) {
            console.warn(`ytdl-core failed: ${ytdlCoreError.message}`);
        }

        // Try controller as fallback
        if (!ytData && controllers.youtubeController && controllers.youtubeController.downloadYouTubeVideo) {
            try {
                ytData = await controllers.youtubeController.downloadYouTubeVideo(url);
            } catch (err) {
                console.warn(`YouTube controller failed: ${err.message}`);
            }
        }

        // Last fallback to youtube-dl-exec (if available)
        if (!ytData && youtubeDl) {
            try {
                const result = await processYoutubeWithYtdl(url);
                if (result.success) {
                    ytData = result.data;
                }
            } catch (ytdlError) {
                console.warn(`youtube-dl-exec fallback failed: ${ytdlError.message}`);
            }
        }

        if (!ytData) {
            throw new Error('YouTube processing failed');
        }

        return res.json({
            title: ytData.title || 'YouTube Video',
            formats: [{
                itag: 'yt_high',
                quality: 'High Quality',
                mimeType: 'video/mp4',
                url: ytData.high || ytData.url || '',
                hasAudio: true,
                hasVideo: true,
            }],
            thumbnails: [{ url: ytData.thumbnail || '' }],
            platform: 'youtube',
            mediaType: 'video',
            directUrl: `/api/direct?url=${encodeURIComponent(ytData.high || ytData.url)}&title=${encodeURIComponent(ytData.title || 'YouTube Video')}`
        });
    } catch (error) {
        console.error('YouTube endpoint error:', error);
        res.status(500).json({ error: 'YouTube processing failed', details: error.message });
    }
});

// Twitter endpoint
app.get('/api/twitter', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        console.log(`Processing Twitter URL: ${url}`);

        let twData;

        // Try btch-downloader first (old working package)
        try {
            twData = await twitter(url);
            if (twData && twData.data && (twData.data.high || twData.data.low)) {
                const formattedData = await formatData('twitter', twData);

                return res.json({
                    title: formattedData.title,
                    formats: [{
                        itag: 'twitter_high',
                        quality: 'High Quality',
                        mimeType: 'video/mp4',
                        url: formattedData.url,
                        hasAudio: true,
                        hasVideo: true,
                    }],
                    thumbnails: [{ url: formattedData.thumbnail }],
                    platform: 'twitter',
                    mediaType: 'video',
                    directUrl: `/api/direct?url=${encodeURIComponent(formattedData.url)}&title=${encodeURIComponent(formattedData.title)}`
                });
            }
        } catch (btchError) {
            console.warn(`btch-downloader twitter failed: ${btchError.message}`);
        }

        // Try controller as fallback
        if (!twData && controllers.twitterController) {
            try {
                twData = await controllers.twitterController.downloadTwitterVideo(url);
                if (twData) {
                    return res.json({
                        title: twData.title,
                        formats: [{
                            itag: 'twitter_0',
                            quality: 'Original Quality',
                            mimeType: 'video/mp4',
                            url: twData.url,
                            hasAudio: true,
                            hasVideo: true
                        }],
                        thumbnails: [{ url: twData.thumbnail }],
                        platform: 'twitter',
                        mediaType: 'video',
                        directUrl: twData.localFilePath ? twData.url : `/api/direct?url=${encodeURIComponent(twData.url)}`
                    });
                }
            } catch (controllerError) {
                console.warn(`Twitter controller failed: ${controllerError.message}`);
            }
        }

        // Try enhanced Twitter handler from old server
        const twitterResult = await processTwitterWithYtdl(url);
        if (twitterResult.success) {
            const hasLocalFile = !!twitterResult.data.localFilePath;

            return res.json({
                title: twitterResult.data.title,
                formats: [{
                    itag: 'twitter_0',
                    quality: 'Original Quality',
                    mimeType: 'video/mp4',
                    url: twitterResult.data.url,
                    hasAudio: true,
                    hasVideo: true
                }],
                thumbnails: [{ url: twitterResult.data.thumbnail }],
                platform: 'twitter',
                mediaType: 'video',
                directUrl: hasLocalFile ? twitterResult.data.url : `/api/direct?url=${encodeURIComponent(twitterResult.data.url)}`
            });
        }

        throw new Error('Twitter processing failed');
    } catch (error) {
        console.error('Twitter endpoint error:', error);
        res.status(500).json({
            error: 'Twitter processing failed',
            details: error.message,
            suggestion: 'Twitter may be restricting this video. Try downloading with a browser extension instead.'
        });
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

        // Try @mrnima/facebook-downloader first (old working package)
        try {
            fbData = await facebook(url);
            if (fbData && fbData.result && (fbData.result.links?.HD || fbData.result.links?.SD)) {
                return res.json({
                    title: fbData.title || 'Facebook Video',
                    formats: [{
                        itag: 'fb_0',
                        quality: 'Original Quality',
                        mimeType: 'video/mp4',
                        url: fbData.result.links.HD || fbData.result.links.SD,
                        hasAudio: true,
                        hasVideo: true,
                    }],
                    thumbnails: [{ url: fbData.result.thumbnail || 'https://via.placeholder.com/300x150' }],
                    platform: 'facebook',
                    mediaType: 'video',
                    directUrl: `/api/direct?url=${encodeURIComponent(fbData.result.links.HD || fbData.result.links.SD)}&referer=facebook.com`,
                });
            }
        } catch (primaryError) {
            console.warn(`Primary Facebook downloader failed: ${primaryError.message}`);
        }

        // Try @xaviabot/fb-downloader as fallback
        try {
            const altResult = await fbAlt(url);
            if (altResult && (altResult.hd || altResult.sd)) {
                return res.json({
                    title: altResult.title || 'Facebook Video',
                    formats: [{
                        itag: 'fb_0',
                        quality: 'Original Quality',
                        mimeType: 'video/mp4',
                        url: altResult.hd || altResult.sd,
                        hasAudio: true,
                        hasVideo: true,
                    }],
                    thumbnails: [{ url: altResult.thumbnail || 'https://via.placeholder.com/300x150' }],
                    platform: 'facebook',
                    mediaType: 'video',
                    directUrl: `/api/direct?url=${encodeURIComponent(altResult.hd || altResult.sd)}&referer=facebook.com`,
                });
            }
        } catch (altError) {
            console.warn(`Alternative Facebook downloader failed: ${altError.message}`);
        }

        // Try controller as fallback
        if (controllers.facebookController) {
            try {
                fbData = await controllers.facebookController.downloadFacebookVideo(url);

                let videoUrl = '';
                let title = 'Facebook Video';
                let thumbnail = 'https://via.placeholder.com/300x150';

                if (fbData.result?.links) {
                    videoUrl = fbData.result.links.HD || fbData.result.links.SD || '';
                    title = fbData.title || title;
                    thumbnail = fbData.result.thumbnail || thumbnail;
                } else if (fbData.hd || fbData.sd) {
                    videoUrl = fbData.hd || fbData.sd || '';
                    title = fbData.title || title;
                    thumbnail = fbData.thumbnail || thumbnail;
                }

                return res.json({
                    title: title,
                    formats: [{
                        itag: 'fb_0',
                        quality: 'Original Quality',
                        mimeType: 'video/mp4',
                        url: videoUrl,
                        hasAudio: true,
                        hasVideo: true,
                    }],
                    thumbnails: [{ url: thumbnail }],
                    platform: 'facebook',
                    mediaType: 'video',
                    directUrl: `/api/direct?url=${encodeURIComponent(videoUrl)}&referer=facebook.com`,
                });
            } catch (controllerError) {
                console.warn(`Facebook controller failed: ${controllerError.message}`);
            }
        }

        throw new Error('Facebook processing failed');
    } catch (error) {
        console.error('Facebook endpoint error:', error);
        res.status(500).json({ error: 'Facebook processing failed', details: error.message });
    }
});

// Instagram endpoint
app.get('/api/instagram', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        let igData;

        // Try btch-downloader first (old working package)
        try {
            igData = await igdl(url);
            if (igData && igData[0]?.url) {
                const formattedData = await formatData('instagram', igData);

                return res.json({
                    title: formattedData.title,
                    formats: [{
                        itag: 'ig_0',
                        quality: 'Original Quality',
                        mimeType: 'video/mp4',
                        url: formattedData.url,
                        hasAudio: true,
                        hasVideo: true,
                    }],
                    thumbnails: [{ url: formattedData.thumbnail }],
                    platform: 'instagram',
                    mediaType: 'video',
                    directUrl: `/api/direct?url=${encodeURIComponent(formattedData.url)}&referer=instagram.com`
                });
            }
        } catch (btchError) {
            console.warn(`btch-downloader instagram failed: ${btchError.message}`);
        }

        // Try controller as fallback
        if (controllers.instagramController) {
            try {
                igData = await controllers.instagramController.downloadInstagramMedia(url);
                if (igData) {
                    const isVideo = igData.url && igData.url.includes('.mp4');

                    return res.json({
                        title: igData.title || 'Instagram Media',
                        formats: [{
                            itag: 'ig_0',
                            quality: 'Original Quality',
                            mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
                            url: igData.url,
                            hasAudio: isVideo,
                            hasVideo: isVideo,
                        }],
                        thumbnails: [{ url: igData.thumbnail }],
                        platform: 'instagram',
                        mediaType: isVideo ? 'video' : 'image',
                        directUrl: `/api/direct?url=${encodeURIComponent(igData.url)}&referer=instagram.com`
                    });
                }
            } catch (controllerError) {
                console.warn(`Instagram controller failed: ${controllerError.message}`);
            }
        }

        throw new Error('Instagram processing failed');
    } catch (error) {
        console.error('Instagram endpoint error:', error);
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
        let ttData;

        // Try btch-downloader first (old working package)
        try {
            ttData = await ttdl(url);
            if (ttData && (ttData.video?.[0] || ttData.url)) {
                const formattedData = await formatData('tiktok', ttData);

                return res.json({
                    title: formattedData.title,
                    formats: [{
                        itag: 'tt_0',
                        quality: 'Original Quality',
                        mimeType: 'video/mp4',
                        url: formattedData.url,
                        hasAudio: true,
                        hasVideo: true,
                    }],
                    thumbnails: [{ url: formattedData.thumbnail }],
                    platform: 'tiktok',
                    mediaType: 'video',
                    directUrl: `/api/direct?url=${encodeURIComponent(formattedData.url)}&referer=tiktok.com`
                });
            }
        } catch (btchError) {
            console.warn(`btch-downloader tiktok failed: ${btchError.message}`);
        }

        // Try controller as fallback
        if (controllers.tiktokController) {
            try {
                ttData = await controllers.tiktokController.downloadTikTokVideo(url);
                if (ttData) {
                    return res.json({
                        title: ttData.title || 'TikTok Video',
                        formats: [{
                            itag: 'tt_0',
                            quality: 'Original Quality',
                            mimeType: 'video/mp4',
                            url: ttData.url,
                            hasAudio: true,
                            hasVideo: true,
                        }],
                        thumbnails: [{ url: ttData.thumbnail }],
                        platform: 'tiktok',
                        mediaType: 'video',
                        directUrl: ttData.localFilePath ? ttData.url : `/api/direct?url=${encodeURIComponent(ttData.url)}&referer=tiktok.com`
                    });
                }
            } catch (controllerError) {
                console.warn(`TikTok controller failed: ${controllerError.message}`);
            }
        }

        throw new Error('TikTok processing failed');
    } catch (error) {
        console.error('TikTok endpoint error:', error);
        res.status(500).json({ error: 'TikTok processing failed', details: error.message });
    }
});

// Threads endpoint
app.get('/api/threads', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        let threadsData;

        // Try controller first
        if (controllers.threadsController) {
            try {
                threadsData = await controllers.threadsController.downloadThreadsMedia(url);
                if (threadsData) {
                    const isVideo = threadsData.url && threadsData.url.includes('.mp4');

                    return res.json({
                        title: threadsData.title,
                        formats: [{
                            itag: 'threads_0',
                            quality: 'Original Quality',
                            mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
                            url: threadsData.url,
                            hasAudio: isVideo,
                            hasVideo: isVideo,
                        }],
                        thumbnails: [{ url: threadsData.thumbnail }],
                        platform: 'threads',
                        mediaType: isVideo ? 'video' : 'image',
                        directUrl: `/api/direct?url=${encodeURIComponent(threadsData.url)}&referer=threads.net`
                    });
                }
            } catch (controllerError) {
                console.warn(`Threads controller failed: ${controllerError.message}`);
            }
        }

        // Fallback to direct parsing (better alternative to shaon)
        const threadsResult = await processThreadsUrlDirect(url);
        if (threadsResult.success) {
            const isVideo = threadsResult.data.url.includes('.mp4');

            return res.json({
                title: threadsResult.data.title,
                formats: [{
                    itag: 'threads_0',
                    quality: 'Original Quality',
                    mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
                    url: threadsResult.data.url,
                    hasAudio: isVideo,
                    hasVideo: isVideo,
                }],
                thumbnails: [{ url: threadsResult.data.thumbnail }],
                platform: 'threads',
                mediaType: isVideo ? 'video' : 'image',
                directUrl: `/api/direct?url=${encodeURIComponent(threadsResult.data.url)}&referer=threads.net`
            });
        }

        throw new Error('Threads processing failed');
    } catch (error) {
        console.error('Threads endpoint error:', error);
        res.status(500).json({ error: 'Threads processing failed', details: error.message });
    }
});

// Pinterest endpoint
app.get('/api/pinterest', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        if (controllers.pinterestController) {
            const pinterestData = await controllers.pinterestController.downloadPinterestMedia(url);

            if (pinterestData && pinterestData.imran) {
                const isVideo = pinterestData.imran.isVideo;

                return res.json({
                    title: pinterestData.imran.title,
                    formats: [{
                        itag: 'pin_0',
                        quality: 'Original Quality',
                        mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
                        url: pinterestData.imran.url,
                        hasAudio: isVideo,
                        hasVideo: isVideo,
                    }],
                    thumbnails: [{ url: pinterestData.imran.thumbnail }],
                    platform: 'pinterest',
                    mediaType: isVideo ? 'video' : 'image',
                    directUrl: pinterestData.imran.localFilePath ?
                        pinterestData.imran.url :
                        `/api/direct?url=${encodeURIComponent(pinterestData.imran.url)}&referer=pinterest.com&title=${encodeURIComponent(pinterestData.imran.title)}`
                });
            }
        }

        throw new Error('Pinterest processing failed');
    } catch (error) {
        console.error('Pinterest endpoint error:', error);
        res.status(500).json({ error: 'Pinterest processing failed', details: error.message });
    }
});

// Audio platforms handler (Spotify, SoundCloud, etc.)
app.get('/api/audio-platform', async (req, res) => {
    const { url, platform } = req.query;

    if (!url || !platform) {
        return res.status(400).json({ error: 'URL and platform are required' });
    }

    try {
        let audioData;

        // Try specific controller first
        if (platform === 'spotify' && controllers.spotifyController) {
            audioData = await controllers.spotifyController.downloadSpotifyAudio(url);
        } else if (platform === 'soundcloud' && controllers.soundcloudController) {
            audioData = await controllers.soundcloudController.downloadSoundCloudAudio(url);
        } else if (['bandcamp', 'deezer', 'apple_music', 'amazon_music', 'mixcloud', 'audiomack'].includes(platform) && controllers.musicPlatformController) {
            audioData = await controllers.musicPlatformController.downloadMusicPlatformAudio(url, platform);
        }

        if (audioData) {
            return res.json({
                title: audioData.title,
                formats: [{
                    itag: `${platform}_0`,
                    quality: 'High Quality Audio',
                    mimeType: 'audio/mp3',
                    url: audioData.url,
                    hasAudio: true,
                    hasVideo: false,
                }],
                thumbnails: [{ url: audioData.thumbnail }],
                platform,
                mediaType: 'audio',
                directUrl: audioData.localFilePath ?
                    audioData.url :
                    `/api/direct?url=${encodeURIComponent(audioData.url)}&referer=${platform}.com&title=${encodeURIComponent(audioData.title)}`
            });
        }

        throw new Error(`${platform} processing failed`);
    } catch (error) {
        console.error(`${platform} endpoint error:`, error);
        res.status(500).json({ error: `${platform} processing failed`, details: error.message });
    }
});

// Video platforms handler (Vimeo, Dailymotion, Twitch)
app.get('/api/video-platform', async (req, res) => {
    const { url, platform } = req.query;

    if (!url || !platform) {
        return res.status(400).json({ error: 'URL and platform are required' });
    }

    try {
        let videoData;

        // Try specific controller
        if (platform === 'vimeo' && controllers.vimeoController) {
            videoData = await controllers.vimeoController.downloadVimeoVideo(url);
        } else if (platform === 'dailymotion' && controllers.dailymotionController) {
            videoData = await controllers.dailymotionController.downloadDailymotionVideo(url);
        } else if (platform === 'twitch' && controllers.twitchController) {
            videoData = await controllers.twitchController.downloadTwitchVideo(url);
        }

        if (videoData) {
            return res.json({
                title: videoData.title,
                formats: [{
                    itag: `${platform}_0`,
                    quality: 'Original Quality',
                    mimeType: 'video/mp4',
                    url: videoData.url,
                    hasAudio: true,
                    hasVideo: true,
                }],
                thumbnails: [{ url: videoData.thumbnail }],
                platform,
                mediaType: 'video',
                directUrl: videoData.localFilePath ?
                    videoData.url :
                    `/api/direct?url=${encodeURIComponent(videoData.url)}&referer=${platform}.com&title=${encodeURIComponent(videoData.title)}`
            });
        }

        throw new Error(`${platform} processing failed`);
    } catch (error) {
        console.error(`${platform} endpoint error:`, error);
        res.status(500).json({ error: `${platform} processing failed`, details: error.message });
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Server accessible at http://localhost:${PORT}`);
    console.log(`📁 Temporary directory: ${TEMP_DIR}`);
    console.log('🎯 Available controllers:');

    Object.entries(controllers).forEach(([name, controller]) => {
        if (controller) {
            console.log(`   ✅ ${name}`);
        } else {
            console.log(`   ❌ ${name} (not available)`);
        }
    });

    console.log('');
    console.log('✨ Optimized features enabled:');
    console.log('   🚀 Fast package loading (old working packages prioritized)');
    console.log('   📹 Video downloads with original titles preserved');
    console.log('   🎵 Audio downloads with artist/track names');
    console.log('   🖼️  Image downloads with descriptive names');
    console.log('   🔄 Multiple quality options for all platforms');
    console.log('   🛡️  Proper file extension detection (.mp4, .mp3, .jpg)');
    console.log('   📝 Media title preservation in filenames');
    console.log('   ⚡ Instant fetching and downloading');
});

module.exports = app;