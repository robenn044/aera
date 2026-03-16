// ElevenLabs Text-to-Speech API for Albanian
// Uses a high-quality Albanian female voice

export default async function handler(req, res) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing text parameter' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ error: 'ElevenLabs API key not configured' });
  }

  try {
    // Use a multilingual voice that supports Albanian
    // "Rachel" is a good multilingual female voice
    const voiceId = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // Sarah - multilingual
    
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_multilingual_v2', // Best for non-English languages
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            style: 0.4,
            use_speaker_boost: true
          }
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API error:', errorText);
      return res.status(response.status).json({ 
        error: 'TTS generation failed',
        details: errorText 
      });
    }

    // Get the audio as a buffer
    const audioBuffer = await response.arrayBuffer();
    
    // Return as base64 for easy client-side playback
    const base64Audio = Buffer.from(audioBuffer).toString('base64');
    
    return res.status(200).json({ 
      audio: base64Audio,
      format: 'audio/mpeg'
    });

  } catch (error) {
    console.error('TTS error:', error);
    return res.status(500).json({ 
      error: 'Failed to generate speech',
      message: error.message 
    });
  }
}
