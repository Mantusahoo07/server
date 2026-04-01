import express from 'express';
import { getBusinessDetails, saveBusinessDetails } from '../controllers/businessController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Public route (for printing receipts)
router.get('/', getBusinessDetails);

// Protected route (admin/manager only)
router.post('/', authenticate, authorize('admin', 'manager'), saveBusinessDetails);

export default router;
