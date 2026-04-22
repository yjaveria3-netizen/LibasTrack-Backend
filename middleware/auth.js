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
    
    // REMOVED: Query parameter fallback for security
    // Tokens must NEVER be passed in URLs - they can be logged, leaked via Referer headers, or stored in browser history
    // Frontend must use credentials: 'include' in fetch calls to access httpOnly cookies
    
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
