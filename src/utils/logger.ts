let verboseEnabled = false;

export function setVerbose(enabled: boolean): void {
  verboseEnabled = enabled;
}

export function isVerbose(): boolean {
  return verboseEnabled;
}

export function debug(message: string, ...args: unknown[]): void {
  if (verboseEnabled) {
    const timestamp = new Date().toISOString();
    console.log(`[DEBUG ${timestamp}] ${message}`, ...args);
  }
}

export function debugObject(label: string, obj: unknown): void {
  if (verboseEnabled) {
    const timestamp = new Date().toISOString();
    console.log(`[DEBUG ${timestamp}] ${label}:`);
    console.log(JSON.stringify(obj, null, 2));
  }
}

export function info(message: string, ...args: unknown[]): void {
  if (verboseEnabled) {
    console.log(`[INFO] ${message}`, ...args);
  }
}
