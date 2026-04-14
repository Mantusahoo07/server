import express from 'express';
import { 
  getSalesReport, 
  getTopItems, 
  getStaffPerformance,
  getOrderTypeDistribution,
  getPaymentMethodDistribution
} from '../controllers/reportController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.use(authorize('admin', 'manager'));

router.get('/sales', getSalesReport);
router.get('/top-items', getTopItems);
router.get('/staff-performance', getStaffPerformance);
router.get('/order-types', getOrderTypeDistribution);
router.get('/payment-methods', getPaymentMethodDistribution);

export default router;