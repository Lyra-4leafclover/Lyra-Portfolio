// Vercel Serverless Backend Database for Lyra Portfolio Guestbook
let globalComments = [];

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { name, msg } = body || {};

      if (!name || !msg) {
        return res.status(400).json({ error: 'Name and message are required' });
      }

      const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const newComment = {
        name: name.trim(),
        msg: msg.trim(),
        date: dateStr,
        timestamp: Date.now()
      };

      globalComments.unshift(newComment);
      return res.status(200).json({ success: true, comments: globalComments });
    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // GET handler returns all global comments
  return res.status(200).json({ comments: globalComments });
}
