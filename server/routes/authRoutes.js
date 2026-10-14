import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/db.js';
import { authenticateToken, JWT_SECRET } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// POST /api/auth/login with rate limiting protection (VULN-23)
router.post('/login', loginLimiter.middleware(), async (req, res) => {
  const login = req.body.login || req.body.userIdOrEmail || req.body.email;
  const password = req.body.password;

  if (!login || !password) {
    return res.status(400).json({ error: 'User ID / Email and password are required.' });
  }

  try {
    // Match either email or user_id
    const users = await query(
      `SELECT * FROM users WHERE (email = ? OR user_id = ?) AND active = 1`,
      [login, login]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid User ID/Email or password.' });
    }

    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid User ID/Email or password.' });
    }

    // Clear failed login tracker on success
    loginLimiter.reset(req);

    const tokenPayload = {
      id: user.id,
      user_id: user.user_id,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '12h' });

    res.json({
      token,
      user: {
        id: user.id,
        user_id: user.user_id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        phone: user.phone,
        department: user.department,
        year_of_join: user.year_of_join,
        date_of_birth: user.date_of_birth,
        address: user.address,
        beacon_uuid: user.beacon_uuid,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const users = await query(
      `SELECT id, user_id, email, full_name, role, phone, department, year_of_join, date_of_birth, address, beacon_uuid, active, created_at FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User profile not found.' });
    }

    res.json({ user: users[0] });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Server error fetching user profile.' });
  }
});

// POST /api/auth/change-password
// Users can change password by entering previous/current password + new password
router.post('/change-password', authenticateToken, async (req, res) => {
  const previousPassword = req.body.previousPassword || req.body.currentPassword;
  const newPassword = req.body.newPassword;

  if (!previousPassword || !newPassword) {
    return res.status(400).json({ error: 'Previous password and new password are required.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
  }

  try {
    const users = await query(`SELECT password_hash FROM users WHERE id = ?`, [req.user.id]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const currentHash = users[0].password_hash;
    const isMatch = await bcrypt.compare(previousPassword, currentHash);

    if (!isMatch) {
      return res.status(400).json({ error: 'Previous password does not match.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await query(`UPDATE users SET password_hash = ? WHERE id = ?`, [newHash, req.user.id]);

    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Server error changing password.' });
  }
});

export default router;
