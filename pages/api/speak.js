export default async function handler(req, res) {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  const { ssml } = req.body;

  const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { ssml },
      voice: {
        languageCode: "en-IN",
        name: "en-IN-Standard-E",
        ssmlGender: "FEMALE"
      },
      audioConfig: { audioEncoding: "MP3" }
    })
  });

  const data = await response.json();
  res.status(200).json(data);
}
