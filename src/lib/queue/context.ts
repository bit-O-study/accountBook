import { AsyncLocalStorage } from "node:async_hooks";
import { queueEnabled } from "./config";

const context = new AsyncLocalStorage<boolean>();
export const shouldEnqueue = () => queueEnabled() && !context.getStore();
export const runInWorker = <T>(run: () => Promise<T>) => context.run(true, run);
