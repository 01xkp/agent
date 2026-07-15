import { contextBridge } from "electron";

const prefix = "--csfan-api-base=";
const apiArgument = process.argv.find((value) => value.startsWith(prefix));
const apiBaseUrl = apiArgument?.slice(prefix.length) ?? "";

contextBridge.exposeInMainWorld("desktop", {
  apiBaseUrl,
  isElectron: true,
});
