import express from 'express';
import {
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  bulkUpdateAvailability,
  getCategories
} from '../controllers/menuController.js';
import { authenticate, authorize, checkPermission } from '../middleware/auth.js';

const router = express.Router();

// Make GET endpoints public (no authentication required)
router.get('/', getMenuItems);
router.get('/categories', getCategories);

// All other endpoints require authentication
router.post('/', authenticate, authorize('admin', 'manager'), checkPermission('canEditMenu'), createMenuItem);
router.put('/:id', authenticate, authorize('admin', 'manager'), checkPermission('canEditMenu'), updateMenuItem);
router.delete('/:id', authenticate, authorize('admin'), deleteMenuItem);
router.post('/bulk-update', authenticate, authorize('admin', 'manager'), bulkUpdateAvailability);

export default router;
