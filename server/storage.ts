import { deployments, type Deployment, type InsertDeployment } from "@shared/schema";

export interface IStorage {
  createDeployment(deployment: InsertDeployment): Promise<Deployment>;
  getDeployment(id: number): Promise<Deployment | undefined>;
  listDeployments(): Promise<Deployment[]>;
}

export class MemStorage implements IStorage {
  private deployments: Map<number, Deployment>;
  private currentId: number;

  constructor() {
    this.deployments = new Map();
    this.currentId = 1;
  }

  async createDeployment(insertDeployment: InsertDeployment): Promise<Deployment> {
    const id = this.currentId++;
    const deployment: Deployment = {
      ...insertDeployment,
      id,
      status: "pending",
      webuiUrl: null,
      error: null,
      createdAt: new Date()
    };
    this.deployments.set(id, deployment);
    return deployment;
  }

  async getDeployment(id: number): Promise<Deployment | undefined> {
    return this.deployments.get(id);
  }

  async listDeployments(): Promise<Deployment[]> {
    return Array.from(this.deployments.values());
  }
}

export const storage = new MemStorage();