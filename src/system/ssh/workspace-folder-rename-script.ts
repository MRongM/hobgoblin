import type { WorkspaceFolderRenameInput } from '#/system/git/workspace-folder-rename.ts'

export type WorkspaceFolderRenameCommand = { type: 'renameWorkspaceFolder' } & WorkspaceFolderRenameInput

/** Fixed, bounded host operation using the application's authenticated SSH or WSL transport. */
export function workspaceFolderRenameScript(command: WorkspaceFolderRenameCommand): string {
  const encoded = Buffer.from(JSON.stringify(command), 'utf8').toString('base64')
  return `python3 - <<'HOBGOBLIN_FOLDER_RENAME_PY'\nCOMMAND = '${encoded}'\n${renamePython}\nHOBGOBLIN_FOLDER_RENAME_PY`
}

const renamePython = String.raw`
import os, json, base64, stat, subprocess, time, signal, uuid
request = json.loads(base64.b64decode(COMMAND))
prefix = 'workspace.branch-workspace.rename.'
previous = os.path.normpath(request['previousPath'])
following = os.path.normpath(request['path'])
previous_real, following_real = previous, following
moved = False
groups, roots, links, repaired_links = {}, [], [], []
deadline = time.monotonic() + 120
rolling_back = False

def fail(message):
    raise RuntimeError(message)

def check():
    if time.monotonic() > deadline: fail(prefix + 'scan-limit')

def interrupt(number, frame):
    if not rolling_back: fail('workspace.branch-workspace.rename.cancelled')

signal.signal(signal.SIGTERM, interrupt)
signal.signal(signal.SIGINT, interrupt)

def inside(parent, candidate):
    try: return os.path.commonpath([parent, candidate]) == parent
    except ValueError: return False

def rebase(value):
    return os.path.join(following_real, os.path.relpath(value, previous_real)) if inside(previous_real, value) else value

def run_git(cwd, arguments):
    check()
    env = dict(os.environ, GIT_OPTIONAL_LOCKS='0', GIT_TERMINAL_PROMPT='0', GIT_NO_LAZY_FETCH='1')
    result = subprocess.run(['git', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-C', cwd] + arguments,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=min(15, max(1, deadline-time.monotonic())), env=env)
    if result.returncode: fail(prefix + 'unsupported-git')
    if len(result.stdout) > 8*1024*1024: fail(prefix + 'scan-limit')
    return result.stdout.decode('utf-8', 'strict').rstrip('\r\n')

def records(raw):
    values = []
    for block in raw.split('\x00\x00'):
        fields = block.split('\x00')
        row = next((field[9:] for field in fields if field.startswith('worktree ')), None)
        if row: values.append({'path': os.path.realpath(row), 'locked': any(field == 'locked' or field.startswith('locked ') for field in fields), 'bare': 'bare' in fields})
    return values

def identity(info):
    return info.st_dev, info.st_ino

def same_case_entry(source, destination):
    return source != destination and source.lower() == destination.lower() and identity(os.lstat(source)) == identity(os.lstat(destination))

def rename_exclusive(source, destination, expected):
    current = os.lstat(source)
    if identity(current) != identity(expected): fail('workspace.branch-workspace.plan-stale')
    if os.path.lexists(destination):
        if not same_case_entry(source, destination): fail('workspace.branch-workspace.target-exists')
        os.rename(source, destination)
        return
    if stat.S_ISLNK(current.st_mode):
        os.symlink(os.readlink(source), destination)
        claimed = os.lstat(destination)
        try:
            if identity(os.lstat(source)) != identity(expected): fail('workspace.branch-workspace.plan-stale')
            os.unlink(source)
        except BaseException:
            if os.path.lexists(destination) and identity(os.lstat(destination)) == identity(claimed): os.unlink(destination)
            raise
        return
    os.mkdir(destination)
    claimed = os.lstat(destination)
    try:
        if identity(os.lstat(destination)) != identity(claimed): fail('workspace.branch-workspace.target-exists')
        if identity(os.lstat(source)) != identity(expected): fail('workspace.branch-workspace.plan-stale')
        os.rename(source, destination)
    except BaseException:
        if os.path.lexists(destination) and identity(os.lstat(destination)) == identity(claimed):
            try: os.rmdir(destination)
            except OSError: pass
        raise

def replace_link(filename, expected, replacement):
    if os.readlink(filename) != expected: fail('workspace.branch-workspace.plan-stale')
    temporary = os.path.join(os.path.dirname(filename), '.hob-rename-link-' + uuid.uuid4().hex)
    os.symlink(replacement, temporary)
    try:
        if os.readlink(filename) != expected: fail('workspace.branch-workspace.plan-stale')
        os.rename(temporary, filename)
    finally:
        if os.path.lexists(temporary): os.unlink(temporary)

entries = 0

def visit(folder, depth):
    global entries
    check()
    if depth > 80: fail(prefix + 'scan-limit')
    marker = os.path.join(folder, '.git')
    bare = False
    if not os.path.lexists(marker) and os.path.isfile(os.path.join(folder, 'HEAD')) and os.path.isdir(os.path.join(folder, 'objects')):
        try: bare = run_git(folder, ['rev-parse', '--is-bare-repository']) == 'true'
        except RuntimeError: pass
    if os.path.lexists(marker) or bare:
        if not bare and (os.path.islink(marker) or not (os.path.isfile(marker) or os.path.isdir(marker))): fail(prefix + 'unsupported-git')
        if len(roots) >= 512: fail(prefix + 'scan-limit')
        if not bare and os.path.realpath(run_git(folder, ['rev-parse', '--show-toplevel'])) != folder: fail(prefix + 'unsupported-git')
        common = os.path.realpath(run_git(folder, ['rev-parse', '--path-format=absolute', '--git-common-dir']))
        gitdir = run_git(folder, ['rev-parse', '--absolute-git-dir'])
        for lock in [os.path.join(common, 'config.lock'), os.path.join(gitdir, 'index.lock'), os.path.join(gitdir, 'HEAD.lock')]:
            if os.path.lexists(lock): fail('workspace.branch-workspace.operation-in-progress')
        try: explicit_worktree = run_git(folder, ['config', '--local', '--get', 'core.worktree'])
        except RuntimeError: explicit_worktree = ''
        if os.path.isabs(explicit_worktree): fail(prefix + 'unsupported-git')
        if common not in groups:
            worktrees = records(run_git(folder, ['worktree', 'list', '--porcelain', '-z']))
            if not worktrees: fail(prefix + 'unsupported-git')
            if any(item['locked'] and inside(previous_real, item['path']) for item in worktrees): fail('workspace.branch-workspace.operation-in-progress')
            groups[common] = worktrees
        if not any(item['path'] == folder for item in groups[common]): fail(prefix + 'unsupported-git')
        roots.append({'path': folder, 'common': common})
    if bare: return
    with os.scandir(folder) as directory:
        for entry in directory:
            check()
            entries += 1
            if entries > 200000: fail(prefix + 'scan-limit')
            if entry.name == '.git': continue
            if entry.is_symlink():
                original = os.readlink(entry.path)
                target = os.path.normpath(os.path.join(folder, original))
                actual_target = os.path.realpath(target)
                target_after = rebase(target if inside(previous_real, target) or not inside(previous_real, actual_target) else actual_target)
                link_after = rebase(entry.path)
                replacement = target_after if os.path.isabs(original) else os.path.relpath(target_after, os.path.dirname(link_after))
                if os.path.normpath(os.path.join(os.path.dirname(link_after), original)) != target_after:
                    links.append({'path': entry.path, 'original': original, 'replacement': replacement})
            elif entry.is_dir(follow_symlinks=False): visit(entry.path, depth+1)

def repair_git(reverse=False):
    for original_common, worktrees in groups.items():
        common = original_common if reverse else rebase(original_common)
        primary = worktrees[0]['path'] if reverse else rebase(worktrees[0]['path'])
        linked_paths = [(item['path'] if reverse else rebase(item['path'])) for item in worktrees[1:] if inside(previous_real, item['path'])]
        cwd = primary if os.path.isdir(primary) else os.path.dirname(common)
        run_git(cwd, ['--git-dir=' + common, 'worktree', 'repair'] + linked_paths)
        registered_paths = {item['path'] for item in records(run_git(cwd, ['--git-dir=' + common, 'worktree', 'list', '--porcelain', '-z']))}
        for item in worktrees:
            if inside(previous_real, item['path']) and (item['path'] if reverse else rebase(item['path'])) not in registered_paths:
                fail(prefix + 'unsupported-git')
    for root in roots:
        folder = root['path'] if reverse else rebase(root['path'])
        common = root['common'] if reverse else rebase(root['common'])
        if os.path.realpath(run_git(folder, ['rev-parse', '--path-format=absolute', '--git-common-dir'])) != common:
            fail(prefix + 'unsupported-git')

def reply(ok, message=None):
    mappings = []
    if moved:
        mappings.append({'previousPath': previous, 'path': following})
        if previous_real != previous: mappings.append({'previousPath': previous_real, 'path': following_real})
    repository_paths = set()
    for folder in [root['path'] for root in roots] + [worktrees[0]['path'] for worktrees in groups.values()]:
        repository_paths.update([folder, rebase(folder)])
    value = {'ok': ok, 'previousPath': previous, 'path': following if moved else previous,
        'pathMappings': mappings, 'repositoryPaths': sorted(repository_paths)}
    if message: value['message'] = message
    print(json.dumps(value))

try:
    if not os.path.isabs(previous) or not os.path.isabs(following) or previous == '/' or os.path.dirname(previous) != os.path.dirname(following):
        fail('workspace.branch-workspace.invalid-directory')
    if previous == following:
        reply(True)
    else:
        if os.path.lexists(following) and not same_case_entry(previous, following): fail('workspace.branch-workspace.target-exists')
        source_info = os.lstat(previous)
        if not os.path.isdir(previous): fail('workspace.branch-workspace.directory-unavailable')
        if not stat.S_ISLNK(source_info.st_mode):
            previous_real = os.path.realpath(previous)
            following_real = os.path.join(os.path.realpath(os.path.dirname(previous)), os.path.basename(following))
            for protected in request['protectedPaths']:
                if inside(previous_real, os.path.realpath(protected)): fail(prefix + 'protected-root')
            visit(previous_real, 0)
        check()
        rename_exclusive(previous, following, source_info)
        moved = True
        for item in links:
            replace_link(rebase(item['path']), item['original'], item['replacement'])
            repaired_links.append(item)
        repair_git()
        reply(True)
except BaseException as error:
    rollback_failed = False
    if moved:
        rolling_back = True
        deadline = time.monotonic() + 120
        try:
            rename_exclusive(following, previous, os.lstat(following))
            moved = False
            for item in repaired_links: replace_link(item['path'], item['replacement'], item['original'])
            repair_git(True)
        except BaseException: rollback_failed = True
    message = str(error)
    if not message.startswith(('workspace.', 'error.')): message = prefix + 'failed'
    if rollback_failed: message = prefix + 'rollback-failed'
    reply(False, message)
`
