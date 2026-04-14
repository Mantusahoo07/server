import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'secretkey', {
    expiresIn: '7d'
  });
};

// Check if any users exist (first run check)
export const checkFirstRun = async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    res.json({ 
      isFirstRun: userCount === 0,
      userCount 
    });
  } catch (error) {
    console.error('Error checking first run:', error);
    res.status(500).json({ error: error.message });
  }
};

// Create first admin user (only works when no users exist)
export const createFirstAdmin = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Check if any users exist
    const userCount = await User.countDocuments();
    if (userCount > 0) {
      return res.status(403).json({ error: 'Users already exist. Use regular login.' });
    }
    
    // Validate inputs
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    // Check if username or email already exists (shouldn't happen but just in case)
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Create admin user
    const admin = new User({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password,
      role: 'admin',
      active: true
    });
    
    await admin.save();
    
    const token = generateToken(admin._id);
    
    res.status(201).json({
      token,
      user: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions
      },
      isFirstAdmin: true
    });
  } catch (error) {
    console.error('Error creating first admin:', error);
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
