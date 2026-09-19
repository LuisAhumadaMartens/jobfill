export interface TextItem {
  str?: string;
  width?: number;
  hasEOL?: boolean;
  transform?: number[];
}

export interface TextContent {
  items: TextItem[];
}

export interface PDFPageProxy {
  getTextContent(): Promise<TextContent>;
  cleanup(): void;
}

export interface PDFDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PDFPageProxy>;
  destroy(): Promise<void>;
}

export interface GetDocumentOptions {
  data: Uint8Array;
  disableFontFace?: boolean;
  isEvalSupported?: boolean;
  useSystemFonts?: boolean;
}

export const GlobalWorkerOptions: { workerSrc: string };

export function getDocument(options: GetDocumentOptions): { promise: Promise<PDFDocumentProxy> };
