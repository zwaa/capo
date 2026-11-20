# Dev container

A Linux container for working on Capo, set up so Claude Code can run with fewer guard rails without putting the rest of your machine at risk.

## Using it

1. Install Docker Desktop and the VS Code **Dev Containers** extension.
2. Open this folder in VS Code and run **Dev Containers: Reopen in Container**.
3. The first build takes a few minutes. It installs the prototype's packages and starts the firewall.
4. Open a terminal in VS Code and run `claude`. Sign in once; the sign-in is kept in a Docker volume across rebuilds.
5. Run the game with `cd prototype && npm run dev`. VS Code forwards port 5173 to your browser.

Inside the container you can run `claude --dangerously-skip-permissions` so Claude works without asking before each command.

## What it protects, and what it doesn't

- **Files:** Claude can only see this repository (mounted at `/workspace`) and the container itself. The rest of your disk isn't there.
- **Network:** a firewall (`init-firewall.sh`) blocks all outbound traffic except GitHub, the npm registry, Anthropic/Claude, and VS Code's own servers. It's re-applied every time the container starts.
- **Not protected: the repository itself.** Claude can still change or delete anything in this folder. Commit often.
- **Not protected: your GitHub access.** VS Code passes your git credentials into the container, so Claude can push to any repository you can. Review pushes, or sign out of git in the container if you'd rather it couldn't.
- **Not protected: anything you paste in.** Don't put secrets in the repo or the terminal.

## Notes

- To allow another site, add it to `ALLOWED_DOMAINS` in `init-firewall.sh` and rebuild. Sites are looked up when the container starts, so if one stops working (its servers moved), restart the container.
- The prototype's `node_modules` lives in a Docker volume, separate from any Windows install. Running `npm install` on Windows won't affect it.
- The repo is checked out on Windows with CRLF line endings. The container reads them as LF (`core.autocrlf input`), so files don't show up as changed.
- For faster file access you can clone the repo into a container volume instead (**Dev Containers: Clone Repository in Container Volume**). It will build from this same configuration.
