import WebSocket, { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', ws => {
  console.log('connected to new client');

  // Broadcast message to all connected clients
  ws.on('message', data => {
    console.log('received data', data.toString('utf-8'));

    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    });
  });

  ws.on('close', () => {
    console.log('connection closed');
  })
});

console.log('ready!');
