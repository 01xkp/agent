/// <reference types="vite/client" />

interface DesktopBridge {
  apiBaseUrl: string;
  isElectron: boolean;
}

interface Window {
  desktop?: DesktopBridge;
}

declare module "mammoth/mammoth.browser" {
  interface MammothMessage {
    message: string;
    type: string;
  }

  interface MammothResult {
    messages: MammothMessage[];
    value: string;
  }

  interface MammothOptions {
    styleMap?: string[];
  }

  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer },
    options?: MammothOptions,
  ): Promise<MammothResult>;
}
