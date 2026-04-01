import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'secretkey', {
    expiresIn: '7d'
  });
};

export const register = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    
    // Check if this is the first user
    const userCount = await User.countDocuments();
    const isFirstUser = userCount === 0;
    
    // For first user, no authentication needed
    // For subsequent users, require admin authentication
    if (!isFirstUser) {
      // Check if user is authenticated
      if (!req.userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const currentUser = await User.findById(req.userId);
      if (!currentUser || currentUser.role !== 'admin') {
        return res.status(403).json({ error: 'Only admin can create users' });
      }
    }
    
    // For first user, force role to admin
    const userRole = isFirstUser ? 'admin' : (role || 'pos');
    
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    const user = new User({ 
      username, 
      email, 
      password, 
      role: userRole 
    });
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
    console.error('Registration error:', error);
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
    console.error('Login error:', error);
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
    console.error('Change password error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    res.json(user);
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Only admin can view users' });
    }
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateUser = async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Only admin can update users' });
    }
    
    const { role, active, permissions } = req.body;
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (role) user.role = role;
    if (active !== undefined) user.active = active;
    if (permissions) user.permissions = { ...user.permissions, ...permissions };
    
    await user.save();
    res.json(user);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const checkUsers = async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    res.json({ isFirstUser: userCount === 0 });
  } catch (error) {
    console.error('Check users error:', error);
    res.json({ isFirstUser: true });
  }
};
