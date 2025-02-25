import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { SpheronSDK } from "@spheron/protocol-sdk";
import { insertDeploymentSchema } from "@shared/schema";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const PRIVATE_KEY = process.env.SPHERON_PRIVATE_KEY;
const PROVIDER_PROXY_URL = "https://provider-proxy.spheron.network";

if (!PRIVATE_KEY) {
  throw new Error("SPHERON_PRIVATE_KEY environment variable is required");
}

// Initialize SDK with testnet network explicitly
const sdk = new SpheronSDK("testnet", PRIVATE_KEY);

export async function registerRoutes(app: Express): Promise<Server> {
  // Get CST balance from escrow
  app.get("/api/balance", async (req, res) => {
    try {
      const balance = await sdk.escrow.getUserBalance("CST");
      res.json(balance);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Create new deployment
  app.post("/api/deployments", async (req, res) => {
    try {
      const parsed = insertDeploymentSchema.parse(req.body);

      // Check balance first
      const balance = await sdk.escrow.getUserBalance("CST");
      if (!balance || parseFloat(balance.unlockedBalance) <= 0) {
        throw new Error("Insufficient CST balance in escrow");
      }

      // Create deployment using SDK
      const deployment = await sdk.deployment.createDeployment(
        parsed.iclConfig,
        PROVIDER_PROXY_URL
      );

      // Store deployment info without passing status
      const stored = await storage.createDeployment(parsed);

      res.json(stored);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}