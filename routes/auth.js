import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isValid = await user.comparePassword(password);
    if (!isValid) {
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
});

// Setup first admin user (no auth required - only works if no admin exists)
router.post('/setup-admin', async (req, res) => {
  try {
    const { username, email, password, restaurantName, restaurantAddress, restaurantPhone } = req.body;
    
    // Check if any admin already exists
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      return res.status(400).json({ error: 'Admin user already exists. Use login instead.' });
    }
    
    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Create admin user
    const user = new User({ 
      username, 
      email, 
      password, 
      role: 'admin',
      active: true
    });
    await user.save();
    
    // Save business details if provided
    if (restaurantName) {
      try {
        const BusinessDetail = await import('../models/BusinessDetail.js').then(m => m.default);
        let business = await BusinessDetail.findOne({ key: 'business-details' });
        
        if (business) {
          business.name = restaurantName;
          business.address = restaurantAddress || business.address;
          business.phone = restaurantPhone || business.phone;
          await business.save();
        } else {
          business = new BusinessDetail({
            key: 'business-details',
            name: restaurantName,
            address: restaurantAddress || '',
            phone: restaurantPhone || '',
            currencySymbol: '₹',
            taxLabel: 'GST',
            footerMessage: 'Thank you! Visit Again!'
          });
          await business.save();
        }
        console.log('Business details saved for admin setup');
      } catch (err) {
        console.error('Error saving business details:', err);
        // Don't fail the whole request if business details save fails
      }
    }
    
    // Generate token for auto-login
    const token = generateToken(user._id);
    
    res.status(201).json({
      success: true,
      message: 'Admin user created successfully',
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
    console.error('Error creating admin:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check if admin exists (for setup page)
router.get('/check-admin', async (req, res) => {
  try {
    const adminExists = await User.exists({ role: 'admin' });
    res.json({ adminExists: !!adminExists });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/register', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    
    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    const user = new User({ username, email, password, role });
    await user.save();
    
    res.status(201).json({
      user: { id: user._id, username, email, role: user.role }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/users', authenticate, authorize('admin'), async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/users/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { role, active } = req.body;
    const user = await User.findById(req.params.id);
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (req.userId === user._id && role && role !== user.role) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }
    
    if (role) user.role = role;
    if (active !== undefined) user.active = active;
    await user.save();
    
    res.json({ message: 'User updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/users/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (req.userId === user._id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    await user.deleteOne();
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
