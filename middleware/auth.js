import express from 'express';
import { 
  checkFirstRun,
  createFirstAdmin,
  register, 
  login, 
  changePassword, 
  getCurrentUser,
  getAllUsers,
  updateUser,
  deleteUser
} from '../controllers/authController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// ============ Public Routes (No Authentication Required) ============

// Check if this is the first run (no users in database)
router.get('/check-first-run', checkFirstRun);

// Create the first admin user (only works when no users exist)
router.post('/create-first-admin', createFirstAdmin);

// Regular login
router.post('/login', login);

// ============ Protected Routes (Authentication Required) ============

// Get current user info
router.get('/me', authenticate, getCurrentUser);

// Change password
router.post('/change-password', authenticate, changePassword);

// ============ Admin Only Routes ============

// Register new user (admin only)
router.post('/register', authenticate, authorize('admin'), register);

// Get all users (admin only)
router.get('/users', authenticate, authorize('admin'), getAllUsers);

// Update user (admin only)
router.put('/users/:id', authenticate, authorize('admin'), updateUser);

// Delete user (admin only)
router.delete('/users/:id', authenticate, authorize('admin'), deleteUser);

export default router;
