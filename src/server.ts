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
const forwardToConnectedClients = (client: WebSocket, key: string, value: string) => {
  const id = clientToId.get(client);

  if (id) {
    const sharedIdClients = idToClient[id];

    sharedIdClients.forEach(connectedClient => {
      if (connectedClient !== client && connectedClient.readyState === WebSocket.OPEN) {
        // TODO: avoid reconstructing message
        connectedClient.send(`${key}${SEPARATOR}${value}`);
      }
    });
  }
}

const getInitHandlers = (client: WebSocket): Array<[ string, MessageHandler ]> => [
  [
    'setId',
    id => {
      if (!idToClient[id]) idToClient[id] = [];
      idToClient[id].push(client);

      clientToId.set(client, id);
      console.log(`set client id '${id}'`);

      client.send(`idIsSet${SEPARATOR}${id}`);
    }
  ],
  [
    'removeId',
    id => {
      const clientIndex = idToClient[id]?.findIndex(clientWithId => clientWithId === client);
      if (clientIndex > -1) idToClient[id].splice(clientIndex, 1);

      clientToId.delete(client);
      console.log(`removed client id '${id}'`);

      client.send(`idIsRemoved${SEPARATOR}${id}`);
    }
  ],
  [
    'press',
    key => forwardToConnectedClients(client, 'press', key)
  ],
  [
    'release',
    key => forwardToConnectedClients(client, 'release', key)
  ]
];

wss.on('connection', ws => {
  console.log('connected to new client');

  const MessageHandler = new MessageTrie(getInitHandlers(ws));

  // Broadcast message to all connected clients
  ws.on(
    'message',
    data => MessageHandler.handleMessage(data.toString('utf-8'))
  );

  ws.on('close', () => {
    console.log('connection closed');
  });
});

console.log('ready!');
