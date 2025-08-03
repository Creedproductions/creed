// controllers/twitterController.js
const { twitter } = require('btch-downloader');

async function downloadTwitterVideo(url) {
    console.log(`🐦 Processing Twitter/X URL: ${url}`);

    try {
        const result = await twitter(url);

        if (!result || !result.data) {
            throw new Error('No Twitter data returned');
        }

        const twitterData = result.data;

        // Get the best quality video URL
        const videoUrl = twitterData.HD || twitterData.SD || twitterData.high || twitterData.low;

        if (!videoUrl) {
            throw new Error('No video URL found in Twitter data');
        }

        console.log(`✅ Twitter video extracted successfully`);

        return {
            title: twitterData.title || 'Twitter Video',
            url: videoUrl,
            thumbnail: twitterData.thumbnail || 'https://via.placeholder.com/300x150',
            isVideo: true
        };

    } catch (error) {
        console.error(`❌ Twitter extraction error: ${error.message}`);
        throw new Error(`Failed to download Twitter video: ${error.message}`);
    }
}

module.exports = { downloadTwitterVideo };