const { anonClient } = require('../supabaseClient');

const parseJsonBody = (req) => {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.json({ error: 'Method not allowed' });
  }

  try {
    const body = await parseJsonBody(req);
    const { email, password } = body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { data, error } = await anonClient.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data?.session) {
      return res.status(401).json({ error: error?.message || 'Invalid credentials' });
    }

    return res.status(200).json({ session: data.session, user: data.user });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: error.message || 'Server error' });
  }
};
