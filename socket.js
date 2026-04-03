import { Server } from 'socket.io';

let io = null;
const connectedClients = new Map();

export const setupSocketHandlers = (socketIO) => {
  io = socketIO;
  
  // Track active rooms/connections
  const rooms = {
    kitchen: new Set(),
    pos: new Set(),
    orders: new Set()
  };
  
  io.on('connection', (socket) => {
    console.log('🟢 New client connected:', socket.id);
    console.log('Total connections:', io.sockets.sockets.size);
    
    // Store client info
    connectedClients.set(socket.id, {
      connectedAt: new Date(),
      lastActivity: new Date()
    });
    
    // Send initial connection confirmation with server time
    socket.emit('connected', { 
      message: 'Connected to server', 
      socketId: socket.id,
      timestamp: new Date(),
      serverTime: new Date().toISOString()
    });
    
    // Handle client joining rooms
    socket.on('join-room', (room) => {
      socket.join(room);
      if (rooms[room]) {
        rooms[room].add(socket.id);
      }
      console.log(`Client ${socket.id} joined room: ${room}`);
      socket.emit('joined-room', { room, success: true });
    });
    
    socket.on('leave-room', (room) => {
      socket.leave(room);
      if (rooms[room]) {
        rooms[room].delete(socket.id);
      }
      console.log(`Client ${socket.id} left room: ${room}`);
    });
    
    // Heartbeat to keep connection alive
    socket.on('ping', () => {
      const client = connectedClients.get(socket.id);
      if (client) {
        client.lastActivity = new Date();
      }
      socket.emit('pong', { timestamp: new Date() });
    });
    
    // Handle new order from POS
    socket.on('new-order', (order) => {
      console.log('📦 New order received via socket:', order.orderNumber);
      // Broadcast to all connected clients (especially kitchen display)
      io.emit('new-order-received', order);
      io.emit('order-updated', order);
      
      // Also emit to specific rooms
      io.to('kitchen').emit('kitchen-new-order', order);
      io.to('orders').emit('orders-updated', order);
    });
    
    // Handle order acceptance from kitchen
    socket.on('accept-order', (orderId) => {
      console.log('✅ Order accepted:', orderId);
      io.emit('order-accepted', orderId);
      io.to('pos').emit('order-status-changed', { orderId, status: 'accepted' });
    });
    
    // Handle order ready for billing
    socket.on('order-ready-for-billing', (orderId) => {
      console.log('💰 Order ready for billing:', orderId);
      io.emit('order-ready-for-billing', orderId);
      io.to('pos').emit('order-status-changed', { orderId, status: 'ready_for_billing' });
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
    
    // Handle order updates
    socket.on('order-updated', (updatedOrder) => {
      console.log('📝 Order updated:', updatedOrder.orderNumber);
      io.emit('order-updated', updatedOrder);
    });
    
    // Handle inventory updates
    socket.on('mark-out-of-stock', (itemId) => {
      console.log('📦 Item out of stock:', itemId);
      io.emit('item-out-of-stock', itemId);
    });
    
    socket.on('mark-in-stock', (itemId) => {
      console.log('📦 Item back in stock:', itemId);
      io.emit('item-in-stock', itemId);
    });
    
    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log('🔴 Client disconnected:', socket.id, 'Reason:', reason);
      connectedClients.delete(socket.id);
      
      // Remove from all rooms
      Object.keys(rooms).forEach(room => {
        rooms[room].delete(socket.id);
      });
    });
    
    // Handle errors
    socket.on('error', (error) => {
      console.error('Socket error for client', socket.id, ':', error);
    });
  });
  
  // Periodic cleanup of stale connections (every 5 minutes)
  setInterval(() => {
    const now = new Date();
    connectedClients.forEach((client, id) => {
      const idleTime = now - client.lastActivity;
      if (idleTime > 10 * 60 * 1000) { // 10 minutes idle
        const socket = io.sockets.sockets.get(id);
        if (socket) {
          console.log('Disconnecting idle client:', id);
          socket.disconnect(true);
        }
        connectedClients.delete(id);
      }
    });
  }, 5 * 60 * 1000);
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
};

export const getConnectedCount = () => {
  return connectedClients.size;
};
