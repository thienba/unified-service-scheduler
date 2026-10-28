import { createMemoryRepository } from "./memory-repository";
import { describeStoreContract } from "../store-contract";

describeStoreContract("in-memory", async () => createMemoryRepository());
