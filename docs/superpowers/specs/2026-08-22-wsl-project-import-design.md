# WSL Project Import Design

## Goal

Allow both Windows desktop packages to import a Git repository or multi-repository workspace stored in a registered WSL distribution. Repository, file, worktree, and terminal operations execute inside that distribution and retain Linux path semantics.

## Identity

A WSL project uses the stable opaque identifier `wsl://<encoded-distribution>/<encoded-linux-path>`. The distribution name and normalized absolute Linux path are retained independently from Windows UNC paths. Child repositories discovered below a WSL workspace inherit the same WSL transport and distribution.

Saved recent-project and session entries retain this identity so restoring a project never silently converts it into an SSH or Windows-local project.

## Import

The ordinary repository-open dialog offers local and WSL sources. On a Windows host, every project-open surface also exposes an explicit **Open WSL project…** shortcut. The shortcut opens that same dialog with WSL preselected; it does not introduce a second import flow or persist the selection.

WSL import lists registered distributions, accepts an absolute Linux path, and submits the opaque WSL project identifier through the existing workspace-open flow.

The server revalidates that WSL is usable and that the selected distribution remains registered. Missing WSL and distribution drift return actionable errors.

## Execution

WSL projects reuse the existing remote command protocol and repository backend. Commands are launched as structured arguments through the absolute system `wsl.exe`:

```text
wsl.exe --distribution <distribution> --exec sh -lc <generated-script>
```

The existing command builder continues to own shell quoting and validation. No repository path is interpolated by the Windows command shell.

This routing applies to repository discovery, Git reads and writes, file-tree reads and writes, file transfer, branch workspaces, tmux actions, and internal terminals. External Windows Terminal opens the exact distribution with `--cd`; VS Code-family editors use their `wsl+<distribution>` remote authority.

Branch workspace reconciliation treats an exact `isPrunable` Git worktree registration as missing materialization instead of a readable member. An explicit repair plan records that exact stale path, prunes it through the repository backend during execution, and only then recreates the worktree. Planning and ordinary batch Git reads remain read-only, a mismatched path is never pruned, and a cleanup failure prevents recreation.

## Boundaries

- Windows UNC paths such as `\\wsl$\...` are not persisted as project identity.
- Windows Git and Windows filesystem traversal do not operate on WSL projects.
- WSL remains a local execution transport; it does not require SSH configuration or an SSH daemon.
- SSH project behavior and existing saved SSH identities remain unchanged.

## Verification

- Shared identity tests cover normalization, parsing, child derivation, and session retention.
- Command tests cover WSL Git and internal-terminal invocations.
- Dialog tests cover distribution selection and opaque WSL project submission.
- Branch workspace tests cover prunable-member drift projection, repair planning, and cleanup-before-recreate ordering in both Windows packages.
- A Windows/WSL integration check creates a temporary Linux Git workspace and verifies direct repository probing and workspace child discovery preserve `wsl://` identities.
