const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AppError } = require('./errorHandler');

const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      throw new AppError('Authentication required', 401);
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId)
      .select('-password -refreshToken')
      .populate('location');

    if (!user) {
      throw new AppError('User not found', 401);
    }

    if (!user.isActive) {
      throw new AppError('Account is deactivated', 403);
    }

    req.user = user;
    req.token = token;
    req.locationId = decoded.locationId || user.location?._id;
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Token expired', 401));
    }
    next(error);
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    if (!roles.includes(req.user.role) && req.user.role !== 'admin') {
      return next(new AppError('Insufficient permissions', 403));
    }

    next();
  };
};

const checkPermission = (permission) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next(new AppError('Authentication required', 401));
      }

      // Admin has all permissions
      if (req.user.role === 'admin') {
        return next();
      }

      const hasPermission = await req.user.hasPermission(permission);

      if (!hasPermission) {
        return next(new AppError('Insufficient permissions', 403));
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

const checkLocationAccess = (req, res, next) => {
  const locationId = req.params.locationId || req.body.locationId || req.query.locationId;

  if (!locationId) {
    return next();
  }

  // Admin can access all locations
  if (req.user.role === 'admin') {
    return next();
  }

  // Check if user has access to this location
  const hasAccess = req.user.accessibleLocations?.some(
    loc => loc.toString() === locationId
  ) || req.user.location?._id.toString() === locationId;

  if (!hasAccess) {
    return next(new AppError('Access to this location denied', 403));
  }

  next();
};

module.exports = {
  authenticate,
  authorize,
  checkPermission,
  checkLocationAccess
};