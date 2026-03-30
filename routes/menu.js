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

router.use(authenticate);

router.get('/', getMenuItems);
router.get('/categories', getCategories);
router.post('/', authorize('admin', 'manager'), checkPermission('canEditMenu'), createMenuItem);
router.put('/:id', authorize('admin', 'manager'), checkPermission('canEditMenu'), updateMenuItem);
router.delete('/:id', authorize('admin'), deleteMenuItem);
router.post('/bulk-update', authorize('admin', 'manager'), bulkUpdateAvailability);

export default router;