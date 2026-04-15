import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'secretkey', {
    expiresIn: '7d'
  });
};

// Check if any users exist (public)
export const checkUsers = async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    res.json({ 
      hasUsers: userCount > 0,
      isFirstUser: userCount === 0,
      count: userCount 
    });
  } catch (error) {
    console.error('Error checking users:', error);
    res.status(500).json({ error: error.message });
  }
};

// Public registration (allows first user without auth)
export const publicRegister = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    
    // Basic validation
    if (!username || username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    // Check if any users exist
    const userCount = await User.countDocuments();
    
    // If users exist, require authentication
    if (userCount > 0) {
      // Check for authentication token
      const token = req.header('Authorization')?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ error: 'Authentication required. Only admin can create users.' });
      }
      
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretkey');
        const user = await User.findById(decoded.userId);
        
        if (!user || user.role !== 'admin') {
          return res.status(403).json({ error: 'Admin privileges required to create users' });
        }
      } catch (authError) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this username or email' });
    }
    
    // For first user, force role to admin
    let finalRole = role;
    if (userCount === 0) {
      finalRole = 'admin';
      console.log('First user created as admin');
    } else if (!role) {
      return res.status(400).json({ error: 'Role is required' });
    }
    
    // Validate role
    const validRoles = ['admin', 'manager', 'cashier', 'pos', 'kitchen'];
    if (!validRoles.includes(finalRole)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    const user = new User({ 
      username, 
      email, 
      password, 
      role: finalRole,
      active: true 
    });
    await user.save();
    
    res.status(201).json({
      success: true,
      message: userCount === 0 ? 'Admin user created successfully' : 'User created successfully',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const register = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    
    // Only admin can create users (already checked in middleware)
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    const user = new User({ username, email, password, role });
    await user.save();
    
    res.status(201).json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        permissions: user.permissions
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (!user.active) {
      return res.status(401).json({ error: 'Account is disabled' });
    }
    
    user.lastLogin = new Date();
    await user.save();
    
    const token = generateToken(user._id);
    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        permissions: user.permissions
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.userId);
    
    const isValid = await user.comparePassword(oldPassword);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid old password' });
    }
    
    user.password = newPassword;
    await user.save();
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    // Only admin can view all users (already checked in middleware)
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { role, active } = req.body;
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Prevent admin from changing their own role
    if (req.userId === user._id && role && role !== user.role) {
      return res.status(400).json({ error: 'You cannot change your own role' });
    }
    
    if (role) user.role = role;
    if (active !== undefined) user.active = active;
    
    await user.save();
    res.json({ 
      message: 'User updated successfully',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        active: user.active
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Prevent admin from deleting themselves
    if (req.userId === user._id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    
    await user.deleteOne();
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
