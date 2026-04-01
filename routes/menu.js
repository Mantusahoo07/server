import express from 'express';
import {
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  bulkUpdateAvailability,
  getCategories
} from '../controllers/menuController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.get('/', getMenuItems);
router.get('/categories', getCategories);

// Protected routes
router.post('/', authenticate, authorize('admin', 'manager'), createMenuItem);
router.put('/:id', authenticate, authorize('admin', 'manager'), updateMenuItem);
router.delete('/:id', authenticate, authorize('admin'), deleteMenuItem);
router.post('/bulk-update', authenticate, authorize('admin', 'manager'), bulkUpdateAvailability);

export default router;
