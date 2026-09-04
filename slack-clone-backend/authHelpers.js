const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('./db');

const ACCESS_SECRET = process.env.JWT_SECRET || 'access_secret';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'refresh_secret';

// Hash token helper using SHA256
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Generate Access Token (Short-lived: 15 mins)
function generateAccessToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, ACCESS_SECRET, { expiresIn: '15m' });
}

// Generate Refresh Token & Save to DB (Long-lived: 7 days)
async function generateAndSaveRefreshToken(user) {
  const refreshToken = jwt.sign({ id: user.id }, REFRESH_SECRET, { expiresIn: '7d' });
  const tokenHash = hashToken(refreshToken);
  
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, tokenHash, expiresAt]
  );

  return refreshToken;
}

module.exports = {
  hashToken,
  generateAccessToken,
  generateAndSaveRefreshToken,
  ACCESS_SECRET,
  REFRESH_SECRET,
};