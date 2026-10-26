/** Fixed, same-host dependency operations used through the SSH/WSL command dispatcher. */
export interface WorktreeDependencyCommand {
  type: 'worktreeDependency'
  action: 'inspect' | 'fingerprint' | 'add' | 'remove'
  operation: 'add' | 'remove'
  repoPath: string
  worktreePath: string
  sourceWorktreePath?: string
  name?: string
  identity?: string
  fingerprint?: string
  mode?: 'copy' | 'symlink'
}

export function worktreeDependencyScript(command: WorktreeDependencyCommand): string {
  const encoded = Buffer.from(JSON.stringify(command), 'utf8').toString('base64')
  return `python3 - <<'HOBGOBLIN_DEPENDENCY_PY'\nCOMMAND = '${encoded}'\n${dependencyPython}\nHOBGOBLIN_DEPENDENCY_PY`
}

const dependencyPython = String.raw`
import os, sys, stat, json, base64, hashlib, subprocess, tempfile, signal
request = json.loads(base64.b64decode(COMMAND))
MAX_ENTRIES = 100000
MAX_ROOT_ENTRIES = 10000
MAX_DEPTH = 64

def fail(code):
    raise RuntimeError('worktree-dependencies.' + code)

def cancelled(signum, frame):
    fail('cancelled')
signal.signal(signal.SIGTERM, cancelled)

def encode(value):
    return json.dumps(value, ensure_ascii=True, separators=(',', ':'))

def git(root, args, optional=False):
    env = dict(os.environ, GIT_OPTIONAL_LOCKS='0', GIT_TERMINAL_PROMPT='0', LC_ALL='C', LANG='C')
    with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
        process = subprocess.Popen(['git', '-c', 'core.fsmonitor=false', '-C', root] + args, stdout=output, stderr=errors, env=env)
        try:
            code = process.wait(timeout=30)
        except BaseException:
            process.kill()
            process.wait()
            raise
        errors.seek(0)
        error = errors.read(8192).decode('utf-8', 'replace')
        if code:
            if optional and 'not a git repository' in error: return None
            fail('invalid-source' if optional else 'invalid-target')
        output.seek(0)
        value = output.read(10 * 1024 * 1024 + 1)
        if len(value) > 10 * 1024 * 1024: fail('failed')
        return value.decode('utf-8', 'strict')

def name_valid(value):
    return isinstance(value, str) and 0 < len(value) <= 255 and value not in ('.','..') and value.lower() != '.git' and not any(c in value for c in '/\\') and not any(ord(c) < 32 or ord(c) == 127 for c in value)

def absolute(value, error):
    if not isinstance(value, str) or not value.startswith('/') or any(ord(c) < 32 or ord(c) == 127 for c in value): fail(error)
    resolved = os.path.realpath(value)
    if not os.path.isdir(resolved): fail(error)
    return resolved

def identity(info):
    return [info.st_dev, info.st_ino, info.st_mode]

def within(root, item):
    return os.path.commonpath([root,item]) == root

def tracked(root):
    value = git(root, ['ls-files','-z'], optional=True)
    return set(item.split('/')[0].lower() for item in (value or '').split('\0') if item)

def kind(info):
    if stat.S_ISLNK(info.st_mode): return 'symlink'
    if stat.S_ISDIR(info.st_mode): return 'directory'
    if stat.S_ISREG(info.st_mode): return 'file'
    return None

def nested_repository(filename):
    if not os.path.isdir(filename): return False
    return os.path.lexists(os.path.join(filename,'.git')) or all(os.path.lexists(os.path.join(filename,name)) for name in ('HEAD','objects','refs'))

def inspect():
    operation = request.get('operation')
    if operation not in ('add','remove'): fail('invalid-target')
    repo = absolute(request.get('repoPath'), 'invalid-target')
    target = absolute(request.get('worktreePath'), 'invalid-target')
    records = git(repo, ['worktree','list','--porcelain','-z','--expire','now']).split('\0\0')
    found = False
    for record in records:
        fields = record.split('\0')
        location = next((field[9:] for field in fields if field.startswith('worktree ')), None)
        if location and 'bare' not in fields and not any(field.startswith('prunable') for field in fields) and os.path.realpath(location) == target:
            found = True
    if not found: fail('invalid-target')
    if os.path.realpath(git(target,['rev-parse','--show-toplevel']).strip()) != target: fail('invalid-target')
    common = os.path.realpath(git(target,['rev-parse','--path-format=absolute','--git-common-dir']).strip())
    source = target if operation == 'remove' else absolute(request.get('sourceWorktreePath') or request.get('repoPath'), 'invalid-source')
    if operation == 'add' and (within(source,target) or within(target,source)): fail('invalid-source')
    source_tracked, target_tracked = tracked(source), tracked(target)
    names = sorted(os.listdir(source))
    if len(names) > MAX_ROOT_ENTRIES: fail('failed')
    candidates = []
    for name in names:
        if not name_valid(name) or name.lower() in source_tracked or name.lower() in target_tracked: continue
        filename = os.path.join(source,name)
        try: info = os.lstat(filename)
        except FileNotFoundError: continue
        category = kind(info)
        if not category or nested_repository(filename): continue
        destination = os.path.join(target,name)
        candidates.append(dict(path=name,kind=category,targetPath=destination,targetExists=os.path.lexists(destination)))
    return dict(repoPath=repo,targetRoot=target,sourceRoot=source,
        identity=encode([repo,target,source,identity(os.lstat(target)),identity(os.lstat(source)),common,identity(os.lstat(common))]),candidates=candidates)

def metadata(filename):
    info = os.lstat(filename)
    category = kind(info)
    if not category: fail('invalid-source')
    value = dict(kind=category,dev=info.st_dev,ino=info.st_ino,mode=info.st_mode,size=info.st_size,mtime=info.st_mtime_ns,ctime=info.st_ctime_ns)
    if category == 'symlink': value['link'] = os.readlink(filename)
    return value

def snapshot(root,shallow=False):
    entries=[]
    def walk(filename,relative,depth):
        if len(entries) >= MAX_ENTRIES or depth > MAX_DEPTH: fail('failed')
        value=metadata(filename)
        entries.append([relative,value])
        if value['kind'] != 'directory' or shallow: return
        names=sorted(os.listdir(filename))
        if any(name.lower()=='.git' for name in names) or all(name in names for name in ('HEAD','objects','refs')): fail('invalid-source')
        for name in names: walk(os.path.join(filename,name),relative+'/'+name if relative else name,depth+1)
    walk(root,'',0)
    return entries,hashlib.sha256(encode(entries).encode('ascii')).hexdigest()

def stamp(filename):
    try: info=os.lstat(filename)
    except FileNotFoundError: return None
    return [info.st_dev,info.st_ino,info.st_mode,info.st_size,info.st_mtime_ns,info.st_ctime_ns]

def index_stamp(root):
    filename=git(root,['rev-parse','--path-format=absolute','--git-path','index'],optional=True)
    if filename is None: return None
    filename=filename.strip()
    return filename,stamp(filename)

def check_parents(root,relative,entries,created=False):
    parts=relative.split('/') if relative else []
    for count in range(len(parts)):
        rel='/'.join(parts[:count])
        info=os.lstat(os.path.join(root,*parts[:count]))
        expected=entries.get(rel)
        if expected is None or not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode): fail('plan-stale')
        if created:
            if identity(info) != expected: fail('plan-stale')
        elif info.st_dev != expected['dev'] or info.st_ino != expected['ino']: fail('plan-stale')

def run():
    value=inspect()
    if request['action']=='inspect': return value
    if value['identity'] != request.get('identity'): fail('plan-stale')
    name=request.get('name')
    if not name_valid(name): fail('invalid-source')
    if not any(entry['path']==name for entry in value['candidates']): fail('tracked')
    source=os.path.join(value['sourceRoot'],name)
    target=os.path.join(value['targetRoot'],name)
    entries,fingerprint=snapshot(source, request['operation']=='add' and request.get('mode')=='symlink')
    if request['action']=='fingerprint': return fingerprint
    if fingerprint != request.get('fingerprint'): fail('plan-stale')
    indexes=[index_stamp(value['targetRoot']),index_stamp(value['sourceRoot'])]
    if name.lower() in tracked(value['sourceRoot']) or name.lower() in tracked(value['targetRoot']): fail('tracked')
    roots=[(root,identity(os.lstat(root))) for root in (value['targetRoot'],value['sourceRoot'])]
    def check_roots():
        for root,expected in roots:
            info=os.lstat(root)
            if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode) or identity(info) != expected or os.path.realpath(root) != root: fail('plan-stale')
        for index in indexes:
            if index is not None and stamp(index[0]) != index[1]: fail('plan-stale')
    check_roots()
    index=dict(entries)
    if request['action'] != request['operation']: fail('invalid-source')
    if request['action']=='remove':
        for relative,expected in reversed(entries):
            check_roots()
            check_parents(target,relative,index)
            filename=os.path.join(target,*relative.split('/')) if relative else target
            current=metadata(filename)
            if current['kind'] != expected['kind'] or any(current[field]!=expected[field] for field in ('dev','ino','mode')): fail('plan-stale')
            if current['kind']=='directory': os.rmdir(filename)
            else:
                if current != expected: fail('plan-stale')
                os.unlink(filename)
        return None
    if request['action'] != 'add' or request['operation'] != 'add': fail('invalid-source')
    if os.path.lexists(target): fail('target-exists')
    if request.get('mode')=='symlink':
        os.symlink(source,target)
        return None
    if request.get('mode')!='copy': fail('invalid-source')
    created={}
    for relative,expected in entries:
        check_roots()
        check_parents(source,relative,index)
        check_parents(target,relative,created,created=True)
        filename=os.path.join(source,*relative.split('/')) if relative else source
        destination=os.path.join(target,*relative.split('/')) if relative else target
        if metadata(filename) != expected: fail('plan-stale')
        if expected['kind']=='directory':
            os.mkdir(destination,stat.S_IMODE(expected['mode']) | 0o700)
            created[relative]=identity(os.lstat(destination))
        elif expected['kind']=='symlink':
            os.symlink(os.path.normpath(os.path.join(os.path.dirname(filename),expected['link'])),destination)
        else:
            source_fd=os.open(filename,os.O_RDONLY | getattr(os,'O_NOFOLLOW',0))
            try:
                opened=os.fstat(source_fd)
                if opened.st_dev != expected['dev'] or opened.st_ino != expected['ino'] or opened.st_size != expected['size'] or opened.st_mtime_ns != expected['mtime']: fail('plan-stale')
                destination_fd=os.open(destination,os.O_WRONLY|os.O_CREAT|os.O_EXCL,stat.S_IMODE(expected['mode']))
                with os.fdopen(destination_fd,'wb') as output, os.fdopen(source_fd,'rb',closefd=False) as stream:
                    while True:
                        chunk=stream.read(256*1024)
                        if not chunk: break
                        output.write(chunk)
                    output.flush()
                    os.fchmod(output.fileno(),stat.S_IMODE(expected['mode']))
                    os.utime(output.fileno(),ns=(expected['mtime'],expected['mtime']))
            finally: os.close(source_fd)
            if metadata(filename) != expected: fail('plan-stale')
    for relative,expected in reversed(entries):
        if expected['kind']=='directory':
            check_roots()
            check_parents(target,relative,created,created=True)
            filename=os.path.join(target,*relative.split('/')) if relative else target
            current=os.lstat(filename)
            if not stat.S_ISDIR(current.st_mode) or stat.S_ISLNK(current.st_mode) or identity(current)!=created.get(relative): fail('plan-stale')
            os.chmod(filename,stat.S_IMODE(expected['mode']))
    return None

try:
    print(encode(dict(ok=True,value=run())))
except BaseException as error:
    message=str(error)
    if not message.startswith('worktree-dependencies.'): message='worktree-dependencies.failed'
    print(encode(dict(ok=False,message=message)))
`
