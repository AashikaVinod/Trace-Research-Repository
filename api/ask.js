// ===================================================================
// api/ask.js - OPTIONAL Vercel serverless function for AI answers.
//
// Only used when AI_ASSISTANT = true in js/config.js. It keeps your
// Anthropic API key on the server (in a Vercel environment variable),
// never in the browser.
//
// Setup (Vercel dashboard -> Project -> Settings -> Environment Variables):
//   ANTHROPIC_API_KEY   your key from console.anthropic.com
//   ANTHROPIC_MODEL     optional, defaults to claude-haiku-5-5
// Check the current model names in the docs before deploying:
//   https://docs.claude.com/en/api/overview
//
// Note: anyone who can open your site can use this endpoint, which uses
// your API credit. Keep max_tokens small, and turn it off after the demo.
// ===================================================================

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'AI is not set up on the server' });

  const question = String((req.body && req.body.question) || '').slice(0, 500);
  const context = String((req.body && req.body.context) || '').slice(0, 12000);
  if (!question) return res.status(400).json({ error: 'Ask a question' });

  try {
    const reply = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
        max_tokens: 400,
        system: 'You are Ask TRACE, an assistant inside a UX research repository. Answer in 2 to 5 short sentences or a short "- " bullet list. Use only the research data provided. If the data does not answer the question, say so. The data is fictional demo data.',
        messages: [{ role: 'user', content: `Research data:\n${context}\n\nQuestion: ${question}` }],
      }),
    });
    if (!reply.ok) return res.status(502).json({ error: `the AI service returned ${reply.status}` });
    const result = await reply.json();
    const answer = (result.content || []).filter((block) => block.type === 'text').map((block) => block.text).join('\n');
    return res.status(200).json({ answer });
  } catch (error) {
    return res.status(502).json({ error: 'the AI service could not be reached' });
  }
};
