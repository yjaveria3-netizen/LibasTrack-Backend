const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const logger = require('../middleware/logger');
const { brandUpdateValidation } = require('../middleware/validators');

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
    const { code, error, error_description } = req.query;
    logger.info('OAuth Callback Started', { hasCode: !!code, error });
    
    // Handle Google OAuth errors
    if (error) {
      logger.error('Google OAuth Error', { error, error_description });
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=${encodeURIComponent(error)}`);
    }
    
    if (!code) {
      logger.error('OAuth callback error: No code returned from Google');
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=no_code`);
    }

    logger.info('Exchanging code for tokens');
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens || !tokens.access_token) {
      throw new Error('No access token received from Google');
    }
    
    logger.info('Tokens received, fetching user info');
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const { id, email, name, picture } = userInfo.data;

    if (!id || !email) {
      throw new Error('Google profile missing required fields');
    }

    logger.info('User info retrieved, finding/creating user', { googleId: id, email });
    let user = await User.findOne({ googleId: id });
    const isNewUser = !user;

    if (!user) {
      logger.info('Creating new user', { email });
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
      logger.info('Updating existing user', { email });
      user.accessToken = tokens.access_token;
      if (tokens.refresh_token) user.refreshToken = tokens.refresh_token;
      user.tokenExpiry = new Date(tokens.expiry_date);
      user.lastLogin = new Date();
      user.avatar = picture;
    }
    
    logger.info('Saving user to database');
    await user.save();
    logger.info('User saved successfully', { userId: user._id });

    const jwtToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    const needsOnboarding = isNewUser || !user.brand.onboardingComplete;
    const needsStorageSetup = !needsOnboarding && !user.storageType;
    
    // Set JWT in httpOnly cookie for extra security (requires credentials: true on frontend)
    res.cookie('token', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',  // Changed from 'strict' to 'lax' to allow cross-origin redirect
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });
    
    // ALSO include token in redirect URL as backup
    // Frontend should prefer cookie, but can use URL param if cookie not available
    const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback` +
      `?token=${jwtToken}` +  // Backup: include in URL
      `&needsOnboarding=${needsOnboarding}` +
      `&needsStorageSetup=${needsStorageSetup}`;
    
    logger.info('OAuth Callback Success', { userId: user._id, isNewUser, redirectUrl });
    res.redirect(redirectUrl);
  } catch (err) {
    logger.error('OAuth Callback Error', {
      message: err.message,
      stack: err.stack,
      response: err.response?.data
    });
    // Redirect with error message
    const errorMsg = encodeURIComponent(err.message || 'oauth_failed');
    res.redirect(`${process.env.FRONTEND_URL}/login?error=${errorMsg}`);
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
    Expires: '0'
  });

  res.json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      avatar: req.user.avatar,
      brand: req.user.brand,
      storageType: req.user.storageType,
      localPath: req.user.localPath,
      driveConnected: req.user.driveConnected,
      driveName: req.user.driveName,
      driveLink: req.user.driveLink
    }
  });
});

// Update brand profile (onboarding + settings)
router.put('/brand', authMiddleware, brandUpdateValidation, async (req, res) => {
  try {
    const allowed = ['name','tagline','logo','primaryColor','accentColor','currency','country','website','instagram','phone','address','city','founded','category'];
    allowed.forEach(k => { if (req.body[k] !== undefined) req.user.brand[k] = req.body[k]; });
    if (req.body.complete) req.user.brand.onboardingComplete = true;
    await req.user.save();
    res.json({ success: true, brand: req.user.brand });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/logout', authMiddleware, async (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

// Sliding session refresh — accepts current valid JWT, returns a fresh 30d token
router.post('/refresh', authMiddleware, async (req, res) => {
  try {
    const newToken = jwt.sign({ userId: req.user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token: newToken });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
