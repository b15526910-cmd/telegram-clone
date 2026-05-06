const { adminClient, anonClient } = require('../supabaseClient');

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

const normalizeUsername = (value, email) => {
  if (value && value.trim().length >= 3) {
    return value.trim().toLowerCase().replace(/[^a-z0-9_\.]/g, '_');
  }
  const prefix = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `${prefix}_${Math.floor(1000 + Math.random() * 9000)}`;
};

const ensureUniqueUsername = async (username, email) => {
  let candidate = normalizeUsername(username, email);
  let tries = 0;
  while (tries < 10) {
    const { data, error } = await adminClient
      .from('profiles')
      .select('id')
      .eq('username', candidate)
      .limit(1);

    if (error) {
      throw error;
    }
    if (!data || data.length === 0) {
      return candidate;
    }
    candidate = `${candidate}_${Math.floor(100 + Math.random() * 900)}`;
    tries += 1;
  }
  return `${candidate}_${Date.now()}`;
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.json({ error: 'Method not allowed' });
  }

  try {
    const body = await parseJsonBody(req);
    const { email, password, username: rawUsername } = body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const username = await ensureUniqueUsername(rawUsername, email);

    const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username }
    });

    if (createError) {
      return res.status(400).json({ error: createError.message || 'Failed to create user' });
    }

    const userId = userData?.user?.id;
    if (!userId) {
      return res.status(500).json({ error: 'Failed to create user session' });
    }

    const profileInsert = await adminClient
      .from('profiles')
      .insert([{ id: userId, email, username, created_at: new Date().toISOString() }]);

    if (profileInsert.error) {
      return res.status(500).json({ error: profileInsert.error.message || 'Failed to save profile' });
    }

    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
      email,
      password
    });

    if (signInError || !signInData?.session) {
      return res.status(500).json({ error: signInError?.message || 'Failed to sign in new user' });
    }

    return res.status(201).json({ session: signInData.session, user: signInData.user });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ error: error.message || 'Server error' });
  }
};
