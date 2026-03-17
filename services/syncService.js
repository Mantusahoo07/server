const { v4: uuidv4 } = require('uuid');
const Order = require('../models/Order');
const MenuItem = require('../models/Menu');
const Inventory = require('../models/Inventory');
const Customer = require('../models/Customer');
const logger = require('./logger');

class SyncService {
  constructor() {
    this.syncQueue = new Map();
    this.isRunning = false;
    this.syncInterval = null;
    this.io = null;
    this.conflictResolution = 'server-wins'; // 'server-wins' or 'client-wins' or 'manual'
  }

  initialize(io) {
    this.io = io;
    this.isRunning = true;
    this.syncInterval = setInterval(() => this.processSyncQueue(), 30000); // Every 30 seconds
    logger.info('Sync service initialized');
  }

  stop() {
    this.isRunning = false;
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    logger.info('Sync service stopped');
  }

  // Add item to sync queue
  addToQueue(locationId, data) {
    const syncId = uuidv4();
    const syncItem = {
      id: syncId,
      locationId,
      data,
      status: 'pending',
      attempts: 0,
      maxAttempts: 5,
      createdAt: new Date(),
      lastAttempt: null
    };

    if (!this.syncQueue.has(locationId)) {
      this.syncQueue.set(locationId, []);
    }

    this.syncQueue.get(locationId).push(syncItem);
    logger.debug(`Added to sync queue: ${syncId}`);

    // Notify clients
    if (this.io) {
      this.io.to(`location:${locationId}`).emit('sync:queued', {
        syncId,
        count: this.syncQueue.get(locationId).length
      });
    }

    return syncId;
  }

  // Process sync queue
  async processSyncQueue() {
    if (!this.isRunning) return;

    logger.debug('Processing sync queue...');

    for (const [locationId, queue] of this.syncQueue) {
      const pendingItems = queue.filter(item => 
        item.status === 'pending' && item.attempts < item.maxAttempts
      );

      for (const item of pendingItems) {
        await this.processSyncItem(locationId, item);
      }
    }
  }

  // Process individual sync item
  async processSyncItem(locationId, item) {
    item.attempts++;
    item.lastAttempt = new Date();

    try {
      let result;
      
      switch (item.data.type) {
        case 'order':
          result = await this.syncOrder(locationId, item.data);
          break;
        case 'inventory':
          result = await this.syncInventory(locationId, item.data);
          break;
        case 'customer':
          result = await this.syncCustomer(locationId, item.data);
          break;
        case 'menu':
          result = await this.syncMenu(locationId, item.data);
          break;
        default:
          throw new Error(`Unknown sync type: ${item.data.type}`);
      }

      item.status = 'completed';
      item.completedAt = new Date();
      
      logger.info(`Sync completed: ${item.id}`);

      // Notify clients
      if (this.io) {
        this.io.to(`location:${locationId}`).emit('sync:completed', {
          syncId: item.id,
          result
        });
      }

    } catch (error) {
      logger.error(`Sync failed for ${item.id}:`, error);
      
      if (item.attempts >= item.maxAttempts) {
        item.status = 'failed';
        item.error = error.message;
        
        // Notify clients of failure
        if (this.io) {
          this.io.to(`location:${locationId}`).emit('sync:failed', {
            syncId: item.id,
            error: error.message
          });
        }
      }
    }

    // Remove completed/failed items after processing
    if (item.status !== 'pending') {
      const index = this.syncQueue.get(locationId).findIndex(i => i.id === item.id);
      if (index > -1) {
        this.syncQueue.get(locationId).splice(index, 1);
      }
    }
  }

  // Sync order
  async syncOrder(locationId, data) {
    const { order: clientOrder, action } = data;

    if (action === 'create') {
      // Check for conflict
      const existingOrder = await Order.findOne({
        locationId,
        offlineId: clientOrder.offlineId
      });

      if (existingOrder) {
        if (this.conflictResolution === 'server-wins') {
          // Server version wins
          return { resolved: 'server-wins', order: existingOrder };
        } else if (this.conflictResolution === 'client-wins') {
          // Client version wins - update server
          const updatedOrder = await Order.findByIdAndUpdate(
            existingOrder._id,
            clientOrder,
            { new: true }
          );
          return { resolved: 'client-wins', order: updatedOrder };
        } else {
          // Manual resolution needed
          return { resolved: 'manual', server: existingOrder, client: clientOrder };
        }
      }

      // No conflict - create new order
      const newOrder = await Order.create({
        ...clientOrder,
        locationId,
        syncedAt: new Date()
      });

      return { action: 'created', order: newOrder };
    }

    if (action === 'update') {
      const updatedOrder = await Order.findByIdAndUpdate(
        clientOrder._id,
        clientOrder,
        { new: true }
      );
      return { action: 'updated', order: updatedOrder };
    }

    throw new Error('Invalid sync action');
  }

  // Sync inventory
  async syncInventory(locationId, data) {
    const { inventory: clientInventory, action } = data;

    if (action === 'update') {
      const updatedInventory = await Inventory.Ingredient.findByIdAndUpdate(
        clientInventory._id,
        clientInventory,
        { new: true }
      );
      return { action: 'updated', inventory: updatedInventory };
    }

    throw new Error('Invalid sync action');
  }

  // Sync customer
  async syncCustomer(locationId, data) {
    const { customer: clientCustomer, action } = data;

    if (action === 'create') {
      // Check for conflict by phone/email
      const existingCustomer = await Customer.Customer.findOne({
        locationId,
        $or: [
          { phone: clientCustomer.phone },
          { email: clientCustomer.email }
        ]
      });

      if (existingCustomer) {
        if (this.conflictResolution === 'server-wins') {
          return { resolved: 'server-wins', customer: existingCustomer };
        } else if (this.conflictResolution === 'client-wins') {
          const updatedCustomer = await Customer.Customer.findByIdAndUpdate(
            existingCustomer._id,
            clientCustomer,
            { new: true }
          );
          return { resolved: 'client-wins', customer: updatedCustomer };
        } else {
          return { resolved: 'manual', server: existingCustomer, client: clientCustomer };
        }
      }

      const newCustomer = await Customer.Customer.create({
        ...clientCustomer,
        locationId,
        syncedAt: new Date()
      });

      return { action: 'created', customer: newCustomer };
    }

    if (action === 'update') {
      const updatedCustomer = await Customer.Customer.findByIdAndUpdate(
        clientCustomer._id,
        clientCustomer,
        { new: true }
      );
      return { action: 'updated', customer: updatedCustomer };
    }

    throw new Error('Invalid sync action');
  }

  // Sync menu
  async syncMenu(locationId, data) {
    const { menu: clientMenu, action } = data;

    if (action === 'update') {
      const updatedMenu = await MenuItem.findByIdAndUpdate(
        clientMenu._id,
        clientMenu,
        { new: true }
      );
      return { action: 'updated', menu: updatedMenu };
    }

    throw new Error('Invalid sync action');
  }

  // Get sync status for a location
  getSyncStatus(locationId) {
    const queue = this.syncQueue.get(locationId) || [];
    
    return {
      pending: queue.filter(i => i.status === 'pending').length,
      completed: queue.filter(i => i.status === 'completed').length,
      failed: queue.filter(i => i.status === 'failed').length,
      total: queue.length
    };
  }

  // Retry failed sync items
  async retryFailed(locationId) {
    const queue = this.syncQueue.get(locationId) || [];
    const failedItems = queue.filter(i => i.status === 'failed');
    
    for (const item of failedItems) {
      item.status = 'pending';
      item.attempts = 0;
      item.error = null;
    }

    logger.info(`Retrying ${failedItems.length} failed sync items`);
    
    // Process immediately
    await this.processSyncQueue();

    return failedItems.length;
  }

  // Clear sync queue for a location
  clearQueue(locationId) {
    this.syncQueue.set(locationId, []);
    logger.info(`Cleared sync queue for location ${locationId}`);
  }

  // Set conflict resolution strategy
  setConflictResolution(strategy) {
    if (['server-wins', 'client-wins', 'manual'].includes(strategy)) {
      this.conflictResolution = strategy;
      logger.info(`Conflict resolution set to: ${strategy}`);
      return true;
    }
    return false;
  }
}

module.exports = new SyncService();