import { WebSocketServer } from "ws";
import type { ViteDevServer } from "vite";
import http from "node:http";

export const webSocketServer = {
  name: "webSocketServer",
  configureServer(server: ViteDevServer) {
    if (!server.httpServer) return;

    const wss = new WebSocketServer({
      server: server.httpServer as http.Server,
    });

    wss.on("connection", (ws: any) => {
      console.log("Client connected");

      ws.on("message", (message: any) => {
        // Broadcast to all other clients
        wss.clients.forEach((client: any) => {
          if (client !== ws && client.readyState === 1) {
            client.send(message);
          }
        });

        // TODO: Apply to server Loro doc
      });

      ws.send(JSON.stringify({ type: "connected" }));
    });
  },
};
