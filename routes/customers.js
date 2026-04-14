import express from 'express';
import Customer from '../models/Customer.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const { search } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    const customers = await Customer.find(query).sort({ name: 1 });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, authorize('admin', 'manager', 'cashier'), async (req, res) => {
  try {
    const { name, phone, email, address } = req.body;
    const existing = await Customer.findOne({ phone });
    if (existing) return res.status(400).json({ error: 'Customer already exists' });
    
    const customer = new Customer({ name, phone, email, address });
    await customer.save();
    res.status(201).json(customer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;