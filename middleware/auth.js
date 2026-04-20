const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  try {
    let token = null;
    
    // Priority 1: Authorization header (API requests)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
    
    // Priority 2: httpOnly cookie (browser requests)
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }
    
    // Priority 3: Query parameter (fallback for auth callback redirect)
    // This is used when frontend first loads after OAuth callback
    if (!token && req.query && req.query.token) {
      token = req.query.token;
    }
    
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

module.exports = authMiddleware;
