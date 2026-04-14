import express from 'express';
import {
  createOrder,
  verifyPayment,
  refundPayment,
  getPaymentStatus,
  creditSale
} from '../controllers/paymentController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All payment routes require authentication
router.use(authenticate);

router.post('/create-order', createOrder);
router.post('/verify', verifyPayment);
router.post('/refund', refundPayment);
router.get('/status/:paymentId', getPaymentStatus);
router.post('/credit-sale', creditSale);

export default router;
