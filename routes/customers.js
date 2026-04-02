import express from 'express';
import Customer from '../models/Customer.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Get all customers
router.get('/', authenticate, async (req, res) => {
  try {
    const { search, isActive } = req.query;
    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    const customers = await Customer.find(query).sort({ name: 1 });
    res.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get customer by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json(customer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new customer
router.post('/', authenticate, authorize('admin', 'manager', 'cashier'), async (req, res) => {
  try {
    const { name, phone, email, address, gst, creditLimit } = req.body;
    
    const existingCustomer = await Customer.findOne({ phone });
    if (existingCustomer) {
      return res.status(400).json({ error: 'Customer with this phone number already exists' });
    }
    
    const customer = new Customer({
      name,
      phone,
      email: email || '',
      address: address || '',
      gst: gst || '',
      creditLimit: creditLimit || 0,
      outstandingAmount: 0
    });
    
    await customer.save();
    res.status(201).json(customer);
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update customer
router.put('/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { name, phone, email, address, gst, creditLimit, isActive } = req.body;
    
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    if (name) customer.name = name;
    if (phone) customer.phone = phone;
    if (email !== undefined) customer.email = email;
    if (address !== undefined) customer.address = address;
    if (gst !== undefined) customer.gst = gst;
    if (creditLimit !== undefined) customer.creditLimit = creditLimit;
    if (isActive !== undefined) customer.isActive = isActive;
    customer.updatedAt = new Date();
    
    await customer.save();
    res.json(customer);
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete customer
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    const Order = await import('../models/Order.js').then(m => m.default);
    const pendingOrders = await Order.countDocuments({
      'payment.method': 'credit',
      'payment.status': 'credit_due',
      'customer.phone': customer.phone
    });
    
    if (pendingOrders > 0) {
      return res.status(400).json({ 
        error: `Cannot delete customer with ${pendingOrders} pending credit orders. Settle dues first.` 
      });
    }
    
    await customer.deleteOne();
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
