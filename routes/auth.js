const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const logger = require('../middleware/logger');
const { brandUpdateValidation } = require('../middleware/validators');

// ─────────────────────────────────────────────
// 🔐 Google OAuth Setup
// ─────────────────────────────────────────────
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const isProduction = process.env.NODE_ENV === 'production';

// ─────────────────────────────────────────────
// 🚀 START GOOGLE LOGIN (FIXED)
// ─────────────────────────────────────────────
router.get('/google', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets'
    ],
    prompt: 'consent select_account'
  });

  // ✅ IMPORTANT: redirect instead of JSON
  return res.redirect(authUrl);
});

// ─────────────────────────────────────────────
// 🔄 GOOGLE CALLBACK
// ─────────────────────────────────────────────
router.get('/google/callback', async (req, res) => {
  try {
    const { code, error } = req.query;

    if (error) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=${error}`);
    }

    if (!code) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=no_code`);
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();

    const { id, email, name, picture } = data;

    let user = await User.findOne({ googleId: id });
    const isNewUser = !user;

    if (!user) {
      user = new User({
        googleId: id,
        email,
        name,
        avatar: picture,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || '',
        tokenExpiry: new Date(tokens.expiry_date)
      });
    } else {
      user.accessToken = tokens.access_token;
      if (tokens.refresh_token) user.refreshToken = tokens.refresh_token;
      user.tokenExpiry = new Date(tokens.expiry_date);
      user.lastLogin = new Date();
      user.avatar = picture;
    }

    await user.save();

    // Create JWT
    const jwtToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Set cookie
    res.cookie('token', jwtToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    const needsOnboarding = isNewUser || !user.brand?.onboardingComplete;
    const needsStorageSetup = !needsOnboarding && !user.storageType;

    const redirectUrl =
      `${process.env.FRONTEND_URL}/auth/callback` +
      `?needsOnboarding=${needsOnboarding}` +
      `&needsStorageSetup=${needsStorageSetup}`;

    return res.redirect(redirectUrl);

  } catch (err) {
    logger.error('OAuth Error', err);
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
  }
});

// ─────────────────────────────────────────────
// 👤 GET CURRENT USER
// ─────────────────────────────────────────────
router.get('/me', authMiddleware, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// ─────────────────────────────────────────────
// 🏷️ UPDATE BRAND
// ─────────────────────────────────────────────
router.put('/brand', authMiddleware, brandUpdateValidation, async (req, res) => {
  try {
    Object.assign(req.user.brand, req.body);
    if (req.body.complete) req.user.brand.onboardingComplete = true;

    await req.user.save();

    res.json({ success: true, brand: req.user.brand });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────
// 🚪 LOGOUT
// ─────────────────────────────────────────────
router.post('/logout', authMiddleware, (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax'
  });
  res.json({ success: true });
});

// ─────────────────────────────────────────────
// 🔄 REFRESH TOKEN
// ─────────────────────────────────────────────
router.post('/refresh', authMiddleware, (req, res) => {
  const newToken = jwt.sign(
    { userId: req.user._id },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({ success: true, token: newToken });
});

module.exports = router;
