const axios = require('axios');
const crypto = require('crypto');
const Order = require('../models/Order');
const MenuItem = require('../models/Menu');
const logger = require('./logger');

class AggregatorService {
  constructor() {
    this.platforms = new Map();
    this.isRunning = false;
    this.pollingIntervals = new Map();
    this.webhookHandlers = new Map();
  }

  initialize() {
    this.isRunning = true;
    
    // Initialize platform configurations
    this.setupPlatform('zomato', {
      baseUrl: process.env.ZOMATO_API_URL,
      apiKey: process.env.ZOMATO_API_KEY,
      webhookSecret: process.env.ZOMATO_WEBHOOK_SECRET
    });

    this.setupPlatform('swiggy', {
      baseUrl: process.env.SWIGGY_API_URL,
      apiKey: process.env.SWIGGY_API_KEY,
      webhookSecret: process.env.SWIGGY_WEBHOOK_SECRET
    });

    this.setupPlatform('uber-eats', {
      baseUrl: process.env.UBER_EATS_API_URL,
      apiKey: process.env.UBER_EATS_API_KEY,
      webhookSecret: process.env.UBER_EATS_WEBHOOK_SECRET
    });

    logger.info('Aggregator service initialized');
  }

  stop() {
    this.isRunning = false;
    
    // Clear all polling intervals
    for (const [platform, interval] of this.pollingIntervals) {
      clearInterval(interval);
    }
    
    this.pollingIntervals.clear();
    logger.info('Aggregator service stopped');
  }

  setupPlatform(platform, config) {
    this.platforms.set(platform, {
      ...config,
      enabled: true,
      lastSync: null,
      webhookUrl: `${process.env.BASE_URL}/api/aggregators/${platform}/webhook`
    });

    // Set up polling for platforms without webhooks
    if (platform === 'zomato' || platform === 'swiggy') {
      const interval = setInterval(
        () => this.pollOrders(platform),
        60000 // Poll every minute
      );
      this.pollingIntervals.set(platform, interval);
    }

    // Set up webhook handlers
    this.setupWebhookHandler(platform);
  }

  setupWebhookHandler(platform) {
    const handler = async (req, res) => {
      try {
        const signature = req.headers['x-aggregator-signature'];
        const payload = JSON.stringify(req.body);
        
        // Verify webhook signature
        if (!this.verifyWebhookSignature(platform, payload, signature)) {
          logger.warn(`Invalid webhook signature for ${platform}`);
          return res.status(401).json({ error: 'Invalid signature' });
        }

        // Process webhook based on platform
        switch (platform) {
          case 'zomato':
            await this.handleZomatoWebhook(req.body);
            break;
          case 'swiggy':
            await this.handleSwiggyWebhook(req.body);
            break;
          case 'uber-eats':
            await this.handleUberEatsWebhook(req.body);
            break;
        }

        res.json({ received: true });
      } catch (error) {
        logger.error(`Webhook error for ${platform}:`, error);
        res.status(500).json({ error: 'Webhook processing failed' });
      }
    };

    this.webhookHandlers.set(platform, handler);
  }

  verifyWebhookSignature(platform, payload, signature) {
    const config = this.platforms.get(platform);
    if (!config || !config.webhookSecret) return false;

    const expectedSignature = crypto
      .createHmac('sha256', config.webhookSecret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature || ''),
      Buffer.from(expectedSignature)
    );
  }

  async pollOrders(platform) {
    if (!this.isRunning) return;

    try {
      const config = this.platforms.get(platform);
      const response = await axios.get(`${config.baseUrl}/orders`, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        params: {
          status: 'pending',
          since: config.lastSync
        }
      });

      if (response.data.orders) {
        for (const order of response.data.orders) {
          await this.processAggregatorOrder(platform, order);
        }
      }

      config.lastSync = new Date().toISOString();
    } catch (error) {
      logger.error(`Error polling ${platform} orders:`, error);
    }
  }

  async processAggregatorOrder(platform, orderData) {
    try {
      // Check if order already exists
      const existingOrder = await Order.findOne({
        'aggregatorInfo.platform': platform,
        'aggregatorInfo.orderId': orderData.id
      });

      if (existingOrder) {
        // Update existing order status
        await this.updateOrderStatus(existingOrder, orderData.status);
        return;
      }

      // Create new order
      const order = await this.createOrderFromAggregator(platform, orderData);
      
      // Notify via WebSocket
      if (global.io) {
        global.io.to(`location:${order.locationId}`).emit('aggregator:new-order', {
          platform,
          orderId: order.orderNumber,
          customer: order.customerInfo?.name,
          total: order.total
        });
      }

      logger.info(`New ${platform} order created: ${order.orderNumber}`);
    } catch (error) {
      logger.error(`Error processing ${platform} order:`, error);
    }
  }

  async createOrderFromAggregator(platform, data) {
    // Map aggregator order data to your order model
    const orderData = {
      locationId: data.restaurantId, // Map to your location ID
      orderType: 'delivery',
      source: 'aggregator',
      aggregatorInfo: {
        platform,
        orderId: data.id,
        restaurantId: data.restaurantId,
        customerRating: data.customer?.rating,
        deliveryPartner: data.deliveryPartner,
        estimatedDeliveryTime: data.estimatedDeliveryTime
      },
      customerInfo: {
        name: data.customer?.name,
        phone: data.customer?.phone,
        email: data.customer?.email
      },
      deliveryInfo: {
        address: data.deliveryAddress,
        contactNumber: data.customer?.phone,
        instructions: data.deliveryInstructions
      },
      items: await this.mapAggregatorItems(platform, data.items),
      subtotal: data.subtotal,
      tax: data.tax,
      deliveryCharge: data.deliveryCharge,
      total: data.total,
      orderStatus: 'pending',
      paymentStatus: 'paid', // Aggregator orders are usually pre-paid
      'timing.orderedAt': new Date(data.createdAt)
    };

    // Calculate totals
    const order = new Order(orderData);
    await order.save();

    return order;
  }

  async mapAggregatorItems(platform, items) {
    const mappedItems = [];

    for (const item of items) {
      // Find matching menu item
      const menuItem = await MenuItem.findOne({
        'aggregatorInfo.platform': platform,
        'aggregatorInfo.itemId': item.id
      });

      mappedItems.push({
        menuItemId: menuItem?._id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        modifiers: item.modifiers?.map(mod => ({
          name: mod.name,
          price: mod.price
        })),
        specialInstructions: item.instructions
      });
    }

    return mappedItems;
  }

  async updateOrderStatus(order, aggregatorStatus) {
    const statusMap = {
      'accepted': 'confirmed',
      'preparing': 'preparing',
      'ready': 'ready',
      'picked_up': 'completed',
      'cancelled': 'cancelled',
      'rejected': 'cancelled'
    };

    const newStatus = statusMap[aggregatorStatus];
    if (newStatus && order.orderStatus !== newStatus) {
      order.orderStatus = newStatus;
      order.timing[`${newStatus}At`] = new Date();
      await order.save();

      // Notify aggregator of status change
      await this.sendStatusUpdate(order);
    }
  }

  async sendStatusUpdate(order) {
    const platform = order.aggregatorInfo.platform;
    const config = this.platforms.get(platform);

    if (!config || !config.enabled) return;

    try {
      await axios.post(
        `${config.baseUrl}/orders/${order.aggregatorInfo.orderId}/status`,
        {
          status: this.mapStatusToAggregator(order.orderStatus),
          estimatedPrepTime: order.preparationTime?.estimated
        },
        {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (error) {
      logger.error(`Error sending status update to ${platform}:`, error);
    }
  }

  mapStatusToAggregator(status) {
    const reverseMap = {
      'confirmed': 'confirmed',
      'preparing': 'preparing',
      'ready': 'ready_for_pickup',
      'completed': 'delivered'
    };
    return reverseMap[status] || status;
  }

  async syncMenu(platform, locationId) {
    const config = this.platforms.get(platform);
    if (!config || !config.enabled) return;

    try {
      // Get current menu
      const menu = await MenuItem.find({ locationId, available: true });
      
      // Format for aggregator
      const formattedMenu = menu.map(item => ({
        id: item._id,
        name: item.name,
        description: item.description,
        price: item.price,
        category: item.category,
        subcategory: item.subcategory,
        dietary: item.dietary,
        allergens: item.allergens,
        images: item.images.map(img => img.url),
        available: item.available,
        preparationTime: item.preparationTime,
        modifierGroups: item.modifierGroups?.map(group => ({
          name: group.name,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          required: group.required,
          options: group.options.map(opt => ({
            name: opt.name,
            price: opt.price,
            available: opt.available
          }))
        }))
      }));

      // Upload to aggregator
      await axios.post(
        `${config.baseUrl}/menu/sync`,
        { items: formattedMenu },
        {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info(`Menu synced to ${platform}`);
    } catch (error) {
      logger.error(`Error syncing menu to ${platform}:`, error);
      throw error;
    }
  }

  async updateItemAvailability(platform, locationId, itemId, available) {
    const config = this.platforms.get(platform);
    if (!config || !config.enabled) return;

    try {
      await axios.patch(
        `${config.baseUrl}/menu/items/${itemId}`,
        { available },
        {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (error) {
      logger.error(`Error updating item availability on ${platform}:`, error);
    }
  }

  // Webhook handlers
  async handleZomatoWebhook(payload) {
    switch (payload.event) {
      case 'order.created':
        await this.processAggregatorOrder('zomato', payload.order);
        break;
      case 'order.cancelled':
        await this.handleOrderCancellation('zomato', payload.orderId);
        break;
      case 'order.updated':
        await this.handleOrderUpdate('zomato', payload.order);
        break;
    }
  }

  async handleSwiggyWebhook(payload) {
    // Similar to Zomato handler
  }

  async handleUberEatsWebhook(payload) {
    // Similar to Zomato handler
  }

  async handleOrderCancellation(platform, orderId) {
    const order = await Order.findOne({
      'aggregatorInfo.platform': platform,
      'aggregatorInfo.orderId': orderId
    });

    if (order) {
      order.orderStatus = 'cancelled';
      order.timing.cancelledAt = new Date();
      await order.save();
    }
  }

  async handleOrderUpdate(platform, orderData) {
    const order = await Order.findOne({
      'aggregatorInfo.platform': platform,
      'aggregatorInfo.orderId': orderData.id
    });

    if (order) {
      await this.updateOrderStatus(order, orderData.status);
    }
  }

  // Get aggregator status
  getAggregatorStatus(platform) {
    const config = this.platforms.get(platform);
    if (!config) return null;

    return {
      platform,
      enabled: config.enabled,
      lastSync: config.lastSync,
      webhookUrl: config.webhookUrl
    };
  }

  // Enable/disable aggregator
  setAggregatorEnabled(platform, enabled) {
    const config = this.platforms.get(platform);
    if (config) {
      config.enabled = enabled;
      logger.info(`${platform} ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    }
    return false;
  }
}

module.exports = new AggregatorService();