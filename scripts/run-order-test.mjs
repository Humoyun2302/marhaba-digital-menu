import { createServer } from "vite";

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

try {
  await server.ssrLoadModule("./scripts/order-logic.test.ts");
  await server.ssrLoadModule("./scripts/cart-scope.test.ts");
} finally {
  await server.close();
}
