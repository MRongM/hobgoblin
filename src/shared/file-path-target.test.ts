import { describe, expect, test } from 'vitest'
import { editorTargetPathArgument, filePathTargetsForText, parseFilePathTarget } from '#/shared/file-path-target.ts'

describe('parseFilePathTarget', () => {
  test('accepts relative paths with optional line and column targets', () => {
    expect(parseFilePathTarget('src/app.ts')).toEqual({ path: 'src/app.ts' })
    expect(parseFilePathTarget('./src/app.ts')).toEqual({ path: 'src/app.ts' })
    expect(parseFilePathTarget('"docs/guide.md",')).toEqual({ path: 'docs/guide.md' })
    expect(parseFilePathTarget('src/app.ts:12')).toEqual({ path: 'src/app.ts', line: 12 })
    expect(parseFilePathTarget('src/app.ts:12:3')).toEqual({ path: 'src/app.ts', line: 12, column: 3 })
  })

  test('rejects unsafe or ambiguous path targets', () => {
    expect(parseFilePathTarget('')).toBeNull()
    expect(parseFilePathTarget('https://example.com/src/app.ts')).toBeNull()
    expect(parseFilePathTarget('/repo/src/app.ts')).toBeNull()
    expect(parseFilePathTarget('C:\\repo\\src\\app.ts')).toBeNull()
    expect(parseFilePathTarget('../src/app.ts')).toBeNull()
    expect(parseFilePathTarget('src/../app.ts')).toBeNull()
    expect(parseFilePathTarget('src/app.ts:0')).toBeNull()
    expect(parseFilePathTarget('src/app.ts:12:0')).toBeNull()
    expect(parseFilePathTarget('src/app.ts:12:')).toBeNull()
  })

  test('keeps absolute paths disabled by default', () => {
    expect(parseFilePathTarget('C:\\repo\\src\\app.ts:12')).toBeNull()
    expect(parseFilePathTarget('/repo/src/app.ts:12')).toBeNull()
  })

  test.each(['README', 'LICENSE', 'Dockerfile', 'Makefile', '.env', '.env.local', '.gitignore', '.editorconfig'])(
    'accepts known text basenames without a directory: %s',
    (name) => {
      expect(parseFilePathTarget(name)).toEqual({ path: name })
      expect(parseFilePathTarget(`./${name}:4`)).toEqual({ path: name, line: 4 })
    },
  )

  test('accepts Windows and POSIX absolute paths when explicitly enabled', () => {
    expect(parseFilePathTarget('C:\\repo\\src\\app.ts:12', { allowAbsolute: true })).toEqual({
      path: 'C:\\repo\\src\\app.ts',
      line: 12,
    })
    expect(parseFilePathTarget('C:/repo/src/app.ts:12:3', { allowAbsolute: true })).toEqual({
      path: 'C:/repo/src/app.ts',
      line: 12,
      column: 3,
    })
    expect(parseFilePathTarget('/repo/src/app.ts:12', { allowAbsolute: true })).toEqual({
      path: '/repo/src/app.ts',
      line: 12,
    })
  })

  test('does not accept UNC paths as terminal file targets', () => {
    expect(parseFilePathTarget('\\\\server\\share\\repo\\src\\app.ts', { allowAbsolute: true })).toBeNull()
  })
})

describe('filePathTargetsForText', () => {
  test.each(['README', 'LICENSE', 'Dockerfile', 'Makefile', '.env', '.env.local', '.gitignore', '.editorconfig'])(
    'recognizes standalone and dot-relative known text files: %s',
    (name) => {
      const token = `./${name}:4`
      expect(filePathTargetsForText(`see ${name} and ${token}`)).toEqual([
        { text: name, target: { path: name }, startIndex: 4, endIndex: 4 + name.length },
        {
          text: token,
          target: { path: name, line: 4 },
          startIndex: 9 + name.length,
          endIndex: 9 + name.length + token.length,
        },
      ])
    },
  )

  test('limits standalone name recognition to known files and keeps URLs excluded', () => {
    expect(filePathTargetsForText('see ordinary words READMEs Dockerfiles .unknown')).toEqual([])
    expect(
      filePathTargetsForText('https://example.test/README http://localhost:3000/.env', { allowAbsolute: true }),
    ).toEqual([])
    expect(filePathTargetsForText('readme .ENV.LOCAL').map((span) => span.target)).toEqual([
      { path: 'readme' },
      { path: '.ENV.LOCAL' },
    ])
  })

  test('finds path-like spans and preserves offsets', () => {
    expect(filePathTargetsForText('see src/app.ts:12 and ./docs/guide.md')).toEqual([
      { text: 'src/app.ts:12', target: { path: 'src/app.ts', line: 12 }, startIndex: 4, endIndex: 17 },
      { text: './docs/guide.md', target: { path: 'docs/guide.md' }, startIndex: 22, endIndex: 37 },
    ])
  })

  test('stops path-like spans before CJK punctuation', () => {
    expect(
      filePathTargetsForText('关键规则在 backend/app/kooky_agent_runtime/services/im_group/final_ai_text.py:10：'),
    ).toEqual([
      {
        text: 'backend/app/kooky_agent_runtime/services/im_group/final_ai_text.py:10',
        target: { path: 'backend/app/kooky_agent_runtime/services/im_group/final_ai_text.py', line: 10 },
        startIndex: 6,
        endIndex: 75,
      },
    ])
  })

  test('recognizes path-like spans after CJK labels and separators', () => {
    expect(
      filePathTargetsForText(
        [
          '- stream 消费并保存最后 values：backend/app/kooky_agent_runtime/services/im_group/remote.py:140',
          '  - callback 优先取 stream values：backend/app/kooky_agent_runtime/services/im_group/callback.py:787',
          '  - 最终文本选择：backend/app/kooky_agent_runtime/services/im_group/final_reply_selector.py:208',
        ].join('\n'),
      ),
    ).toEqual([
      {
        text: 'backend/app/kooky_agent_runtime/services/im_group/remote.py:140',
        target: { path: 'backend/app/kooky_agent_runtime/services/im_group/remote.py', line: 140 },
        startIndex: 24,
        endIndex: 87,
      },
      {
        text: 'backend/app/kooky_agent_runtime/services/im_group/callback.py:787',
        target: { path: 'backend/app/kooky_agent_runtime/services/im_group/callback.py', line: 787 },
        startIndex: 119,
        endIndex: 184,
      },
      {
        text: 'backend/app/kooky_agent_runtime/services/im_group/final_reply_selector.py:208',
        target: { path: 'backend/app/kooky_agent_runtime/services/im_group/final_reply_selector.py', line: 208 },
        startIndex: 196,
        endIndex: 273,
      },
    ])
  })

  test('recognizes quoted and bracketed path-like spans', () => {
    expect(filePathTargetsForText('see `src/app.ts:12` and (docs/guide.md:3)')).toEqual([
      { text: 'src/app.ts:12', target: { path: 'src/app.ts', line: 12 }, startIndex: 5, endIndex: 18 },
      { text: 'docs/guide.md:3', target: { path: 'docs/guide.md', line: 3 }, startIndex: 25, endIndex: 40 },
    ])
  })

  test('recognizes Python traceback file line references', () => {
    expect(filePathTargetsForText('File "backend/app/main.py", line 42, in run')).toEqual([
      {
        text: 'backend/app/main.py", line 42',
        target: { path: 'backend/app/main.py', line: 42 },
        startIndex: 6,
        endIndex: 35,
      },
    ])
  })

  test('stops adjacent path-like spans before ASCII punctuation', () => {
    expect(filePathTargetsForText('src/app.ts:12, docs/guide.md:3;')).toEqual([
      { text: 'src/app.ts:12', target: { path: 'src/app.ts', line: 12 }, startIndex: 0, endIndex: 13 },
      { text: 'docs/guide.md:3', target: { path: 'docs/guide.md', line: 3 }, startIndex: 15, endIndex: 30 },
    ])
  })

  test('does not treat localhost URLs as path-like spans', () => {
    expect(filePathTargetsForText('open localhost:3000/src/app.ts and http://localhost:3000/src/app.ts')).toEqual([])
  })

  test('recognizes path-like spans split by a hard line break after a directory slash', () => {
    expect(
      filePathTargetsForText(
        [
          'members: backend/app/kooky_opt/one_person_team/services/team_service.py:509 -> backend/app/kooky_opt/',
          'one_person_team/repositories/agents.py:45、backend/app/kooky_opt/one_person_team/rules/team_policy.py:113',
        ].join('\n'),
      ),
    ).toEqual([
      {
        text: 'backend/app/kooky_opt/one_person_team/services/team_service.py:509',
        target: { path: 'backend/app/kooky_opt/one_person_team/services/team_service.py', line: 509 },
        startIndex: 9,
        endIndex: 75,
      },
      {
        text: 'backend/app/kooky_opt/\none_person_team/repositories/agents.py:45',
        target: { path: 'backend/app/kooky_opt/one_person_team/repositories/agents.py', line: 45 },
        startIndex: 79,
        endIndex: 143,
      },
      {
        text: 'backend/app/kooky_opt/one_person_team/rules/team_policy.py:113',
        target: { path: 'backend/app/kooky_opt/one_person_team/rules/team_policy.py', line: 113 },
        startIndex: 144,
        endIndex: 206,
      },
    ])
  })

  test('finds absolute path spans only when explicitly enabled', () => {
    expect(filePathTargetsForText('at C:\\repo\\src\\app.ts:12')).toEqual([])
    expect(filePathTargetsForText('at C:\\repo\\src\\app.ts:12', { allowAbsolute: true })).toEqual([
      {
        text: 'C:\\repo\\src\\app.ts:12',
        target: { path: 'C:\\repo\\src\\app.ts', line: 12 },
        startIndex: 3,
        endIndex: 24,
      },
    ])
  })

  test.each(['/tmp/my reports/guide.md:12:3', 'C:\\reports folder\\guide.md:12:3'])(
    'keeps a quoted absolute path with spaces as one target: %s',
    (path) => {
      const text = `created "${path}"`
      expect(filePathTargetsForText(text, { allowAbsolute: true })).toEqual([
        {
          text: path,
          target: { path: path.slice(0, -5), line: 12, column: 3 },
          startIndex: 9,
          endIndex: 9 + path.length,
        },
      ])
    },
  )

  test.each(['/tmp/reports/\n  guide.md:12', 'C:\\reports\\\n  guide.md:12'])(
    'recognizes a hard-wrapped absolute target: %s',
    (path) => {
      expect(filePathTargetsForText(path, { allowAbsolute: true })).toEqual([
        {
          text: path,
          target: { path: path.replace('\n  ', '').slice(0, -3), line: 12 },
          startIndex: 0,
          endIndex: path.length,
        },
      ])
    },
  )

  test('does not recognize URL paths when absolute file paths are enabled', () => {
    expect(
      filePathTargetsForText('https://example.test/report.md http://localhost:3000/src/app.ts file:///tmp/report.md', {
        allowAbsolute: true,
      }),
    ).toEqual([])
  })
})

describe('editorTargetPathArgument', () => {
  test('adds line and column only when a line target exists', () => {
    expect(editorTargetPathArgument({ path: '/repo/src/app.ts' })).toBe('/repo/src/app.ts')
    expect(editorTargetPathArgument({ path: '/repo/src/app.ts', line: 12 })).toBe('/repo/src/app.ts:12')
    expect(editorTargetPathArgument({ path: '/repo/src/app.ts', line: 12, column: 3 })).toBe('/repo/src/app.ts:12:3')
  })
})
