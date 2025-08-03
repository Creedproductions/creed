// controllers/youtubeController.js

const axios = require('axios');
const API_BASE_URL = 'https://savebackend.onrender.com/api';
// ─────────────────────────────────────────────────────────
// This is your “good-for-YouTube” server endpoint base.
// When a request arrives here, we re‐POST it to
// https://savebackend.onrender.com/api/download and return the result.

exports.download = async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({
      success: false,
      message: 'Missing `url` in request body'
    });
  }

  try {
    // Forward the same JSON‐body to your “good” download service:
    const response = await axios.post(`${API_BASE_URL}/download`, { url });

    // If that service returns { success: true, data: { … } }, just pass it through:
    if (response.data && response.data.success) {
      return res.json(response.data);
    } else {
      return res.status(response.status).json({
        success: false,
        message: response.data.message || 'External service failed'
      });
    }
  } catch (err) {
    console.error('Error calling good‐server:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch from good server'
    });
  }
};
