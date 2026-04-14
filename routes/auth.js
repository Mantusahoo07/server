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
import { authenticate, authorize } from '../middleware/auth.js';  // Make sure this path is correct

const router = express.Router();

// Public routes
router.get('/check-first-run', checkFirstRun);
router.post('/create-first-admin', createFirstAdmin);
router.post('/login', login);

// Protected routes
router.get('/me', authenticate, getCurrentUser);
router.post('/change-password', authenticate, changePassword);

// Admin only routes
router.post('/register', authenticate, authorize('admin'), register);
router.get('/users', authenticate, authorize('admin'), getAllUsers);
router.put('/users/:id', authenticate, authorize('admin'), updateUser);
router.delete('/users/:id', authenticate, authorize('admin'), deleteUser);

export default router;
