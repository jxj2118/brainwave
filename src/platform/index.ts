import { isNativeRuntime } from "./native/detect";
import type { Platform } from "./contracts";
export async function createPlatform(): Promise<Platform> {
  return isNativeRuntime()
    ? (await import("./native")).nativePlatform
    : (await import("./web")).webPlatform;
}
