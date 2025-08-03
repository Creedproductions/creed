const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Import controllers
const { downloadInstagramMedia } = require('./controllers/instagramController');
const { downloadTikTokVideo } = require('./controllers/tiktokController');
const { downloadFacebookVideo } = require('./controllers/facebookController');
const { downloadTwitterVideo } = require('./controllers/twitterController');
const { downloadYouTubeVideo } = require('./controllers/youtubeController');
const { downloadPinterestMedia } = require('./controllers/pinterestController');

// Import config
const config = require('./config');

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

// URL shortener (simplified)
const shortenUrl = async (url) => {
    if (!url || url.length < 100) return url;
    // Add your URL shortening logic here if needed
    return url;
};

// Platform identification
const identifyPlatform = (url) => {
    const lowerUrl = url.toLowerCase();

    // Social Media
    if (lowerUrl.includes('instagram.com')) return 'instagram';
    if (lowerUrl.includes('tiktok.com')) return 'tiktok';
    if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch') || lowerUrl.includes('fb.com')) return 'facebook';
    if (lowerUrl.includes('x.com') || lowerUrl.includes('twitter.com')) return 'twitter';
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) return 'youtube';
    if (lowerUrl.includes('pinterest.com') || lowerUrl.includes('pin.it')) return 'pinterest';
    if (lowerUrl.includes('threads.net')) return 'threads';

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
    if (lowerUrl.includes('reddit.com')) return 'reddit';
    if (lowerUrl.includes('linkedin.com')) return 'linkedin';
    if (lowerUrl.includes('tumblr.com')) return 'tumblr';
    if (lowerUrl.includes('vk.com')) return 'vk';
    if (lowerUrl.includes('bilibili.com')) return 'bilibili';
    if (lowerUrl.includes('snapchat.com')) return 'snapchat';

    return null;
};

// Format data for consistent response
const formatData = (platform, data) => {
    const placeholderThumbnail = 'https://via.placeholder.com/300x150';

    return {
        title: data.title || `${platform} Media`,
        url: data.url || '',
        thumbnail: data.thumbnail || placeholderThumbnail,
        sizes: ['Original Quality'],
        source: platform,
        isVideo: data.isVideo !== false // Default to true unless explicitly false
    };
};

// Routes
app.get('/', (req, res) => {
    res.json({
        message: '🚀 Social Media Download API',
        version: '1.0.0',
        status: 'running',
        platforms: ['instagram', 'tiktok', 'facebook', 'twitter', 'youtube', 'pinterest', 'spotify', 'soundcloud', 'vimeo', 'dailymotion'],
        endpoints: ['/api/info', '/api/download-media', '/api/download', '/api/audio', '/api/direct', '/health']
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        temp_files: fs.readdirSync(TEMP_DIR).length
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
        console.log(`🔥 Processing ${platform} URL: ${url}`);
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

        if (!result) {
            throw new Error('Processing failed - no data returned');
        }

        const formattedData = formatData(platform, result);

        // Shorten URLs if needed
        formattedData.url = await shortenUrl(formattedData.url);
        formattedData.thumbnail = await shortenUrl(formattedData.thumbnail);

        console.log(`✅ Successfully processed ${platform} media`);

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

// Flutter-compatible /api/info endpoint
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

        if (!result) {
            throw new Error('Processing failed');
        }

        // Format response for Flutter app
        const isAudioPlatform = ['spotify', 'soundcloud', 'bandcamp', 'deezer'].includes(platform);
        const isImage = platform === 'pinterest' && !result.isVideo;

        const formattedResponse = {
            title: result.title || `${platform} Media`,
            formats: [{
                itag: 'best',
                quality: 'Best Quality',
                mimeType: isImage ? 'image/jpeg' : isAudioPlatform ? 'audio/mp3' : 'video/mp4',
                url: result.url,
                hasAudio: !isImage,
                hasVideo: !isImage && !isAudioPlatform,
            }],
            thumbnails: [{ url: result.thumbnail || 'https://via.placeholder.com/300x150' }],
            platform,
            mediaType: isImage ? 'image' : isAudioPlatform ? 'audio' : 'video',
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

// Platform-specific endpoints for Flutter app
app.get('/api/youtube', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const result = await downloadYouTubeVideo(url);
        const formattedResponse = {
            title: result.title,
            formats: [{
                itag: 'best',
                quality: 'Best Quality',
                mimeType: 'video/mp4',
                url: result.url,
                hasAudio: true,
                hasVideo: true,
            }],
            thumbnails: [{ url: result.thumbnail }],
            platform: 'youtube',
            mediaType: 'video',
            directUrl: `/api/direct?url=${encodeURIComponent(result.url)}&filename=${encodeURIComponent(result.title)}`
        };
        res.json(formattedResponse);
    } catch (error) {
        res.status(500).json({
            error: 'YouTube processing failed',
            details: error.message,
            errorDetail: error.message
        });
    }
});

app.get('/api/facebook', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const result = await downloadFacebookVideo(url);
        const formattedResponse = {
            title: result.title,
            formats: [{
                itag: 'best',
                quality: 'Best Quality',
                mimeType: 'video/mp4',
                url: result.url,
                hasAudio: true,
                hasVideo: true,
            }],
            thumbnails: [{ url: result.thumbnail }],
            platform: 'facebook',
            mediaType: 'video',
            directUrl: `/api/direct?url=${encodeURIComponent(result.url)}&filename=${encodeURIComponent(result.title)}`
        };
        res.json(formattedResponse);
    } catch (error) {
        res.status(500).json({
            error: 'Facebook processing failed',
            details: error.message,
            errorDetail: error.message
        });
    }
});

app.get('/api/pinterest', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const result = await downloadPinterestMedia(url);
        const isVideo = result.isVideo;

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
            platform: 'pinterest',
            mediaType: isVideo ? 'video' : 'image',
            directUrl: `/api/direct?url=${encodeURIComponent(result.url)}&filename=${encodeURIComponent(result.title)}`
        };
        res.json(formattedResponse);
    } catch (error) {
        res.status(500).json({
            error: 'Pinterest processing failed',
            details: error.message,
            errorDetail: error.message
        });
    }
});

app.get('/api/threads', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        // Threads support would go here - using Twitter controller as fallback
        const result = await downloadTwitterVideo(url);
        const formattedResponse = {
            title: result.title,
            formats: [{
                itag: 'best',
                quality: 'Best Quality',
                mimeType: 'video/mp4',
                url: result.url,
                hasAudio: true,
                hasVideo: true,
            }],
            thumbnails: [{ url: result.thumbnail }],
            platform: 'threads',
            mediaType: 'video',
            directUrl: `/api/direct?url=${encodeURIComponent(result.url)}&filename=${encodeURIComponent(result.title)}`
        };
        res.json(formattedResponse);
    } catch (error) {
        res.status(500).json({
            error: 'Threads processing failed',
            details: error.message,
            errorDetail: error.message
        });
    }
});

// Special media endpoint for music and other platforms
app.get('/api/special-media', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        // For now, return a placeholder response for music platforms
        // You can implement specific logic for Spotify, SoundCloud, etc.
        const platform = identifyPlatform(url) || 'unknown';
        const isAudioPlatform = ['spotify', 'soundcloud', 'bandcamp', 'deezer'].includes(platform);

        res.json({
            title: `${platform} Content`,
            formats: [{
                itag: 'audio',
                quality: isAudioPlatform ? 'Audio Only' : 'Best Quality',
                mimeType: isAudioPlatform ? 'audio/mp3' : 'video/mp4',
                url: url, // Placeholder
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

// Audio download endpoint
app.get('/api/audio', async (req, res) => {
    const { url, itag } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        // For audio requests, we'll proxy the original URL
        // You can implement audio extraction logic here
        res.redirect(url);
    } catch (error) {
        res.status(500).json({ error: 'Audio download failed', details: error.message });
    }
});

// Download endpoint
app.get('/api/download', async (req, res) => {
    const { url, itag, platform } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        // Stream the file directly
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            }
        });

        if (!response.ok) {
            throw new Error(`Download failed: ${response.status}`);
        }

        // Set appropriate headers
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', 'attachment');

        response.body.pipe(res);
    } catch (error) {
        res.status(500).json({ error: 'Download failed', details: error.message });
    }
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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
    console.log('\n🚀 ===== SOCIAL MEDIA DOWNLOAD SERVER =====');
    console.log(`🌐 Server running on port ${PORT}`);
    console.log(`📁 Temp directory: ${TEMP_DIR}`);
    console.log(`🔗 Access at: http://localhost:${PORT}`);

    console.log('\n🎯 Supported Platforms:');
    console.log('   📷 Instagram');
    console.log('   🎵 TikTok');
    console.log('   📘 Facebook');
    console.log('   🐦 Twitter/X');
    console.log('   📺 YouTube');
    console.log('   📌 Pinterest');

    console.log('\n✨ Ready to process downloads!');
    console.log('=========================================\n');
});

module.exports = app;