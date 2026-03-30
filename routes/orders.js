import express from 'express';
import {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  updateOrderItemStatus,
  getDailySales
} from '../controllers/orderController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { orderLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.use(authenticate);

router.post('/', orderLimiter, createOrder);
router.get('/', authorize('admin', 'manager', 'cashier'), getOrders);
router.get('/daily-sales', authorize('admin', 'manager'), getDailySales);
router.get('/:id', getOrderById);
router.patch('/:id/status', updateOrderStatus);
router.patch('/:id/item-status', updateOrderItemStatus);

export default router;