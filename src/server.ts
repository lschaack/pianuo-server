import WebSocket, { WebSocketServer } from 'ws';

const SEPARATOR = '|';

// Keep track of both for speed in both directions
// there's probably a more memory-efficient way to do this...
const idToClient: Record<string, WebSocket.WebSocket[]> = {};
const clientToId: Map<WebSocket.WebSocket, string> = new Map();
const wss = new WebSocketServer({ port: 8080 });

type MessageHandler = (input: string) => void;
type TrieNode = {
  letter: string;
  handler?: MessageHandler;
  next: Record<string, TrieNode>;
};

class MessageTrie {
  private static START = '^';
  private static END = '$';

  start: TrieNode;

  constructor(initHandlers: Array<[ string, MessageHandler ]>) {
    this.start = {
      letter: MessageTrie.START,
      next: {},
    }

    for (let args of initHandlers) this.registerMessageHandler.apply(this, args);
  }

  // TODO: skip to handler as soon as there are no more alternatives
  handleMessage(message: string) {
    const [ key, value ] = message.split(SEPARATOR);
    let currNode = this.start;

    for (let letter of key.split('')) {
      if (currNode) currNode = currNode?.next[letter];
      else break;
    }

    const endNode = currNode?.next[MessageTrie.END];

    return endNode?.handler?.(value);
  }

  registerMessageHandler(key: string, handler: (input: string) => void) {
    let currNode = this.start;

    for (let letter of key.split('')) {
      if (!currNode.next[letter]) {
        currNode.next[letter] = {
          letter,
          next: {},
        };
      }

      currNode = currNode.next[letter];
    }

    if (currNode.next[MessageTrie.END]) {
      throw new Error(`handler already defined for message key '${key}'`);
    }

    currNode.next[MessageTrie.END] = {
      handler,
      letter: MessageTrie.END,
      next: {},
    }
  }
}

// TODO: implement a sort of trie for the message router
// add messages as a tuple w/message and handler
// trace message down trie, ending node should always be handler
// end as soon as message is differentiated, so w/:
// - [ 'release', releaseHandler ]
// - [ 'removeId', removeIdHandler ]
// wind up w/:
// r --> e --> l --> releaseHandler
//         \-> m --> removeIdHandler

wss.on('connection', ws => {
  console.log('connected to new client');

  // Broadcast message to all connected clients
  ws.on('message', data => {
    const stringified = data.toString('utf-8');
    console.log('received data', stringified);

    // Add/remove ids as they come in
    if (stringified.startsWith('setId')) {
      const id = stringified.split(SEPARATOR)[1];

      if (!idToClient[id]) idToClient[id] = [];
      idToClient[id].push(ws);

      clientToId.set(ws, id);
      ws.send(`idIsSet${SEPARATOR}${id}`);
    } else if (stringified.startsWith('removeId')) {
      const id = stringified.split(SEPARATOR)[1];
      const clientIndex = idToClient[id]?.findIndex(client => client === ws);
      if (clientIndex > -1) idToClient[id].splice(clientIndex, 1);

      clientToId.delete(ws);
      ws.send(`idIsRemoved${SEPARATOR}${id}`);
    } else {
      // Forward all other (press/release) messages to clients with the same id
      const id = clientToId.get(ws);

      if (id) {
        const sharedIdClients = idToClient[id];

        sharedIdClients.forEach(client => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(stringified);
          }
        });
      }
    }

  });

  ws.on('close', () => {
    console.log('connection closed');
  });
});

console.log('ready!');
