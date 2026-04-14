import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretkey');
    const user = await User.findById(decoded.userId);
    
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    req.userId = user._id;
    req.userRole = user.role;
    req.userPermissions = user.permissions;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

export const checkPermission = (permission) => {
  return (req, res, next) => {
    if (!req.userPermissions || !req.userPermissions[permission]) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

// Role-based access helpers
export const canAccessTab = (tab) => {
  return (req, res, next) => {
    const tabPermissions = {
      'pos': 'canAccessPOS',
      'kitchen': 'canAccessKitchen',
      'orders': 'canAccessOrders',
      'reports': 'canAccessReports',
      'settings': 'canAccessSettings'
    };
    
    const permission = tabPermissions[tab];
    if (!permission || req.userPermissions[permission]) {
      next();
    } else {
      res.status(403).json({ error: `Access denied for ${tab} tab` });
    }
  };
};
