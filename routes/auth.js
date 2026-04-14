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