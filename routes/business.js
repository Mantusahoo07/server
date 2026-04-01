import express from 'express';
import {
  getBusinessDetails,
  saveBusinessDetails,
  initializeBusinessDetails
} from '../controllers/businessController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Public routes (for printing receipts)
router.get('/', getBusinessDetails);

// Protected routes (only admins and managers can edit)
router.post('/', authenticate, authorize('admin', 'manager'), saveBusinessDetails);
router.post('/initialize', authenticate, authorize('admin'), initializeBusinessDetails);

export default router;
