import { v4 as uuidv4 } from 'uuid';

export const setupSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Send initial data
    socket.emit('initial-data', {
      menu: global.menuItems,
      orders: global.orders,
      outOfStock: global.outOfStockItems
    });

    // New order from POS
    socket.on('new-order', (orderData) => {
      const newOrder = {
        id: uuidv4(),
        ...orderData,
        status: 'pending',
        timestamp: new Date(),
        timerStart: Date.now(),
        items: orderData.items.map(item => ({
          ...item,
          status: 'pending'
        }))
      };
      
      global.orders.push(newOrder);
      io.emit('order-received', newOrder);
      
      // Notify kitchen with sound/vibration trigger
      socket.broadcast.emit('kitchen-new-order', newOrder);
    });

    // Accept order in kitchen
    socket.on('accept-order', (orderId) => {
      const order = global.orders.find(o => o.id === orderId);
      if (order) {
        order.status = 'accepted';
        order.acceptedAt = new Date();
        io.emit('order-updated', order);
      }
    });

    // Update item status in kitchen
    socket.on('update-item-status', ({ orderId, itemId, status }) => {
      const order = global.orders.find(o => o.id === orderId);
      if (order) {
        const item = order.items.find(i => i.id === itemId);
        if (item) {
          item.status = status;
          item.completedAt = status === 'completed' ? new Date() : null;
          
          // Check if all items completed
          const allCompleted = order.items.every(i => i.status === 'completed');
          if (allCompleted) {
            order.status = 'completed';
          }
          
          io.emit('order-updated', order);
        }
      }
    });

    // Mark item out of stock
    socket.on('mark-out-of-stock', (itemId) => {
      const menuItem = global.menuItems.find(i => i.id === itemId);
      if (menuItem) {
        menuItem.available = false;
        global.outOfStockItems.push(itemId);
        io.emit('item-out-of-stock', itemId);
      }
    });

    // Mark item back in stock
    socket.on('mark-in-stock', (itemId) => {
      const menuItem = global.menuItems.find(i => i.id === itemId);
      if (menuItem) {
        menuItem.available = true;
        global.outOfStockItems = global.outOfStockItems.filter(id => id !== itemId);
        io.emit('item-in-stock', itemId);
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
};