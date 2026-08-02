import { initContract } from "@ts-rest/core";
import { z } from "zod";

const c = initContract();

export const apiContract = c.router({
  login: {
    method: "POST",
    path: "/api/auth/login",
    body: z.object({ email: z.string().email(), password: z.string().min(1) }),
    responses: {
      200: z.object({
        token: z.string(),
        user: z.object({ id: z.string(), email: z.string(), name: z.string() })
      })
    }
  },
  listDatarooms: {
    method: "GET",
    path: "/api/datarooms",
    responses: { 200: z.object({ datarooms: z.array(z.unknown()) }) }
  },
  listItems: {
    method: "GET",
    path: "/api/datarooms/:id/items",
    responses: { 200: z.object({ items: z.array(z.unknown()) }) }
  }
});
