import "dotenv/config";
import { app } from "./server.js";

const port = Number(process.env.PORT ?? 4100);
const host = process.env.HOST ?? "127.0.0.1";

const server = app.listen(port, host, () => {
  console.log(`Market Snap API running on http://${host}:${port}`);
});

server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
