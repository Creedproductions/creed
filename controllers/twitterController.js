// controllers/twitterController.js
const axios = require('axios');
const ytDlp = require('yt-dlp-exec');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

async function downloadTwitterVideo(url) {
    console.log(`Processing Twitter URL: ${url}`);

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

        // Look for video in the page content
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
                title,
                url: videoUrl,
                thumbnail: thumbnail || 'https://via.placeholder.com/300x150',
            };
        }

        // If direct extraction fails, try youtube-dl
        console.log('Direct video extraction failed, trying youtube-dl...');

        const TEMP_DIR = path.join(__dirname, '../temp');
        if (!fs.existsSync(TEMP_DIR)) {
            fs.mkdirSync(TEMP_DIR, { recursive: true });
        }

        const uniqueId = Date.now();
        const tempFilePath = path.join(TEMP_DIR, `twitter-${uniqueId}.mp4`);

        await ytDlp(url, {
            output: tempFilePath,
            format: 'best[ext=mp4]/best',
            noCheckCertificates: true,
            noWarnings: true,
            addHeader: [
                'referer:twitter.com',
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            ],
        });

        if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 10000) {
            console.log(`Successfully downloaded Twitter video to ${tempFilePath}`);
            const videoUrl = `/api/stream-file?path=${encodeURIComponent(tempFilePath)}`;

            return {
                title,
                url: videoUrl,
                thumbnail: 'https://via.placeholder.com/300x150',
                localFilePath: tempFilePath
            };
        }

        throw new Error('Failed to extract video from Twitter URL');
    } catch (error) {
        console.error(`Twitter video extraction error: ${error.message}`);
        throw error;
    }
}

module.exports = { downloadTwitterVideo };