import jwt from 'jsonwebtoken';
import pool from '../db/db.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'classbeacon_production_secure_jwt_secret_key_2026_unified';

if (!process.env.JWT_SECRET) {
  console.warn('[SECURITY WARNING] JWT_SECRET is not set in environment variables! Using default fallback secret.');
}

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required.' });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }

    try {
      // VULN-03 Revocation Check: Ensure user is still active in DB
      const [rows] = await pool.query(
        'SELECT id, user_id, email, role, full_name, active FROM users WHERE id = ?',
        [decoded.id]
      );

      if (!rows || rows.length === 0) {
        return res.status(401).json({ error: 'User account no longer exists.' });
      }

      const dbUser = rows[0];
      if (!dbUser.active) {
        return res.status(403).json({ error: 'Account has been suspended or deactivated. Access revoked immediately.' });
      }

      req.user = {
        ...decoded,
        role: dbUser.role,
        active: dbUser.active,
      };
      next();
    } catch (dbErr) {
      console.error('Error verifying user active status:', dbErr);
      return res.status(500).json({ error: 'Internal security check failed.' });
    }
  });
}

export function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Unauthorized role.' });
    }
    next();
  };
}

