import type { WorkspaceSnapshotInspection } from '#/shared/branch-workspace-clone.ts'

export interface WorkspaceSnapshotSourceInput {
  rootPath: string
  repository: boolean
  excludeNames: string[]
  ignoredPaths: string[]
}

export type WorkspaceSnapshotCommand =
  | ({ type: 'workspaceSnapshotInspect' } & WorkspaceSnapshotSourceInput)
  | ({ type: 'workspaceSnapshotExport'; operationId: string; fingerprint: string } & WorkspaceSnapshotSourceInput)
  | { type: 'workspaceSnapshotReadChunk'; operationId: string; artifactId: string; offset: number; length: number }
  | { type: 'workspaceSnapshotCleanup'; operationId: string }

export type WorkspaceSnapshotSourceReply<T = WorkspaceSnapshotInspection> =
  | { ok: true; value: T }
  | { ok: false; detail: string }

/** Only typed, bounded operations enter the existing authenticated SSH / WSL runner. */
export function workspaceSnapshotScript(command: WorkspaceSnapshotCommand): string {
  const encoded = Buffer.from(JSON.stringify(command), 'utf8').toString('base64')
  return `python3 - <<'HOBGOBLIN_SNAPSHOT_PY'\nCOMMAND = '${encoded}'\n${snapshotPython}\nHOBGOBLIN_SNAPSHOT_PY`
}

const snapshotPython = String.raw`
import os, sys, json, base64, hashlib, tempfile, subprocess, stat, shutil, re, signal, time
request = json.loads(base64.b64decode(COMMAND))
MAX_BYTES = 16 * 1024 * 1024 * 1024
MAX_ENTRIES = 12000
MAX_MANIFEST = 1500000
MAX_CHUNK = 256 * 1024
owned = None

def fail(message):
    raise RuntimeError(message)

def digest_file(filename):
    digest = hashlib.sha256()
    count = 0
    with open(filename, 'rb') as stream:
        while True:
            chunk = stream.read(MAX_CHUNK)
            if not chunk: break
            count += len(chunk)
            if count > MAX_BYTES: fail('Snapshot exceeds the 16 GiB artifact limit')
            digest.update(chunk)
    return count, digest.hexdigest()

def stable_json(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(',', ':')).encode('ascii')

def relative(value):
    if not isinstance(value, str) or not value or len(value) > 4096 or '\x00' in value or '\\' in value:
        fail('Unsupported filename in snapshot')
    if any(p in ('', '.', '..') or p.lower() == '.git' for p in value.split('/')):
        fail('Unsafe or Git metadata path in snapshot: ' + value)
    value.encode('utf-8', 'strict')
    return value

def operation_dir(operation):
    if not re.fullmatch('[a-f0-9]{32}', operation): fail('Invalid snapshot operation')
    return os.path.join(tempfile.gettempdir(), 'hobgoblin-snapshot-' + str(os.getuid()) + '-' + operation)

def check_owned(folder):
    info = os.lstat(folder)
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
        fail('Snapshot ownership changed')

def git(root, args, destination=None, allow_failure=False):
    env = dict(os.environ, GIT_OPTIONAL_LOCKS='0', GIT_TERMINAL_PROMPT='0', GIT_NO_LAZY_FETCH='1')
    argv = ['git', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-C', root] + args
    with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
        process = subprocess.Popen(argv, stdout=destination or output, stderr=errors, env=env)
        try:
            code = process.wait(timeout=540)
        except BaseException:
            process.kill()
            process.wait()
            raise
        if code and not allow_failure:
            errors.seek(0)
            fail(errors.read(8192).decode('utf-8', 'replace') or 'Git snapshot command failed')
        output.seek(0)
        raw = output.read(8 * 1024 * 1024 + 1)
        if len(raw) > 8 * 1024 * 1024: fail('Snapshot Git metadata exceeds the 8 MiB limit')
        return raw

def text(root, args, optional=False):
    return git(root, args, allow_failure=optional).decode('utf-8', 'strict').strip()

def names(raw, directories=False):
    return [relative(p.decode('utf-8', 'strict').rstrip('/') if directories else p.decode('utf-8', 'strict')) for p in raw.split(b'\x00') if p]

def artifact(folder, artifact_id):
    size, sha = digest_file(os.path.join(folder, artifact_id))
    return {'id': artifact_id, 'size': size, 'sha256': sha}

def capture(root, folder, exporting):
    if not os.path.isabs(root) or os.path.islink(root) or not os.path.isdir(root):
        fail('Snapshot source must be an existing, non-symlink absolute directory')
    entries = []
    ignored = []
    repository = None
    total = 0
    seen = set()
    def add(rel):
        nonlocal total
        relative(rel)
        if rel in seen: return
        seen.add(rel)
        current = root
        for part in rel.split('/')[:-1]:
            current = os.path.join(current, part)
            if os.path.islink(current): fail('Snapshot path traverses a symbolic link: ' + rel)
        filename = os.path.join(root, rel)
        info = os.lstat(filename)
        item = {'path': rel, 'mode': stat.S_IMODE(info.st_mode), 'size': 0}
        if stat.S_ISLNK(info.st_mode):
            target = os.readlink(filename)
            # Relative internal links survive relocating the complete workspace.
            resolved = os.path.normpath(os.path.join(os.path.dirname(filename), target))
            if os.path.isabs(target) or os.path.commonpath([root, resolved]) != root:
                fail('Absolute or outside-source symbolic link requires remapping: ' + rel)
            if not os.path.exists(filename): fail('Dangling symbolic link cannot be cloned: ' + rel)
            item.update(kind='symlink', linkTarget=target)
        elif stat.S_ISREG(info.st_mode):
            item['kind'] = 'file'
            artifact_id = 'file-' + str(len(entries))
            if exporting:
                destination = os.path.join(folder, artifact_id)
                with open(filename, 'rb') as source, open(destination, 'xb') as target:
                    shutil.copyfileobj(source, target, MAX_CHUNK)
                size, sha = digest_file(destination)
                item['artifact'] = {'id': artifact_id, 'size': size, 'sha256': sha}
            else:
                size, sha = digest_file(filename)
            item.update(size=size, sha256=sha)
            total += size
        elif stat.S_ISDIR(info.st_mode):
            item['kind'] = 'directory'
        else:
            fail('Unsupported special file: ' + rel)
        entries.append(item)
        if len(entries) > MAX_ENTRIES or total > MAX_BYTES: fail('Snapshot exceeds entry or 16 GiB size limit')
    if request['repository']:
        if os.path.realpath(text(root, ['rev-parse', '--show-toplevel'])) != os.path.realpath(root):
            fail('Member is not a repository root')
        head = text(root, ['rev-parse', '--verify', 'HEAD'])
        branch = text(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], True) or None
        if text(root, ['rev-parse', '--is-shallow-repository']) == 'true': fail('Shallow repositories are not supported')
        for marker in ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer', 'BISECT_LOG', 'index.lock']:
            marker_path = text(root, ['rev-parse', '--git-path', marker])
            if os.path.lexists(os.path.join(root, marker_path)): fail('Finish the active Git operation before cloning: ' + marker)
        if git(root, ['ls-files', '--unmerged', '-z']): fail('Resolve index conflicts before cloning')
        for setting in ['core.sparseCheckout', 'extensions.partialClone']:
            if text(root, ['config', '--get', setting], True) not in ('', 'false'): fail('Unsupported repository setting: ' + setting)
        stages = git(root, ['ls-files', '--stage', '-z'])
        if any(row.startswith(b'160000 ') for row in (stages + git(root, ['ls-tree', '-r', '-z', head])).split(b'\x00')):
            fail('Submodule/gitlink members are not supported')
        flags = git(root, ['ls-files', '-v', '-z'])
        if any(row and row[:1] != b'H' for row in flags.split(b'\x00')):
            fail('Sparse, assume-unchanged, or special index flags are not supported')
        debug = git(root, ['ls-files', '--debug'])
        if any(int(flag, 16) != 0 for flag in re.findall(rb'flags: ([0-9a-f]+)', debug)):
            fail('Intent-to-add or extended index flags are not supported')
        tracked = names(git(root, ['ls-files', '-z']))
        if tracked:
            # External filters cannot safely be copied or executed on the destination.
            for offset in range(0, len(tracked), 200):
                attrs = git(root, ['check-attr', '-z', '--all', '--'] + tracked[offset:offset + 200]).split(b'\x00')
                for index in range(0, len(attrs) - 2, 3):
                    if attrs[index + 1] == b'filter' and attrs[index + 2] not in (b'unset', b'unspecified'):
                        fail('External clean/smudge filter is not supported: ' + attrs[index].decode('utf-8', 'replace'))
        untracked = names(git(root, ['ls-files', '--others', '--exclude-standard', '-z']))
        ignored = names(git(root, ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z']), True)
        chosen = request.get('ignoredPaths', [])
        if any(p not in ignored for p in chosen): fail('Selected ignored path changed or is not ignored')
        config = []
        for key in ['core.autocrlf', 'core.eol', 'core.filemode']:
            value = text(root, ['config', '--get', key], True)
            if value: config.append({'key': key, 'value': value})
        remotes = text(root, ['remote']).splitlines()
        for remote in remotes:
            for suffix in ['url', 'pushurl', 'fetch']:
                key = 'remote.' + remote + '.' + suffix
                values = git(root, ['config', '--null', '--get-all', key], allow_failure=True).split(b'\x00')
                for raw in values:
                    if not raw: continue
                    value = raw.decode('utf-8', 'strict')
                    if suffix != 'fetch' and (re.search(r'://[^/@]+:[^/@]+@', value) or re.search(r'^https?://[^/]*@', value) or '?' in value or value.startswith('ext::')):
                        fail('Credential-bearing or executable remote URLs cannot be copied')
                    config.append({'key': key, 'value': value})
        if branch:
            for suffix in ['remote', 'merge', 'pushRemote']:
                key = 'branch.' + branch + '.' + suffix
                for raw in git(root, ['config', '--null', '--get-all', key], allow_failure=True).split(b'\x00'):
                    if raw: config.append({'key': key, 'value': raw.decode('utf-8', 'strict')})
        diff_base = ['diff', '--no-ext-diff', '--no-textconv', '--binary', '--full-index', '--no-renames']
        for name, args in [('staged', diff_base + ['--cached', head, '--']), ('unstaged', diff_base + ['--'])]:
            with open(os.path.join(folder, name), 'wb') as output: git(root, args, destination=output)
        repository = {'head': head, 'branch': branch, 'objectFormat': text(root, ['rev-parse', '--show-object-format']),
                      'config': config, 'stagedSha256': artifact(folder, 'staged')['sha256'],
                      'unstagedSha256': artifact(folder, 'unstaged')['sha256'],
                      'indexSha256': hashlib.sha256(stages).hexdigest(), 'trackedPaths': sorted(set(tracked + names(git(root, ['ls-tree', '-r', '--name-only', '-z', head]))))}
        for rel in sorted(set(tracked + untracked)):
            if os.path.lexists(os.path.join(root, rel)): add(rel)
        def add_ignored(rel):
            add(rel)
            filename = os.path.join(root, rel)
            if os.path.isdir(filename) and not os.path.islink(filename):
                for child in sorted(os.listdir(filename)):
                    if child.lower() == '.git': fail('Ignored addition contains Git metadata: ' + rel)
                    add_ignored(rel + '/' + child)
        for rel in sorted(set(chosen)): add_ignored(rel)
    else:
        excludes = set(request.get('excludeNames', [])) | {'.git', '.hobgoblin', '.goblin'}
        def walk(rel):
            add(rel)
            if entries[-1]['kind'] == 'directory':
                for child in sorted(os.listdir(os.path.join(root, rel))):
                    if child.lower() == '.git': fail('Unregistered nested repository in root files: ' + rel)
                    walk(rel + '/' + child)
        for name in sorted(os.listdir(root)):
            if name not in excludes: walk(name)
    result = {'entries': entries, 'ignoredPaths': sorted(ignored), 'totalBytes': total}
    if repository: result['repository'] = repository
    clean = json.loads(json.dumps(result))
    for entry in clean['entries']: entry.pop('artifact', None)
    result['fingerprint'] = hashlib.sha256(stable_json(clean)).hexdigest()
    if len(stable_json(result)) > MAX_MANIFEST: fail('Snapshot manifest exceeds the 1.5 MiB limit')
    return result

def interrupted(signum, frame):
    raise RuntimeError('Snapshot cancelled or timed out')

signal.signal(signal.SIGTERM, interrupted)
signal.signal(signal.SIGHUP, interrupted)
signal.signal(signal.SIGALRM, interrupted)
signal.alarm(600)
try:
    action = request['type']
    if action == 'workspaceSnapshotCleanup':
        folder = operation_dir(request['operationId'])
        if os.path.lexists(folder):
            check_owned(folder)
            shutil.rmtree(folder)
        result = None
    elif action == 'workspaceSnapshotReadChunk':
        folder = operation_dir(request['operationId'])
        check_owned(folder)
        artifact_id = request['artifactId']
        if not re.fullmatch(r'(bundle|staged|unstaged|file-[0-9]+)', artifact_id): fail('Invalid snapshot artifact')
        offset, length = request['offset'], request['length']
        if not isinstance(offset, int) or offset < 0 or not isinstance(length, int) or not 1 <= length <= MAX_CHUNK:
            fail('Invalid snapshot chunk')
        filename = os.path.join(folder, artifact_id)
        if not stat.S_ISREG(os.lstat(filename).st_mode): fail('Snapshot artifact is not a regular file')
        with open(filename, 'rb') as stream:
            stream.seek(offset)
            raw = stream.read(length)
        result = {'offset': offset, 'bytesBase64': base64.b64encode(raw).decode('ascii')}
    else:
        exporting = action == 'workspaceSnapshotExport'
        if not exporting and action != 'workspaceSnapshotInspect': fail('Unknown snapshot operation')
        # Expire abandoned exports from this user after a day; active exports run for at most two hours.
        prefix = 'hobgoblin-snapshot-' + str(os.getuid()) + '-'
        for candidate in os.scandir(tempfile.gettempdir()):
            if candidate.name.startswith(prefix) and re.fullmatch('[a-f0-9]{32}', candidate.name[len(prefix):]):
                try:
                    info = candidate.stat(follow_symlinks=False)
                    if stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o700 and info.st_mtime < time.time() - 86400:
                        shutil.rmtree(candidate.path)
                except OSError: pass
        folder = operation_dir(request['operationId']) if exporting else tempfile.mkdtemp(prefix='hobgoblin-inspect-')
        if exporting: os.mkdir(folder, 0o700)
        owned = folder
        root = request['rootPath']
        result = capture(root, folder, exporting)
        if exporting:
            if result['fingerprint'] != request['fingerprint']: fail('Source changed since the clone preview; review a new plan')
            if request['repository']:
                git(root, ['bundle', 'create', os.path.join(folder, 'bundle'), 'HEAD'])
                result.update(bundle=artifact(folder, 'bundle'), staged=artifact(folder, 'staged'), unstaged=artifact(folder, 'unstaged'))
            with tempfile.TemporaryDirectory(prefix='hobgoblin-verify-') as verify:
                after = capture(root, verify, False)
            if after['fingerprint'] != result['fingerprint']: fail('Source changed during snapshot export')
            result['operationId'] = request['operationId']
            owned = None
        else:
            shutil.rmtree(folder)
            owned = None
    print(json.dumps({'ok': True, 'value': result}, ensure_ascii=True))
except BaseException as error:
    if owned:
        try: shutil.rmtree(owned)
        except OSError: pass
    print(json.dumps({'ok': False, 'detail': str(error)}, ensure_ascii=True))
`
