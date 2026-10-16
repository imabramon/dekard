import { homedir } from "node:os";
import { join } from "node:path";

export const getAppDataDir = (appName: string): string => {
  const home = homedir();
  switch (process.platform) {
    case "win32":
      return join(process.env.LOCALAPPDATA ?? join(home, "AppData", "Local"), appName);
    case "darwin":
      return join(home, "Library", "Application Support", appName);
    default:
      return join(process.env.XDG_DATA_HOME ?? join(home, ".local", "share"), appName);
  }
};
