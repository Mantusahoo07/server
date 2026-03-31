import { Server } from 'socket.io';

export const setupSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    console.log('🟢 New client connected:', socket.id);

    // Send initial connection confirmation
    socket.emit('connected', { message: 'Connected to server', socketId: socket.id });

    // Handle new order from POS
    socket.on('new-order', (order) => {
      console.log('📦 New order received via socket:', order.orderNumber);
      // Broadcast to all connected clients (especially kitchen display)
      io.emit('new-order-received', order);
      io.emit('order-updated', order);
    });

    // Handle order acceptance from kitchen
    socket.on('accept-order', (orderId) => {
      console.log('✅ Order accepted:', orderId);
      io.emit('order-accepted', orderId);
    });

    // Handle item status update from kitchen
    socket.on('update-item-status', ({ orderId, itemId, status }) => {
      console.log('📝 Item status updated:', { orderId, itemId, status });
      io.emit('item-status-updated', { orderId, itemId, status });
    });

    // Handle order completion
    socket.on('complete-order', (orderId) => {
      console.log('🎉 Order completed:', orderId);
      io.emit('order-completed', orderId);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('🔴 Client disconnected:', socket.id);
    });
  });
};
