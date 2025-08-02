const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const axios = require('axios');

// Import working dependencies
const { BitlyClient } = require('bitly');
const tinyurl = require('tinyurl');
const config = require('./config');
const youtubeDl = require('youtube-dl-exec');
const fetch = require('node-fetch');

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

// Try to import optional dependencies with fallbacks
let ttdl, twitter, igdl, facebook, fbAlt;

try {
    const btchDownloader = require('btch-downloader');
    ttdl = btchDownloader.ttdl;
    twitter = btchDownloader.twitter;
    igdl = btchDownloader.igdl;
    console.log('✅ btch-downloader loaded');
} catch (err) {
    console.warn('⚠️  btch-downloader not available, using fallbacks');
}

try {
    facebook = require('@mrnima/facebook-downloader').facebook;
    console.log('✅ @mrnima/facebook-downloader loaded');
} catch (err) {
    console.warn('⚠️  @mrnima/facebook-downloader not available');
}

try {
    fbAlt = require('@xaviabot/fb-downloader');
    console.log('✅ @xaviabot/fb-downloader loaded');
} catch (err) {
    console.warn('⚠️  @xaviabot/fb-downloader not available');
}

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
            // Check if title suggests video
            if (mediaTitle && (mediaTitle.toLowerCase().includes('video') || mediaTitle.toLowerCase().includes('gif'))) {
                return { ext: '.mp4', type: 'video/mp4' };
            }
            return { ext: '.jpg', type: 'image/jpeg' };
        }
        if (platform === 'threads') {
            return { ext: '.jpg', type: 'image/jpeg' }; // Default, might be video
        }
    }

    // Fallback to video as most common
    return { ext: '.mp4', type: 'video/mp4' };
}

// Enhanced content type detection from response headers
function detectContentTypeFromHeaders(headers, platform, url, mediaTitle = '') {
    const contentType = headers.get('content-type');

    if (contentType) {
        // Direct content type mapping
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

    // Fallback to URL-based detection
    return detectFileTypeFromUrl(url, platform, mediaTitle);
}

// Function to shorten URL with fallback
const shortenUrl = async (url) => {
    if (!url) {
        console.warn("Shorten URL: No URL provided.");
        return url;
    }

    try {
        console.info("Shorten URL: Attempting to shorten with Bitly.");
        const response = await bitly.shorten(url);
        console.info("Shorten URL: Successfully shortened with Bitly.");
        return response.link;
    } catch (error) {
        console.warn("Shorten URL: Bitly failed, falling back to TinyURL.");
        try {
            const tinyResponse = await tinyurl.shorten(url);
            console.info("Shorten URL: Successfully shortened with TinyURL.");
            return tinyResponse;
        } catch (fallbackError) {
            console.error("Shorten URL: Both shortening methods failed.");
            return url;
        }
    }
};

// Function to identify platform
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

// Standardize the response for different platforms
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

// Enhanced fallback using youtube-dl
async function processGenericUrlWithYtdl(url, platform) {
    console.log(`Processing ${platform} URL with youtube-dl: ${url}`);

    try {
        const ytdlOptions = {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            addHeader: [
                'referer:' + new URL(url).origin,
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            ],
        };

        // Use appropriate format based on platform type
        const isAudioPlatform = ['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple_music',
            'amazon_music', 'mixcloud', 'audiomack'].includes(platform);

        if (isAudioPlatform) {
            ytdlOptions.extractAudio = true;
            ytdlOptions.audioFormat = 'mp3';
            ytdlOptions.format = 'bestaudio';
        } else {
            ytdlOptions.format = 'best';
        }

        console.log(`Executing youtube-dl for ${platform} with format: ${ytdlOptions.format}`);
        const info = await youtubeDl(url, ytdlOptions);

        let mediaUrl = '';
        let quality = 'Standard Quality';

        if (isAudioPlatform) {
            if (info.url) {
                mediaUrl = info.url;
            } else if (info.formats && info.formats.length > 0) {
                const audioFormats = info.formats
                    .filter(f => f.acodec !== 'none')
                    .sort((a, b) => {
                        const bitrateA = a.abr || 0;
                        const bitrateB = b.abr || 0;
                        return bitrateB - bitrateA;
                    });

                if (audioFormats.length > 0) {
                    const bestFormat = audioFormats[0];
                    mediaUrl = bestFormat.url;
                    if (bestFormat.abr) {
                        quality = `${bestFormat.abr}kbps`;
                    }
                } else if (info.formats.length > 0) {
                    mediaUrl = info.formats[0].url;
                }
            }
        } else {
            if (info.url) {
                mediaUrl = info.url;
            } else if (info.formats && info.formats.length > 0) {
                const videoFormats = info.formats
                    .filter(f => f.vcodec !== 'none' && f.acodec !== 'none')
                    .sort((a, b) => {
                        const heightA = a.height || 0;
                        const heightB = b.height || 0;
                        return heightB - heightA;
                    });

                if (videoFormats.length > 0) {
                    const bestFormat = videoFormats[0];
                    mediaUrl = bestFormat.url;
                    if (bestFormat.height) {
                        quality = `${bestFormat.height}p`;
                    } else if (bestFormat.format_note) {
                        quality = bestFormat.format_note;
                    }
                } else if (info.formats.length > 0) {
                    mediaUrl = info.formats[0].url;
                }
            }
        }

        if (!mediaUrl) {
            throw new Error(`No ${isAudioPlatform ? 'audio' : 'video'} URL found for ${platform}`);
        }

        console.log(`Successfully extracted ${platform} ${isAudioPlatform ? 'audio' : 'video'} URL`);

        return {
            success: true,
            data: {
                title: info.title || `${platform.charAt(0).toUpperCase() + platform.slice(1)} ${isAudioPlatform ? 'Audio' : 'Video'}`,
                url: mediaUrl,
                thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
                sizes: [quality],
                source: platform,
                mediaType: isAudioPlatform ? 'audio' : 'video',
            }
        };
    } catch (ytdlError) {
        console.error(`youtube-dl error for ${platform}: ${ytdlError.message}`);
        throw new Error(`No media formats found`);
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

// Main download endpoint
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

        // Try platform-specific controller first
        switch (platform) {
            case 'youtube':
                if (controllers.youtubeController && controllers.youtubeController.downloadYouTubeVideo) {
                    try {
                        data = await controllers.youtubeController.downloadYouTubeVideo(url);
                        break;
                    } catch (err) {
                        console.warn(`YouTube controller failed: ${err.message}`);
                    }
                }
                // Fallback to generic handler
                const ytResult = await processGenericUrlWithYtdl(url, platform);
                return res.status(200).json(ytResult);

            case 'facebook':
                if (controllers.facebookController && controllers.facebookController.downloadFacebookVideo) {
                    try {
                        data = await controllers.facebookController.downloadFacebookVideo(url);
                        break;
                    } catch (err) {
                        console.warn(`Facebook controller failed: ${err.message}`);
                    }
                }
                // Fallback to btch-downloader if available
                if (facebook) {
                    data = await facebook(url);
                    break;
                }
                throw new Error('Facebook downloader not available');

            case 'instagram':
                if (controllers.instagramController && controllers.instagramController.downloadInstagramMedia) {
                    try {
                        data = await controllers.instagramController.downloadInstagramMedia(url);
                        break;
                    } catch (err) {
                        console.warn(`Instagram controller failed: ${err.message}`);
                    }
                }
                // Fallback to btch-downloader if available
                if (igdl) {
                    data = await igdl(url);
                    break;
                }
                throw new Error('Instagram downloader not available');

            case 'twitter':
                if (controllers.twitterController && controllers.twitterController.downloadTwitterVideo) {
                    try {
                        data = await controllers.twitterController.downloadTwitterVideo(url);
                        const formattedData = await formatData(platform, data);
                        return res.status(200).json({
                            success: true,
                            data: formattedData
                        });
                    } catch (err) {
                        console.warn(`Twitter controller failed: ${err.message}`);
                    }
                }
                // Fallback to generic handler
                const twResult = await processGenericUrlWithYtdl(url, platform);
                return res.status(200).json(twResult);

            case 'tiktok':
                if (controllers.tiktokController && controllers.tiktokController.downloadTikTokVideo) {
                    try {
                        data = await controllers.tiktokController.downloadTikTokVideo(url);
                        break;
                    } catch (err) {
                        console.warn(`TikTok controller failed: ${err.message}`);
                    }
                }
                // Fallback to btch-downloader if available
                if (ttdl) {
                    data = await ttdl(url);
                    break;
                }
                throw new Error('TikTok downloader not available');

            case 'threads':
                if (controllers.threadsController && controllers.threadsController.downloadThreadsMedia) {
                    try {
                        data = await controllers.threadsController.downloadThreadsMedia(url);
                        break;
                    } catch (err) {
                        console.warn(`Threads controller failed: ${err.message}`);
                    }
                }
                // Fallback to generic handler
                const threadsResult = await processGenericUrlWithYtdl(url, platform);
                return res.status(200).json(threadsResult);

            case 'pinterest':
                if (controllers.pinterestController && controllers.pinterestController.downloadPinterestMedia) {
                    try {
                        data = await controllers.pinterestController.downloadPinterestMedia(url);
                        break;
                    } catch (err) {
                        console.warn(`Pinterest controller failed: ${err.message}`);
                    }
                }
                // Fallback to generic handler
                const pinterestResult = await processGenericUrlWithYtdl(url, platform);
                return res.status(200).json(pinterestResult);

            case 'soundcloud':
                if (controllers.soundcloudController && controllers.soundcloudController.downloadSoundCloudAudio) {
                    try {
                        data = await controllers.soundcloudController.downloadSoundCloudAudio(url);
                        break;
                    } catch (err) {
                        console.warn(`SoundCloud controller failed: ${err.message}`);
                    }
                }
                // Fallback to generic handler
                const scResult = await processGenericUrlWithYtdl(url, platform);
                return res.status(200).json(scResult);

            case 'spotify':
                if (controllers.spotifyController && controllers.spotifyController.downloadSpotifyAudio) {
                    try {
                        data = await controllers.spotifyController.downloadSpotifyAudio(url);
                        break;
                    } catch (err) {
                        console.warn(`Spotify controller failed: ${err.message}`);
                    }
                }
                // Fallback to generic handler
                const spotifyResult = await processGenericUrlWithYtdl(url, platform);
                return res.status(200).json(spotifyResult);

            case 'vimeo':
                if (controllers.vimeoController && controllers.vimeoController.downloadVimeoVideo) {
                    try {
                        data = await controllers.vimeoController.downloadVimeoVideo(url);
                        break;
                    } catch (err) {
                        console.warn(`Vimeo controller failed: ${err.message}`);
                    }
                }
                // Fallback to generic handler
                const vimeoResult = await processGenericUrlWithYtdl(url, platform);
                return res.status(200).json(vimeoResult);

            case 'dailymotion':
                if (controllers.dailymotionController && controllers.dailymotionController.downloadDailymotionVideo) {
                    try {
                        data = await controllers.dailymotionController.downloadDailymotionVideo(url);
                        break;
                    } catch (err) {
                        console.warn(`Dailymotion controller failed: ${err.message}`);
                    }
                }
                // Fallback to generic handler
                const dmResult = await processGenericUrlWithYtdl(url, platform);
                return res.status(200).json(dmResult);

            case 'twitch':
                if (controllers.twitchController && controllers.twitchController.downloadTwitchVideo) {
                    try {
                        data = await controllers.twitchController.downloadTwitchVideo(url);
                        break;
                    } catch (err) {
                        console.warn(`Twitch controller failed: ${err.message}`);
                    }
                }
                // Fallback to generic handler
                const twitchResult = await processGenericUrlWithYtdl(url, platform);
                return res.status(200).json(twitchResult);

            default:
                // For music platforms, try music platform controller
                if (['bandcamp', 'deezer', 'apple_music', 'amazon_music', 'mixcloud', 'audiomack'].includes(platform)) {
                    if (controllers.musicPlatformController && controllers.musicPlatformController.downloadMusicPlatformAudio) {
                        try {
                            data = await controllers.musicPlatformController.downloadMusicPlatformAudio(url, platform);
                            break;
                        } catch (err) {
                            console.warn(`Music platform controller failed: ${err.message}`);
                        }
                    }
                }

                // For all other platforms, use generic handler
                console.info(`Using enhanced generic handler for platform: ${platform}`);
                const result = await processGenericUrlWithYtdl(url, platform);
                return res.status(200).json(result);
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

        // Final fallback to youtube-dl for any platform
        try {
            console.log(`Attempting youtube-dl fallback for ${platform} URL: ${url}`);
            const fallbackResult = await processGenericUrlWithYtdl(url, platform);
            return res.status(200).json(fallbackResult);
        } catch (fallbackError) {
            console.error(`Fallback also failed: ${fallbackError.message}`);
            res.status(500).json({ error: 'Failed to download media', details: error.message });
        }
    }
});

// API info endpoint
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

        // Fall back to youtube-dl for all platforms
        try {
            const platform = identifyPlatform(url);
            const isAudioPlatform = ['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple_music',
                'amazon_music', 'mixcloud', 'audiomack'].includes(platform);

            const result = await processGenericUrlWithYtdl(url, platform);

            if (result && result.success && result.data) {
                const isImage = result.data.url && (
                    result.data.url.includes('.jpg') ||
                    result.data.url.includes('.jpeg') ||
                    result.data.url.includes('.png')
                );

                return res.json({
                    title: result.data.title,
                    formats: [{
                        itag: 'best',
                        quality: result.data.sizes?.[0] || 'Best Quality',
                        mimeType: isImage ? 'image/jpeg' :
                            isAudioPlatform ? 'audio/mp3' : 'video/mp4',
                        url: result.data.url,
                        hasAudio: !isImage,
                        hasVideo: !isImage && !isAudioPlatform,
                    }],
                    thumbnails: [{ url: result.data.thumbnail }],
                    platform,
                    mediaType: isImage ? 'image' :
                        isAudioPlatform ? 'audio' : 'video',
                    directUrl: `/api/direct?url=${encodeURIComponent(result.data.url)}&referer=${platform}.com&title=${encodeURIComponent(result.data.title || '')}`
                });
            }

            throw new Error('Generic handler failed');
        } catch (fallbackError) {
            console.error('Fallback processing error:', fallbackError);

            // Ultimate fallback with minimal info
            const platform = identifyPlatform(url) || 'unknown';
            const isAudioPlatform = ['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple_music',
                'amazon_music', 'mixcloud', 'audiomack'].includes(platform);

            res.json({
                title: `${platform.charAt(0).toUpperCase() + platform.slice(1)} Media`,
                thumbnails: [{ url: 'https://via.placeholder.com/300x150' }],
                formats: [{
                    itag: 'best',
                    quality: 'Original Quality',
                    mimeType: isAudioPlatform ? 'audio/mp3' : 'video/mp4',
                    url: url,
                    hasAudio: true,
                    hasVideo: !isAudioPlatform,
                }],
                platform,
                mediaType: isAudioPlatform ? 'audio' : 'video',
                directUrl: `/api/direct?url=${encodeURIComponent(url)}&referer=${platform}.com`
            });
        }
    }
});

// ENHANCED /api/direct endpoint with media name preservation
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

// ENHANCED /api/download endpoint with media name preservation
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

// Platform-specific endpoints

// YouTube endpoint
app.get('/api/youtube', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        let ytData;

        // Try controller first
        if (controllers.youtubeController && controllers.youtubeController.downloadYouTubeVideo) {
            try {
                ytData = await controllers.youtubeController.downloadYouTubeVideo(url);
            } catch (err) {
                console.warn(`YouTube controller failed: ${err.message}`);
            }
        }

        // Fallback to generic handler
        if (!ytData) {
            const result = await processGenericUrlWithYtdl(url, 'youtube');
            if (result.success) {
                ytData = result.data;
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

// YouTube Music endpoint
app.get('/api/youtube-music', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        let ytData;

        // Try controller first
        if (controllers.youtubeController && controllers.youtubeController.downloadYouTubeMusic) {
            try {
                ytData = await controllers.youtubeController.downloadYouTubeMusic(url);
            } catch (err) {
                console.warn(`YouTube Music controller failed: ${err.message}`);
            }
        }

        // Fallback to generic handler
        if (!ytData) {
            const result = await processGenericUrlWithYtdl(url, 'youtube');
            if (result.success) {
                ytData = result.data;
            }
        }

        if (!ytData) {
            throw new Error('YouTube Music processing failed');
        }

        return res.json({
            title: ytData.title || 'YouTube Music',
            formats: [{
                itag: 'ytmusic_high',
                quality: 'High Quality Audio',
                mimeType: 'audio/mp3',
                url: ytData.high || ytData.url || '',
                hasAudio: true,
                hasVideo: false,
            }],
            thumbnails: [{ url: ytData.thumbnail || 'https://via.placeholder.com/300x150' }],
            platform: 'youtube_music',
            mediaType: 'audio',
            directUrl: `/api/direct?url=${encodeURIComponent(ytData.high || ytData.url)}&title=${encodeURIComponent(ytData.title || 'YouTube Music')}`,
            source: ytData.source || 'unknown',
            isAudio: true
        });
    } catch (error) {
        console.error('YouTube Music endpoint error:', error);
        res.status(500).json({ error: 'YouTube Music processing failed', details: error.message });
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
    console.log('✨ Features enabled:');
    console.log('   📹 Video downloads with original titles preserved');
    console.log('   🎵 Audio downloads with artist/track names');
    console.log('   🖼️  Image downloads with descriptive names');
    console.log('   🔄 Multiple quality options for all platforms');
    console.log('   🛡️  Proper file extension detection (.mp4, .mp3, .jpg)');
    console.log('   📝 Media title preservation in filenames');
});