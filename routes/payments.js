import express from 'express';
import {
  createOrder,
  verifyPayment,
  refundPayment,
  getPaymentStatus
} from '../controllers/paymentController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.post('/create-order', createOrder);
router.post('/verify', verifyPayment);
router.post('/refund', refundPayment);
router.get('/status/:paymentId', getPaymentStatus);

export default router;