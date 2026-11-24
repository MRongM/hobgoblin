#!/usr/bin/env node
import { readFile, realpath, stat } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { isRepoRpcToken } from '#/shared/remote-repo-rpc.ts'
import { createRepoRpcAgent } from '#/system/remote/repo-rpc-agent.ts'
import { serverLogger } from '#/server/logger.ts'

const { values } = parseArgs({
  options: {
    host: { type: 'string', default: '127.0.0.1' },
    port: { type: 'string', default: '32210' },
    cert: { type: 'string' },
    key: { type: 'string' },
    'token-file': { type: 'string' },
    'repo-root': { type: 'string', multiple: true },
  },
})

const { host, cert, key, 'token-file': tokenFile, 'repo-root': repoRoots } = values
const port = Number(values.port)
if (!host || !cert || !key || !tokenFile || !repoRoots?.length || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(
    'Usage: node scripts/start-remote-repo-rpc.ts --cert FILE --key FILE --token-file FILE --repo-root DIRECTORY [--host ADDRESS] [--port PORT]',
  )
}

const token = (await readFile(tokenFile, 'utf8')).trim()
if (!isRepoRpcToken(token)) throw new Error('Invalid RPC token; use a random token, for example openssl rand -hex 32')
const roots = await Promise.all(repoRoots.map((root) => realpath(root)))
for (const root of roots) {
  if (!(await stat(root)).isDirectory()) throw new Error('Each --repo-root must be a directory')
}
const logger = serverLogger.child({ module: 'repo-rpc-agent' })
const server = createRepoRpcAgent({
  cert: await readFile(cert),
  key: await readFile(key),
  token,
  roots,
  recordRead(metric) {
    logger[metric.failure && metric.failure !== 'cancelled' ? 'warn' : 'debug'](metric, 'repository RPC read')
  },
})
server.listen(port, host, () => console.log(`Repository RPC listening on ${host}:${port} (HTTPS/HTTP/2)`))
