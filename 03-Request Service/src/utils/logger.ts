/**
 * Logger utility for consistent logging across the application
 */
class Logger {
  // Standard log levels
  static info(message: string, ...args: any[]) {
    console.log(`[INFO] ${message}`, ...args);
  }

  static warn(message: string, ...args: any[]) {
    console.warn(`[WARNING] ${message}`, ...args);
  }

  static error(message: string, ...args: any[]) {
    console.error(`[ERROR] ${message}`, ...args);
  }

  // Request-specific logging
  static request = {
    start: (host: string, path: string) => {
      Logger.info(`Serving request from ${host}: ${path}`);
    },
    success: (host: string, path: string, timeMs: number) => {
      Logger.info(`Successfully served ${path} to ${host} in ${timeMs}ms`);
    },
    error: (host: string, path: string, error: any) => {
      Logger.error(`Failed to serve ${path} to ${host}: ${error}`);
    }
  };

  // Format bytes to a human-readable string (for file sizes)
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
  }
}

export default Logger;
