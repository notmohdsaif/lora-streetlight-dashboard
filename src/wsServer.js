const { WebSocketServer } = require('ws');

function createWsServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer });

  function broadcast(payload) {
    const msg = JSON.stringify(payload);
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(msg);
      }
    });
  }

  return { wss, broadcast };
}

module.exports = { createWsServer };
