// Vercel Serverless Backend Database for Lyra Portfolio Guestbook
let globalComments = [];

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const name = String(body?.name ?? '').trim().slice(0, 40);
      const msg = String(body?.msg ?? '').trim().slice(0, 500);

      if (!name || !msg) {
        return res.status(400).json({ error: 'Name and message are required' });
      }

      const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const newComment = {
        name,
        msg,
        date: dateStr,
        timestamp: Date.now()
      };

      globalComments.unshift(newComment);
      globalComments = globalComments.slice(0, 200);
      return res.status(200).json({ success: true, comments: globalComments });
    } catch(err) {
      return res.status(400).json({ error: 'Bad request' });
    }
  }

  // GET handler returns all global comments
  return res.status(200).json({ comments: globalComments });
}
