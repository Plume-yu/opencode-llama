import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@opencode-ai/ui/toast"
import { useMutation } from "@tanstack/solid-query"
import { createStore } from "solid-js/store"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { DialogSelectProvider } from "./dialog-select-provider"
import { Switch } from "@opencode-ai/ui/switch"

type FormErrors = Partial<Record<"modelID" | "name" | "gguf", string>>

type FormState = {
  modelID: string
  name: string
  gguf: string
  contextSize: string
  gpuLayers: string
  temperature: string
  topP: string
  topK: string
  repeatPenalty: string
  flashAttention: boolean
  err: FormErrors
}

export function DialogLlamacppConfig() {
  const dialog = useDialog()
  const globalSync = useGlobalSync()
  const globalSDK = useGlobalSDK()
  const language = useLanguage()
  const platform = usePlatform()

  const browseGGUF = async () => {
    if (!platform.openFilePickerDialog) return
    const result = await platform.openFilePickerDialog({
      extensions: ["gguf"],
      title: language.t("provider.llamacpp.field.gguf.browse"),
    })
    if (!result) return
    const path = Array.isArray(result) ? result[0] : result
    setField("gguf", path)
    if (!form.modelID.trim()) {
      const name = path.split(/[\\/]/).pop()?.replace(/\.gguf$/i, "") ?? ""
      setField("modelID", name)
      if (!form.name.trim()) {
        setField("name", name.replace(/[-_]/g, " "))
      }
    }
  }

  const [form, setForm] = createStore<FormState>({
    modelID: "",
    name: "",
    gguf: "",
    contextSize: "8192",
    gpuLayers: "99",
    temperature: "0.2",
    topP: "0.95",
    topK: "40",
    repeatPenalty: "1.05",
    flashAttention: true,
    err: {},
  })

  const goBack = () => {
    dialog.show(() => <DialogSelectProvider />)
  }

  const setField = (key: keyof Omit<FormState, "err">, value: string | boolean) => {
    setForm(key, value)
    setForm("err", key as keyof FormErrors, undefined)
  }

  const validate = () => {
    const err: FormErrors = {}
    if (!form.modelID.trim()) err.modelID = language.t("provider.llamacpp.error.modelID.required")
    if (!form.name.trim()) err.name = language.t("provider.llamacpp.error.name.required")
    if (!form.gguf.trim()) err.gguf = language.t("provider.llamacpp.error.gguf.required")
    setForm("err", err)
    return Object.keys(err).length === 0
  }

  const saveMutation = useMutation(() => ({
    mutationFn: async () => {
      const providerID = "llamacpp"
      const modelID = form.modelID.trim()
      const configPayload = {
        name: "LlamaCpp",
        [providerID]: {
          name: "LlamaCpp",
          models: {
            [modelID]: {
              id: modelID,
              name: form.name.trim(),
              options: {
                GGUF: form.gguf.trim(),
                contextSize: parseInt(form.contextSize) || 8192,
                gpuLayers: parseInt(form.gpuLayers) || 99,
                temperature: parseFloat(form.temperature) || 0.2,
                topP: parseFloat(form.topP) || 0.95,
                topK: parseInt(form.topK) || 40,
                repeatPenalty: parseFloat(form.repeatPenalty) || 1.05,
                flashAttention: form.flashAttention,
              },
            },
          },
        },
      }
      const disabledProviders = globalSync.data.config.disabled_providers ?? []
      const nextDisabled = disabledProviders.filter((id) => id !== providerID)

      await globalSync.updateConfig({
        provider: { [providerID]: configPayload[providerID] },
        disabled_providers: nextDisabled,
      })
    },
    onSuccess: () => {
      dialog.close()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("provider.connect.toast.connected.title", { provider: "LlamaCpp" }),
        description: language.t("provider.connect.toast.connected.description", { provider: "LlamaCpp" }),
      })
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
    },
  }))

  const save = (e: SubmitEvent) => {
    e.preventDefault()
    if (saveMutation.isPending) return
    if (!validate()) return
    saveMutation.mutate()
  }

  return (
    <Dialog
      title={
        <button
          type="button"
          class="icon-button icon-button--variant-ghost"
          tabIndex={-1}
          onClick={goBack}
          aria-label={language.t("common.goBack")}
        >
          <svg class="icon icon-strong-base" viewBox="0 0 16 16">
            <path d="M7 3L2 8L7 13" stroke="currentColor" stroke-width="1.5" fill="none" />
            <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </button>
      }
      transition
    >
      <div class="flex flex-col gap-6 px-2.5 pb-3 overflow-y-auto max-h-[70vh]">
        <div class="px-2.5 flex gap-4 items-center">
          <ProviderIcon id="llamacpp" class="size-5 shrink-0 icon-strong-base" />
          <div class="text-16-medium text-text-strong">{language.t("provider.llamacpp.title")}</div>
        </div>

        <form onSubmit={save} class="px-2.5 pb-6 flex flex-col gap-6">
          <p class="text-14-regular text-text-base">
            {language.t("dialog.provider.llamacpp.note")}
          </p>

          <div class="flex flex-col gap-4">
            <TextField
              autofocus
              label={language.t("provider.llamacpp.field.modelID.label")}
              placeholder={language.t("provider.llamacpp.field.modelID.placeholder")}
              value={form.modelID}
              onChange={(v) => setField("modelID", v)}
              validationState={form.err.modelID ? "invalid" : undefined}
              error={form.err.modelID}
            />
            <TextField
              label={language.t("provider.llamacpp.field.name.label")}
              placeholder={language.t("provider.llamacpp.field.name.placeholder")}
              value={form.name}
              onChange={(v) => setField("name", v)}
              validationState={form.err.name ? "invalid" : undefined}
              error={form.err.name}
            />
            <div class="flex items-end gap-2">
              <div class="flex-1">
                <TextField
                  label={language.t("provider.llamacpp.field.gguf.label")}
                  placeholder={language.t("provider.llamacpp.field.gguf.placeholder")}
                  description={language.t("provider.llamacpp.field.gguf.description")}
                  value={form.gguf}
                  onChange={(v) => setField("gguf", v)}
                  validationState={form.err.gguf ? "invalid" : undefined}
                  error={form.err.gguf}
                />
              </div>
              <Button
                type="button"
                size="large"
                variant="secondary"
                class="mb-1 shrink-0"
                onClick={browseGGUF}
              >
                {language.t("common.open")}
              </Button>
            </div>
          </div>

          <div class="border-t border-border-weak-base pt-6">
            <div class="text-14-medium text-text-strong mb-4">{language.t("provider.llamacpp.field.advanced.title")}</div>
            
            <div class="flex flex-col gap-4">
              <TextField
                type="number"
                label={language.t("provider.llamacpp.field.contextSize.label")}
                placeholder="8192"
                description={language.t("provider.llamacpp.field.contextSize.description")}
                value={form.contextSize}
                onChange={(v) => setField("contextSize", v)}
              />
              
              <TextField
                type="number"
                label={language.t("provider.llamacpp.field.gpuLayers.label")}
                placeholder="99"
                description={language.t("provider.llamacpp.field.gpuLayers.description")}
                value={form.gpuLayers}
                onChange={(v) => setField("gpuLayers", v)}
              />
              
              <TextField
                type="number"
                step="0.01"
                label={language.t("provider.llamacpp.field.temperature.label")}
                placeholder="0.2"
                description={language.t("provider.llamacpp.field.temperature.description")}
                value={form.temperature}
                onChange={(v) => setField("temperature", v)}
              />
              
              <TextField
                type="number"
                step="0.01"
                label={language.t("provider.llamacpp.field.topP.label")}
                placeholder="0.95"
                description={language.t("provider.llamacpp.field.topP.description")}
                value={form.topP}
                onChange={(v) => setField("topP", v)}
              />
              
              <TextField
                type="number"
                label={language.t("provider.llamacpp.field.topK.label")}
                placeholder="40"
                description={language.t("provider.llamacpp.field.topK.description")}
                value={form.topK}
                onChange={(v) => setField("topK", v)}
              />
              
              <TextField
                type="number"
                step="0.01"
                label={language.t("provider.llamacpp.field.repeatPenalty.label")}
                placeholder="1.05"
                description={language.t("provider.llamacpp.field.repeatPenalty.description")}
                value={form.repeatPenalty}
                onChange={(v) => setField("repeatPenalty", v)}
              />
              
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-13-medium text-text-strong">{language.t("provider.llamacpp.field.flashAttention.label")}</div>
                  <div class="text-12-regular text-text-weak mt-0.5">{language.t("provider.llamacpp.field.flashAttention.description")}</div>
                </div>
                <Switch
                  checked={form.flashAttention}
                  onChange={(v) => setField("flashAttention", v)}
                />
              </div>
            </div>
          </div>

          <Button class="w-auto self-start" type="submit" size="large" variant="primary" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? language.t("common.saving") : language.t("common.submit")}
          </Button>
        </form>
      </div>
    </Dialog>
  )
}