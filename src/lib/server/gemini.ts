import { GoogleGenerativeAI } from "@google/generative-ai";

let proxyDispatcherInitialized = false;

const importUndici = async () => {
  const packageName = "undici";
  return import(packageName) as Promise<typeof import("undici")>;
};

export const ensureGeminiProxyDispatcher = async () => {
  if (proxyDispatcherInitialized) return;

  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;

  if (!proxyUrl || typeof MessagePort === "undefined") {
    proxyDispatcherInitialized = true;
    return;
  }

  try {
    const { ProxyAgent, setGlobalDispatcher } = await importUndici();
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
  } catch (error) {
    console.warn("Failed to initialize proxy dispatcher for Gemini:", error);
  } finally {
    proxyDispatcherInitialized = true;
  }
};

export const getGeminiModelInstance = (params: {
  apiKey: string;
  model: string;
  systemInstruction?: string;
  generationConfig?: Record<string, unknown>;
}) => {
  const genAI = new GoogleGenerativeAI(params.apiKey);

  return genAI.getGenerativeModel({
    model: params.model,
    systemInstruction: params.systemInstruction,
    generationConfig: params.generationConfig,
  });
};

export const formatGeminiErrorMessage = (error: unknown) => {
  const anyError = error as any;
  const baseMessage =
    typeof anyError?.message === "string" && anyError.message
      ? anyError.message
      : "Gemini request failed";
  const details = anyError?.errorDetails;

  if (!details) return baseMessage;

  try {
    const detailText = Array.isArray(details)
      ? JSON.stringify(details)
      : String(details);
    return `${baseMessage} | details: ${detailText}`;
  } catch (stringifyError) {
    return baseMessage;
  }
};
