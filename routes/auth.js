import express from 'express';
import { 
  register, 
  login, 
  changePassword, 
  getCurrentUser,
  getAllUsers,
  updateUser,
  deleteUser,
  checkUsers,
  publicRegister
} from '../controllers/authController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/login', login);
router.get('/check-users', checkUsers);
router.post('/register', publicRegister);

// Protected routes
router.get('/me', authenticate, getCurrentUser);
router.post('/change-password', authenticate, changePassword);

// Admin only routes
router.post('/register/admin', authenticate, authorize('admin'), register);
router.get('/users', authenticate, authorize('admin'), getAllUsers);
router.put('/users/:id', authenticate, authorize('admin'), updateUser);
router.delete('/users/:id', authenticate, authorize('admin'), deleteUser);

export default router;
