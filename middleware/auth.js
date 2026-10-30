import jwt from 'jsonwebtoken';

// Middleware to protect routes (Authentication)
export const protect = async (req, res, next) => {
  let token;

  // Extract token from Authorization header first, fallback to cookie
  if (req.headers.authorization && req.headers.authorization.toLowerCase().startsWith('bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'loyola_ems_super_secret_key_2026');

    // Attach decoded payload (id and role) to request
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

// Middleware to authorize Admins only
export const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ message: 'Not authorized as an admin' });
  }
};

// Middleware to authorize Teachers only
export const isTeacher = (req, res, next) => {
  if (req.user && req.user.role === 'teacher') {
    next();
  } else {
    return res.status(403).json({ message: 'Not authorized as a teacher' });
  }
};
