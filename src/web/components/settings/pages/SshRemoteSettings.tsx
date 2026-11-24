import { useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  SettingsCard,
  SettingsGroup,
  SettingsList,
  SettingsRow,
  SettingsSelect,
} from '#/web/components/settings/SettingsPrimitives.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { isRepoRpcAlias, type RepoRpcSettings } from '#/shared/remote-repo-rpc.ts'
import { getRemoteSshHosts, setRepoRpcSettings } from '#/web/remote-client.ts'
import { repoRpcSettingsQueryKey, useRepoRpcSettingsQuery } from '#/web/settings-queries.ts'
import { useT } from '#/web/stores/i18n.ts'

export function SshRemoteSettings() {
  const t = useT()

  return (
    <SettingsGroup label={t('settings.ssh.title')} hint={t('settings.ssh.body')}>
      <SettingsList>
        <SettingsRow
          controlId="settings-ssh-config-file"
          label={t('settings.ssh.config-file-label')}
          hint={t('settings.ssh.config-file-hint')}
          control={<span className="font-mono text-[11px] text-muted-foreground">~/.ssh/config</span>}
        />
        <SettingsRow
          controlId="settings-ssh-path-format"
          label={t('settings.ssh.path-format-label')}
          hint={t('settings.ssh.path-format-hint')}
          control={<span className="font-mono text-[11px] text-muted-foreground">/srv/repo · ~/repo</span>}
        />
      </SettingsList>
      <SettingsCard>
        <pre className="overflow-x-auto whitespace-pre-wrap px-4 py-3 font-mono text-[11px] leading-snug text-muted-foreground">
          {t('settings.ssh.example')}
        </pre>
      </SettingsCard>
      <RepoRpcTransportSettings />
    </SettingsGroup>
  )
}

function RepoRpcTransportSettings() {
  const t = useT()
  const [hosts, setHosts] = useState<string[]>([])
  const [alias, setAlias] = useState('')
  const { data: settings, isError: loadFailed } = useRepoRpcSettingsQuery()

  useEffect(() => {
    const controller = new AbortController()
    void getRemoteSshHosts().then(
      (result) => {
        if (controller.signal.aborted) return
        const hosts = result?.hosts ?? []
        setHosts(hosts.map((host) => host.alias))
        setAlias((current) => current || hosts[0]?.alias || '')
      },
      () => undefined,
    )
    return () => controller.abort()
  }, [])

  const aliases = Array.from(new Set([...hosts, ...(settings ?? []).map((entry) => entry.alias)]))
  const selectedAlias = alias.trim()
  return (
    <SettingsGroup label={t('settings.ssh.rpc.title')} hint={t('settings.ssh.rpc.hint')}>
      <SettingsList>
        <SettingsRow
          controlId="settings-ssh-rpc-alias"
          label={t('settings.ssh.rpc.alias')}
          control={
            <Input
              id="settings-ssh-rpc-alias"
              value={alias}
              list="settings-ssh-rpc-hosts"
              onChange={(event) => setAlias(event.target.value)}
            />
          }
        />
        <datalist id="settings-ssh-rpc-hosts">
          {aliases.map((entry) => (
            <option key={entry} value={entry} />
          ))}
        </datalist>
      </SettingsList>
      {loadFailed && (
        <p className="px-3 text-xs text-destructive" role="alert">
          {t('settings.ssh.rpc.load-failed')}
        </p>
      )}
      {settings && isRepoRpcAlias(selectedAlias) && (
        <RepoRpcHostForm
          key={selectedAlias}
          alias={selectedAlias}
          saved={settings.find((entry) => entry.alias === selectedAlias)}
        />
      )}
    </SettingsGroup>
  )
}

function RepoRpcHostForm({ alias, saved }: { alias: string; saved?: RepoRpcSettings }) {
  const t = useT()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'ssh' | 'rpc'>(saved?.mode ?? 'ssh')
  const [endpoint, setEndpoint] = useState(saved?.endpoint ?? '')
  const [ca, setCa] = useState(saved?.ca ?? '')
  const [token, setToken] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; key: string } | null>(null)

  useEffect(() => {
    setMode(saved?.mode ?? 'ssh')
    setEndpoint(saved?.endpoint ?? '')
    setCa(saved?.ca ?? '')
    setToken('')
  }, [saved])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setMessage(null)
    try {
      const revision = saved?.revision ?? 0
      const result = await setRepoRpcSettings(
        mode === 'ssh' ? { alias, mode, revision } : { alias, mode, endpoint, ca, token, revision },
      )
      if (result.ok) {
        queryClient.setQueryData(repoRpcSettingsQueryKey(), result.settings)
        setToken('')
      }
      if (result.ok || result.message === 'error.remote-rpc-settings-changed') {
        void queryClient.invalidateQueries({ queryKey: repoRpcSettingsQueryKey(), exact: true })
      }
      setMessage({ ok: result.ok, key: result.ok ? 'settings.ssh.rpc.saved' : result.message })
    } catch {
      setMessage({ ok: false, key: 'settings.ssh.rpc.load-failed' })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={(event) => void save(event)}>
      <fieldset disabled={pending} className="space-y-2">
        <SettingsList>
          <SettingsRow
            controlId="settings-ssh-rpc-mode"
            label={t('settings.ssh.rpc.mode')}
            control={
              <SettingsSelect<'ssh' | 'rpc'>
                id="settings-ssh-rpc-mode"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'ssh', label: 'SSH' },
                  { value: 'rpc', label: 'HTTP/2 RPC' },
                ]}
              />
            }
          />
          {mode === 'rpc' && (
            <>
              <SettingsRow
                controlId="settings-ssh-rpc-endpoint"
                label={t('settings.ssh.rpc.endpoint')}
                control={
                  <Input
                    id="settings-ssh-rpc-endpoint"
                    type="url"
                    required
                    value={endpoint}
                    placeholder="https://dev.example:32210"
                    onChange={(event) => setEndpoint(event.target.value)}
                  />
                }
              />
              <SettingsRow
                controlId="settings-ssh-rpc-token"
                label={t('settings.ssh.rpc.token')}
                hint={saved ? t('settings.ssh.rpc.token-saved') : undefined}
                control={
                  <Input
                    id="settings-ssh-rpc-token"
                    type="password"
                    autoComplete="new-password"
                    required={!saved}
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                  />
                }
              />
              <SettingsRow
                controlId="settings-ssh-rpc-ca"
                label={t('settings.ssh.rpc.ca')}
                control={
                  <textarea
                    id="settings-ssh-rpc-ca"
                    rows={2}
                    className="w-full rounded-md border border-input bg-control px-2 py-1 font-mono text-xs"
                    value={ca}
                    onChange={(event) => setCa(event.target.value)}
                  />
                }
              />
            </>
          )}
        </SettingsList>
        <div className="flex flex-wrap items-center gap-2 px-3">
          <Button type="submit" size="sm">
            {t(mode === 'rpc' ? 'settings.ssh.rpc.verify' : 'settings.ssh.rpc.save')}
          </Button>
          {message && (
            <p
              role={message.ok ? 'status' : 'alert'}
              className={message.ok ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}
            >
              {t(message.key)}
            </p>
          )}
        </div>
      </fieldset>
    </form>
  )
}
