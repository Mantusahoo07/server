import express from 'express';
import { 
  register, 
  login, 
  changePassword, 
  getCurrentUser,
  getAllUsers,
  updateUser,
  checkUsers
} from '../controllers/authController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/login', login);
router.post('/register', register);  // Now handles first user automatically
router.get('/check-users', checkUsers);

// Protected routes (require authentication)
router.get('/me', authenticate, getCurrentUser);
router.post('/change-password', authenticate, changePassword);

// Admin only routes
router.get('/users', authenticate, authorize('admin'), getAllUsers);
router.put('/users/:id', authenticate, authorize('admin'), updateUser);

export default router;
