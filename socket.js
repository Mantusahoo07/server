export const setupSocketHandlers = (io) => {
  const rooms = {
    kitchen: new Set(),
    pos: new Set(),
    orders: new Set()
  };

  io.on('connection', (socket) => {
    console.log('🟢 Client connected:', socket.id);

    socket.on('join-room', (room) => {
      socket.join(room);
      if (rooms[room]) rooms[room].add(socket.id);
      console.log(`Client ${socket.id} joined ${room}`);
    });

    socket.on('leave-room', (room) => {
      socket.leave(room);
      if (rooms[room]) rooms[room].delete(socket.id);
    });

    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date() });
    });

    socket.on('new-order', (order) => {
      console.log('📦 New order:', order.orderNumber);
      io.emit('new-order-received', order);
      io.to('kitchen').emit('kitchen-new-order', order);
    });

    socket.on('order-updated', (order) => {
      io.emit('order-updated', order);
    });

    socket.on('order-accepted', (orderId) => {
      io.emit('order-accepted', orderId);
    });

    socket.on('order-ready-for-billing', (orderId) => {
      io.emit('order-ready-for-billing', orderId);
    });

    socket.on('order-completed', (orderId) => {
      io.emit('order-completed', orderId);
    });

    socket.on('order-modified', (data) => {
      io.emit('order-modified', data);
    });

    socket.on('order-cancelled', (data) => {
      io.emit('order-cancelled', data);
    });

    socket.on('item-status-updated', (data) => {
      io.emit('item-status-updated', data);
    });

    socket.on('cancellation-requested', (request) => {
      io.emit('cancellation-requested', request);
    });

    socket.on('cancellation-approved', (data) => {
      io.emit('cancellation-approved', data);
    });

    socket.on('cancellation-rejected', (data) => {
      io.emit('cancellation-rejected', data);
    });

    socket.on('instant-order-request', (data) => {
      io.emit('instant-order-request', data);
    });

    socket.on('table-status-changed', (data) => {
      io.emit('table-status-changed', data);
    });

    socket.on('disconnect', () => {
      console.log('🔴 Client disconnected:', socket.id);
      Object.keys(rooms).forEach(room => {
        rooms[room].delete(socket.id);
      });
    });
  });
};