import { Component, createResource, For, Show, createSignal } from "solid-js"
import { SettingsList } from "./settings-list"
import { SettingsRow } from "./settings-list"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { useGlobalSDK } from "@/context/global-sdk"
import { showToast } from "@opencode-ai/ui/toast"
import { Chip } from "@opencode-ai/ui/chip"

export const SettingsAgentMCP: Component = () => {
  const language = useLanguage()
  const sdk = useGlobalSDK()
  const [editingAgent, setEditingAgent] = createSignal<string | null>(null)

  const [data] = createResource(async () => {
    const config = await sdk.client.global.config.get()
    return config
  })

  const agents = () => {
    if (!data()) return []
    return Object.entries(data()?.agents ?? {}).map(([name, agent]) => ({
      name,
      ...(agent as any),
    }))
  }

  const mcpServers = () => {
    if (!data()) return []
    return Object.keys(data()?.mcp ?? {})
  }

  const toggleMcpServer = async (agentName: string, serverName: string, enabled: boolean) => {
    try {
      const currentAgent = agents().find((a) => a.name === agentName)
      if (!currentAgent) return

      const currentMcpServers = currentAgent.mcpServers ?? []
      let newMcpServers: string[]

      if (enabled) {
        if (!currentMcpServers.includes(serverName)) {
          newMcpServers = [...currentMcpServers, serverName]
        } else {
          return
        }
      } else {
        newMcpServers = currentMcpServers.filter((s) => s !== serverName)
      }

      const newAgents = {
        ...data()?.agents,
        [agentName]: {
          ...currentAgent,
          mcpServers: newMcpServers,
        },
      }

      await sdk.client.global.config.update({
        config: {
          agents: newAgents,
        },
      })

      showToast({
        title: language.t("settings.agent.mcp.saved"),
        description: language.t("settings.agent.mcp.savedDescription", {
          agent: agentName,
          server: serverName,
          action: enabled ? "added" : "removed",
        }),
      })
    } catch (error) {
      showToast({
        title: language.t("settings.agent.mcp.error"),
        description: String(error),
        type: "error",
      })
    }
  }

  return (
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-2">
        <h2 class="text-16-semibold">{language.t("settings.agent.mcp.title")}</h2>
        <p class="text-13-regular text-text-weak">{language.t("settings.agent.mcp.description")}</p>
      </div>

      <SettingsList>
        <div class="flex flex-col gap-3 py-3">
          <For each={agents()}>
            {(agent) => (
              <div class="flex flex-col gap-2 px-3">
                <div class="flex items-center justify-between">
                  <div class="flex flex-col gap-1">
                    <span class="text-14-semibold">{agent.name}</span>
                    <Show when={agent.description}>
                      <span class="text-12-regular text-text-weak">{agent.description}</span>
                    </Show>
                  </div>
                  <Show when={agent.mcpServers && agent.mcpServers.length > 0}>
                    <div class="flex flex-wrap gap-1">
                      <For each={agent.mcpServers}>
                        {(server) => (
                          <Chip
                            size="sm"
                            variant="secondary"
                            onRemove={() => toggleMcpServer(agent.name, server, false)}
                          >
                            {server}
                          </Chip>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>

                <Show when={mcpServers().length > 0}>
                  <div class="flex flex-wrap gap-1.5 mt-1">
                    <For each={mcpServers()}>
                      {(server) => {
                        const isEnabled = () => agent.mcpServers?.includes(server) ?? false
                        return (
                          <Button
                            size="xs"
                            variant={isEnabled() ? "primary" : "secondary"}
                            onClick={() => toggleMcpServer(agent.name, server, !isEnabled())}
                          >
                            <Show when={isEnabled()} fallback={<Icon name="plus" />}>
                              <Icon name="check" />
                            </Show>
                            {server}
                          </Button>
                        )
                      }}
                    </For>
                  </div>
                </Show>

                <Show when={mcpServers().length === 0}>
                  <p class="text-12-regular text-text-weak italic">
                    {language.t("settings.agent.mcp.noServers")}
                  </p>
                </Show>
              </div>
            )}
          </For>

          <Show when={agents().length === 0}>
            <div class="px-3 py-4 text-center text-13-regular text-text-weak">
              {language.t("settings.agent.mcp.noAgents")}
            </div>
          </Show>
        </div>
      </SettingsList>

      <div class="flex flex-col gap-2">
        <p class="text-12-regular text-text-weak">
          {language.t("settings.agent.mcp.hint")}
        </p>
      </div>
    </div>
  )
}
