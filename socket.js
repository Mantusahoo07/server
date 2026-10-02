import { Server } from 'socket.io';

let io = null;
const connectedClients = new Map();

// In-memory registry of devices sending heartbeats.
// Key: deviceId (or socket.id fallback) → { role, username, ts, socketId }
const onlineDevices = new Map();

export const setupSocketHandlers = (socketIO) => {
  io = socketIO;

  const rooms = {
    kitchen: new Set(),
    pos: new Set(),
    orders: new Set()
  };

  io.on('connection', (socket) => {
    console.log('🟢 New client connected:', socket.id, 'Total:', io.sockets.sockets.size);

    connectedClients.set(socket.id, {
      connectedAt: new Date(),
      lastActivity: new Date()
    });

    socket.emit('connected', {
      message: 'Connected to server',
      socketId: socket.id,
      timestamp: new Date(),
      serverTime: new Date().toISOString()
    });

    socket.on('join-room', (room) => {
      socket.join(room);
      if (rooms[room]) rooms[room].add(socket.id);
      console.log(`Client ${socket.id} joined room: ${room}`);
      socket.emit('joined-room', { room, success: true });
    });

    socket.on('leave-room', (room) => {
      socket.leave(room);
      if (rooms[room]) rooms[room].delete(socket.id);
    });

    // ------------------ HEARTBEAT ------------------
    // Client sends this every 1s. We ack immediately and mark them online.
    socket.on('heartbeat', (payload = {}) => {
      const now = Date.now();
      const deviceId = payload.deviceId || socket.id;
      const entry = {
        deviceId,
        role: payload.role || 'unknown',
        username: payload.username || null,
        socketId: socket.id,
        ts: now
      };
      onlineDevices.set(deviceId, entry);
      connectedClients.get(socket.id) && (connectedClients.get(socket.id).lastActivity = new Date());
      // Ack with server time so client can measure round-trip
      socket.emit('heartbeat-ack', { ts: now, deviceId });
    });

    // ------------------ EXISTING ORDER EVENTS ------------------
    socket.on('new-order', (order) => {
      io.emit('new-order-received', order);
      io.emit('order-updated', order);
      io.to('kitchen').emit('kitchen-new-order', order);
      io.to('orders').emit('orders-updated', order);
    });

    socket.on('accept-order', (orderId) => {
      io.emit('order-accepted', orderId);
      io.to('pos').emit('order-status-changed', { orderId, status: 'accepted' });
    });

    socket.on('order-ready-for-billing', (orderId) => {
      io.emit('order-ready-for-billing', orderId);
      io.to('pos').emit('order-status-changed', { orderId, status: 'ready_for_billing' });
    });

    socket.on('update-item-status', ({ orderId, itemId, status }) => {
      io.emit('item-status-updated', { orderId, itemId, status });
    });

    socket.on('complete-order', (orderId) => io.emit('order-completed', orderId));

    socket.on('order-updated', (updatedOrder) => io.emit('order-updated', updatedOrder));

    socket.on('mark-out-of-stock', (itemId) => io.emit('item-out-of-stock', itemId));
    socket.on('mark-in-stock', (itemId) => io.emit('item-in-stock', itemId));

    socket.on('disconnect', (reason) => {
      console.log('🔴 Client disconnected:', socket.id, 'Reason:', reason);
      connectedClients.delete(socket.id);
      // Remove any onlineDevices tied to this socket
      for (const [k, v] of onlineDevices.entries()) {
        if (v.socketId === socket.id) onlineDevices.delete(k);
      }
      Object.keys(rooms).forEach(r => rooms[r].delete(socket.id));
    });

    socket.on('error', (error) => {
      console.error('Socket error for', socket.id, ':', error);
    });
  });

  // Cleanup stale devices (>10s without heartbeat) — every 5s
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of onlineDevices.entries()) {
      if (now - v.ts > 10_000) onlineDevices.delete(k);
    }
  }, 5_000);

  // Cleanup idle connections — every 5 min (existing behavior)
  setInterval(() => {
    const now = new Date();
    connectedClients.forEach((client, id) => {
      const idleTime = now - client.lastActivity;
      if (idleTime > 10 * 60 * 1000) {
        const s = io.sockets.sockets.get(id);
        if (s) s.disconnect(true);
        connectedClients.delete(id);
      }
    });
  }, 5 * 60 * 1000);
};

export const getIO = () => {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
};

export const getConnectedCount = () => connectedClients.size;

export const getOnlineDevices = () => {
  const now = Date.now();
  return Array.from(onlineDevices.values())
    .filter(v => now - v.ts < 10_000)   // only fresh
    .map(v => ({ deviceId: v.deviceId, role: v.role, username: v.username, lastSeenMsAgo: now - v.ts }));
};
