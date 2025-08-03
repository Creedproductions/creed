// controllers/facebookController.js
const { facebook } = require('@mrnima/facebook-downloader');
const fbAlt = require('@xaviabot/fb-downloader');

async function downloadFacebookVideo(url) {
  console.log(`Processing Facebook URL: ${url}`);

  // Try primary method first
  try {
    const result = await facebook(url);
    if (result && result.result && (result.result.links?.HD || result.result.links?.SD)) {
      console.log("Facebook video successfully downloaded with primary method");
      return result;
    }
    throw new Error("Primary Facebook downloader returned invalid data");
  }
  catch (primaryError) {
    console.warn(`Primary Facebook download failed: ${primaryError.message}`);

    // Try secondary method
    try {
      console.log("Trying alternative Facebook downloader...");
      const altResult = await fbAlt(url);

      if (altResult && (altResult.hd || altResult.sd)) {
        console.log("Facebook video successfully downloaded with alternative method");
        return altResult;
      }
      throw new Error("Alternative downloader returned invalid data");
    }
    catch (altError) {
      console.error(`Alternative Facebook download also failed: ${altError.message}`);
      throw new Error(`Failed to download Facebook video: ${altError.message}`);
    }
  }
}

module.exports = { downloadFacebookVideo };
