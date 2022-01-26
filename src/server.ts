import WebSocket, { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', ws => {
  console.log('connected to new client');

  // Broadcast message to all connected clients
  ws.on('message', data => {
    const stringified = data.toString('utf-8');
    console.log('received data', stringified);

    wss.clients.forEach(client => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(stringified);
      }
    });
  });

  ws.on('close', () => {
    console.log('connection closed');
  });
});

console.log('ready!');
