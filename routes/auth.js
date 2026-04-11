const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

router.get('/google', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid','email','profile','https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/spreadsheets'],
    prompt: 'consent select_account'
  });
  res.json({ success: true, url: authUrl });
});

router.get('/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.redirect(`${process.env.FRONTEND_URL}/login?error=no_code`);

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const { id, email, name, picture } = userInfo.data;

    let user = await User.findOne({ googleId: id });
    const isNewUser = !user;

    if (!user) {
      user = new User({
        googleId: id, email, name, avatar: picture,
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

    const jwtToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    // needsOnboarding = new user OR brand onboarding not complete
    const needsOnboarding = isNewUser || !user.brand.onboardingComplete;
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${jwtToken}&needsOnboarding=${needsOnboarding}`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      avatar: req.user.avatar,
      brand: req.user.brand,
      driveConnected: req.user.driveConnected,
      driveName: req.user.driveName,
      driveLink: req.user.driveLink
    }
  });
});

// Update brand profile (onboarding + settings)
router.put('/brand', authMiddleware, async (req, res) => {
  try {
    const allowed = ['name','tagline','logo','primaryColor','accentColor','currency','country','website','instagram','phone','address','founded','category'];
    allowed.forEach(k => { if (req.body[k] !== undefined) req.user.brand[k] = req.body[k]; });
    if (req.body.complete) req.user.brand.onboardingComplete = true;
    await req.user.save();
    res.json({ success: true, brand: req.user.brand });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/logout', authMiddleware, async (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;
