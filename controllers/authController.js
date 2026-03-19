const User = require('../models/User');
const Employee = require('../models/Employee');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { AppError } = require('../middleware/errorHandler');
const crypto = require('crypto');
const sendEmail = require('../utils/email');

const generateToken = (userId, locationId) => {
  return jwt.sign(
    { userId, locationId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' }
  );
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new AppError('Validation failed', 400, errors.array()));
    }

    const { email, username, password } = req.body;

    // Find user by email OR username (support both)
    const user = await User.findOne({
      $or: [
        { email: email || username },
        { username: username || email }
      ]
    })
    .populate('location')
    .populate('employeeId');

    if (!user) {
      return next(new AppError('Invalid credentials', 401));
    }

    // Check if user is active
    if (!user.isActive) {
      return next(new AppError('Account is deactivated', 403));
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return next(new AppError('Invalid credentials', 401));
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate tokens
    const token = generateToken(user._id, user.location?._id);
    const refreshToken = generateRefreshToken(user._id);

    // Save refresh token
    user.refreshToken = refreshToken;
    await user.save();

    res.json({
      success: true,
      data: {
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          name: user.name,
          role: user.role,
          location: user.location,
          employeeId: user.employeeId,
          permissions: user.permissions || []
        },
        token,
        refreshToken
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new AppError('Validation failed', 400, errors.array()));
    }

    const { username, email, password, name, role, locationId, phone } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return next(new AppError('User already exists', 400));
    }

    // Create user
    const user = await User.create({
      username,
      email,
      password,
      name,
      role: role || 'staff',
      location: locationId,
      accessibleLocations: locationId ? [locationId] : [],
      phone,
      isActive: true
    });

    // Generate tokens
    const token = generateToken(user._id, locationId);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    await user.save();

    res.status(201).json({
      success: true,
      data: {
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          name: user.name,
          role: user.role
        },
        token,
        refreshToken
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Refresh access token
// @route   POST /api/auth/refresh
// @access  Public
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return next(new AppError('Refresh token required', 400));
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Find user with this refresh token
    const user = await User.findOne({
      _id: decoded.userId,
      refreshToken
    });

    if (!user) {
      return next(new AppError('Invalid refresh token', 401));
    }

    // Check if user is active
    if (!user.isActive) {
      return next(new AppError('Account is deactivated', 403));
    }

    // Generate new tokens
    const newToken = generateToken(user._id, user.location);
    const newRefreshToken = generateRefreshToken(user._id);

    // Update refresh token
    user.refreshToken = newRefreshToken;
    await user.save();

    res.json({
      success: true,
      data: {
        token: newToken,
        refreshToken: newRefreshToken
      }
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Refresh token expired', 401));
    }
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid refresh token', 401));
    }
    next(error);
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
  try {
    // Clear refresh token
    await User.findByIdAndUpdate(req.user._id, {
      $unset: { refreshToken: 1 }
    });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Change password
// @route   POST /api/auth/change-password
// @access  Private
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return next(new AppError('Current password and new password are required', 400));
    }

    if (newPassword.length < 6) {
      return next(new AppError('New password must be at least 6 characters', 400));
    }

    // Get user with password
    const user = await User.findById(req.user._id).select('+password');

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return next(new AppError('Current password is incorrect', 401));
    }

    // Update password
    user.password = newPassword;
    user.passwordChangedAt = new Date();
    await user.save();

    // Clear refresh tokens on password change
    user.refreshToken = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Forgot password - send reset email
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return next(new AppError('Email is required', 400));
    }

    const user = await User.findOne({ email });
    if (!user) {
      return next(new AppError('No user found with this email', 404));
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send email
    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
    
    try {
      await sendEmail({
        to: user.email,
        subject: 'Password Reset Request',
        html: `
          <h2>Password Reset Request</h2>
          <p>You requested a password reset for your RestroPOS account.</p>
          <p>Click the link below to reset your password. This link expires in 1 hour.</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>If you didn't request this, please ignore this email.</p>
        `
      });

      res.json({
        success: true,
        message: 'Password reset email sent'
      });
    } catch (emailError) {
      // If email fails, clear the reset token
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save();
      
      return next(new AppError('Error sending email. Please try again.', 500));
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Reset password with token
// @route   POST /api/auth/reset-password
// @access  Public
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return next(new AppError('Token and password are required', 400));
    }

    if (password.length < 6) {
      return next(new AppError('Password must be at least 6 characters', 400));
    }

    // Hash token
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with valid token
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return next(new AppError('Invalid or expired token', 400));
    }

    // Update password
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.passwordChangedAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
exports.getCurrentUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('location')
      .populate('employeeId')
      .select('-password -refreshToken -passwordResetToken -passwordResetExpires');

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
exports.updateProfile = async (req, res, next) => {
  try {
    const allowedFields = ['name', 'email', 'phone'];
    const updates = {};

    Object.keys(req.body).forEach(key => {
      if (allowedFields.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    // If email is being updated, check if it's already taken
    if (updates.email) {
      const existingUser = await User.findOne({
        email: updates.email,
        _id: { $ne: req.user._id }
      });
      if (existingUser) {
        return next(new AppError('Email already in use', 400));
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    ).select('-password -refreshToken -passwordResetToken -passwordResetExpires');

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Validate token
// @route   GET /api/auth/validate
// @access  Private
exports.validateToken = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('location')
      .populate('employeeId')
      .select('-password -refreshToken -passwordResetToken -passwordResetExpires');

    res.json({
      success: true,
      data: {
        user,
        valid: true
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user permissions
// @route   GET /api/auth/permissions
// @access  Private
exports.getPermissions = async (req, res, next) => {
  try {
    // Return user permissions based on role
    let permissions = [];

    if (req.user.role === 'admin') {
      permissions = ['*']; // Admin has all permissions
    } else if (req.user.role === 'manager') {
      permissions = [
        'view_dashboard', 'view_reports', 'manage_inventory', 
        'manage_employees', 'view_orders', 'update_orders',
        'manage_menu', 'view_customers', 'view_settings'
      ];
    } else if (req.user.role === 'cashier') {
      permissions = [
        'view_dashboard', 'process_payment', 'create_order',
        'view_orders', 'update_orders', 'view_customers'
      ];
    } else if (req.user.role === 'server') {
      permissions = [
        'view_dashboard', 'create_order', 'view_orders',
        'update_orders', 'add_tips', 'view_customers'
      ];
    } else if (req.user.role === 'kitchen') {
      permissions = ['view_kitchen_orders', 'update_order_status', 'view_menu'];
    }

    res.json({
      success: true,
      data: permissions
    });
  } catch (error) {
    next(error);
  }
};
