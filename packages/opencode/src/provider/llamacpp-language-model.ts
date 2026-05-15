import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
  LanguageModelV3StreamPart,
  LanguageModelV3Message,
  LanguageModelV3FinishReason,
  LanguageModelV3Usage,
} from "@ai-sdk/provider"

export type LlamacppOptions = {
  modelPath: string
  gpuLayers?: number
  contextSize?: number
  batchSize?: number
  flashAttention?: boolean
  seed?: number
  repeatPenalty?: number
  topK?: number
  temperature?: number
  topP?: number
  maxTokens?: number
  presencePenalty?: number
  frequencyPenalty?: number
}

type LlamaChatMessage = { type: "system" | "user" | "model"; text?: string; response?: string[] }

function convertMessages(messages: LanguageModelV3Message[]): LlamaChatMessage[] {
  const history: LlamaChatMessage[] = []
  for (const msg of messages) {
    switch (msg.role) {
      case "system":
        history.push({ type: "system", text: msg.content })
        break
      case "user": {
        const text = msg.content.map((p) => (p.type === "text" ? p.text : "[file]")).join("")
        history.push({ type: "user", text })
        break
      }
      case "assistant": {
        const textParts: string[] = []
        for (const p of msg.content) {
          if (p.type === "text") {
            textParts.push(p.text)
          } else if (p.type === "tool-call") {
            const toolCalls = p.calls.map((call) => {
              const argsStr = JSON.stringify(call.args)
              return `<function name="${call.name}">${argsStr}</function>`
            }).join("\n")
            textParts.push(toolCalls)
          }
        }
        const text = textParts.join("\n")
        history.push({ type: "model", response: [text] })
        break
      }
      case "tool": {
        const resultText = msg.result 
          ? `<function name="${msg.name}" result="true">${JSON.stringify(msg.result)}</function>`
          : `<function name="${msg.name}" result="false">${msg.error || "error"}</function>`
        history.push({ type: "user", text: resultText })
        break
      }
    }
  }
  return history
}

function buildToolPrompt(tools: LanguageModelV3CallOptions["tools"]): string {
  if (!tools || tools.length === 0) return ""
  
  const toolList = tools
    .filter((tool) => tool.type !== "provider")
    .map((tool) => {
      const params = tool.parameters?.parameters
        ? Object.entries(tool.parameters.parameters.properties || {})
            .map(([key, val]: [string, any]) => `${key}: ${val.description || val.type || 'any'}`)
            .join(", ")
        : "no parameters"
      return `- **${tool.name}**(${params}): ${tool.description}`
    })
    .join("\n")
  
  const examples = `
## 使用示例:

用户: 帮我看看README.md文件的内容
助手: <function name="Read">{"filePath": "README.md"}</function>

用户: 列出src目录下所有的文件
助手: <function name="Glob">{"pattern": "src/**/*"}</function>

用户: 搜索src文件夹中包含"function main"的代码
助手: <function name="Grep">{"pattern": "function main", "path": "src"}</function>

用户: 查看当前git状态
助手: <function name="Bash">{"command": "git status"}</function>

用户: 帮我搜索这个项目中所有包含"class"的Python文件
助手: <function name="Grep">{"pattern": "class ", "path": ".", "glob": "*.py"}</function>

用户: 运行npm install命令
助手: <function name="Bash">{"command": "npm install"}</function>

用户: 列出当前目录下所有的TypeScript文件
助手: <function name="Glob">{"pattern": "**/*.ts"}</function>

## 重要规则:
1. 必须严格按照上述格式输出工具调用
2. JSON字符串必须使用双引号
3. 如果不需要使用工具，直接正常回复
4. 每次回复只调用一个工具
5. 工具调用格式: <function name="工具名称">{"参数": "值"}</function>`

  return `## 可用工具:
${toolList}
${examples}`
}

function parseToolCalls(text: string): Array<{ name: string; args: Record<string, unknown> }> {
  const regex = /<function name="([^"]+)">([^<]+)<\/function>/g
  const matches: Array<{ name: string; args: Record<string, unknown> }> = []
  let match
  
  while ((match = regex.exec(text)) !== null) {
    try {
      const args = JSON.parse(match[2])
      matches.push({ name: match[1], args })
    } catch {
      continue
    }
  }
  
  return matches
}

export class LlamacppLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = "v3" as const
  readonly provider = "llamacpp"
  readonly modelId: string
  readonly supportedUrls: Record<string, RegExp[]> = {}

  private opts: LlamacppOptions
  private static modelCache = new Map<string, { llama: any; model: any }>()

  constructor(modelId: string, opts: LlamacppOptions) {
    this.modelId = modelId
    this.opts = opts
  }

  static clearModelCache() {
    LlamacppLanguageModel.modelCache.clear()
  }

  private async getOrLoadModel() {
    const cached = LlamacppLanguageModel.modelCache.get(this.opts.modelPath)
    if (cached) return cached
    const { getLlama } = await import("node-llama-cpp")
    const llama = await getLlama()
    const model = await llama.loadModel({
      modelPath: this.opts.modelPath,
      gpuLayers: this.opts.gpuLayers ?? 99,
    })
    const entry = { llama, model }
    LlamacppLanguageModel.modelCache.set(this.opts.modelPath, entry)
    return entry
  }

  async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
    console.log("[LlamacppLanguageModel] doGenerate called with tools:", options.tools ? Object.keys(options.tools) : "none")
    const { LlamaChat } = await import("node-llama-cpp")
    const { model } = await this.getOrLoadModel()
    const context = await model.createContext({
      contextSize: this.opts.contextSize ?? 8192,
      batchSize: this.opts.batchSize ?? 512,
      flashAttention: this.opts.flashAttention ?? true,
    })
    const sequence = context.getSequence()
    const chat = new LlamaChat({ contextSequence: sequence, chatWrapper: "auto" })
    
    const toolPrompt = buildToolPrompt(options.tools)
    console.log("[LlamacppLanguageModel] Tool prompt generated:", toolPrompt ? "yes" : "no")
    const history = convertMessages(options.prompt)
    
    if (toolPrompt && history.length > 0 && history[0].type === "system") {
      history[0].text = (history[0].text || "") + "\n\n" + toolPrompt
    } else if (toolPrompt) {
      history.unshift({ type: "system", text: toolPrompt })
    }
    
    const generationConfig = {
      temperature: this.opts.temperature ?? 0.2,
      maxTokens: this.opts.maxTokens ?? 2048,
      topP: this.opts.topP ?? 0.95,
      topK: this.opts.topK ?? 40,
      repeatPenalty: this.opts.repeatPenalty ?? 1.05,
      seed: this.opts.seed,
    }
    
    const fullPrompt = history.map((msg) => {
      switch (msg.type) {
        case "system":
          return `[system]\n${msg.text}`
        case "user":
          return `[user]\n${msg.text}`
        case "model":
          return `[model]\n${msg.response}`
      }
    }).join("\n")
    
    const result = await chat.generateResponse(history, {
      ...generationConfig,
      maxTokens: options.maxOutputTokens ?? 2048,
      signal: options.abortSignal,
    })
    
    const toolCalls = parseToolCalls(result.response)
    
    const content = toolCalls.length > 0 
      ? [{ 
          type: "tool-call" as const, 
          calls: toolCalls.map((call, index) => ({
            id: `call_${index}`,
            name: call.name,
            args: call.args,
          }))
        }]
      : [{ type: "text" as const, text: result.response }]
    
    const usage: LanguageModelV3Usage = {
      inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: undefined, text: undefined, reasoning: undefined },
    }
    
    const finishReason: LanguageModelV3FinishReason = toolCalls.length > 0 
      ? { unified: "tool-calls", raw: "tool-calls" }
      : { unified: "stop", raw: convertStopReason(result.metadata.stopReason) }
    
    return {
      content,
      finishReason,
      usage,
      warnings: [],
    }
  }

  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    const abortController = new AbortController()
    const signal = options.abortSignal
    if (signal) {
      signal.addEventListener("abort", () => {
        console.log("[LlamacppLanguageModel] Abort signal received")
        abortController.abort()
      }, { once: true })
    }
    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      start: async (controller) => {
        try {
          const { LlamaChat } = await import("node-llama-cpp")
          const { model } = await this.getOrLoadModel()
          const context = await model.createContext({
            contextSize: this.opts.contextSize ?? 8192,
            batchSize: this.opts.batchSize ?? 512,
            flashAttention: this.opts.flashAttention ?? true,
          })
          const sequence = context.getSequence()
          const chat = new LlamaChat({ contextSequence: sequence, chatWrapper: "auto" })
          
          const toolPrompt = buildToolPrompt(options.tools)
          const history = convertMessages(options.prompt)
          
          if (toolPrompt && history.length > 0 && history[0].type === "system") {
            history[0].text = (history[0].text || "") + "\n\n" + toolPrompt
          } else if (toolPrompt) {
            history.unshift({ type: "system", text: toolPrompt })
          }
          
          controller.enqueue({ type: "stream-start", warnings: [] })
          controller.enqueue({
            type: "response-metadata",
            id: crypto.randomUUID(),
            timestamp: new Date(),
            modelId: this.modelId,
          })
          const textId = crypto.randomUUID()
          controller.enqueue({ type: "text-start", id: textId })
          let fullText = ""
          let wasAborted = false
          
          try {
            await chat.generateResponse(history, {
              temperature: options.temperature ?? 0.2,
              topP: options.topP ?? 0.95,
              topK: options.topK ?? this.opts.topK ?? 40,
              repeatPenalty: this.opts.repeatPenalty ?? 1.05,
              maxTokens: options.maxOutputTokens ?? 2048,
              signal: abortController.signal,
              onTextChunk: (text: string) => {
                fullText += text
                controller.enqueue({ type: "text-delta", id: textId, delta: text })
              },
            })
          } catch (err) {
            if (abortController.signal.aborted) {
              wasAborted = true
              console.log("[LlamacppLanguageModel] Generation aborted by user")
            } else {
              throw err
            }
          }
          
          controller.enqueue({ type: "text-end", id: textId })
          
          const toolCalls = parseToolCalls(fullText)
          const finishReason = toolCalls.length > 0 
            ? "tool-calls" as const
            : "stop" as const
          
          controller.enqueue({
            type: "finish",
            usage: {
              inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
              outputTokens: { total: undefined, text: undefined, reasoning: undefined },
            },
            finishReason: { unified: finishReason, raw: finishReason },
          })
        } catch (err) {
          if (abortController.signal.aborted) return
          controller.enqueue({ type: "error", error: err })
        } finally {
          controller.close()
        }
      },
      cancel() {
        abortController.abort()
      },
    })
    return { stream }
  }
}

function convertStopReason(reason: string): string {
  switch (reason) {
    case "eogToken":
      return "stop"
    case "maxTokens":
      return "length"
    case "abort":
      return "abort"
    default:
      return reason
  }
}