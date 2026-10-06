import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';

let io: SocketIOServer;

export const initSocket = (server: HTTPServer) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`🔌 [Socket.io]: Client connected ID: ${socket.id}`);

    socket.on('join_business', (businessId: string) => {
      socket.join(`business_${businessId}`);
      console.log(`🏢 [Socket.io]: Joined business room -> business_${businessId}`);
    });

    socket.on('disconnect', () => {
      console.log(`❌ [Socket.io]: Client disconnected ID: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = (): SocketIOServer => {
  if (!io) {
    throw new Error('Socket.io is not initialized');
  }
  return io;
};