import net from "node:net";

const url = new URL(process.env.DATABASE_URL);
const host = url.hostname;
const port = Number(url.port || 5432);

const socket = net.createConnection({ host, port });
socket.setTimeout(2000);
socket.on("connect", () => {
  socket.destroy();
  process.exit(0);
});
socket.on("timeout", () => {
  socket.destroy();
  process.exit(1);
});
socket.on("error", () => process.exit(1));
