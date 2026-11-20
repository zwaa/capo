# Development container for Capo, set up so Claude Code can run inside it
# with a restricted network (see init-firewall.sh).
FROM node:22-bookworm

ARG TZ=UTC
ENV TZ="$TZ"

# Tools for development, plus what the firewall script needs
# (iptables, ipset, dig, aggregate, jq).
RUN apt-get update && apt-get install -y --no-install-recommends \
    less git procps sudo fzf zsh man-db unzip gnupg2 gh \
    iptables ipset iproute2 dnsutils aggregate jq nano vim curl ca-certificates \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Global npm packages go somewhere the node user owns.
RUN mkdir -p /usr/local/share/npm-global && chown -R node:node /usr/local/share

# Persist shell history across rebuilds (a volume is mounted here).
RUN mkdir /commandhistory && touch /commandhistory/.bash_history && chown -R node /commandhistory

ENV DEVCONTAINER=true

# The workspace, Claude's config and the prototype's node_modules volume.
RUN mkdir -p /workspace/prototype/node_modules /home/node/.claude \
  && chown -R node:node /workspace /home/node/.claude
WORKDIR /workspace

USER node
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin
ENV SHELL=/bin/zsh
ENV HISTFILE=/commandhistory/.bash_history

# Claude Code. Pin a version with --build-arg CLAUDE_CODE_VERSION=x.y.z if you want.
ARG CLAUDE_CODE_VERSION=latest
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# The firewall runs as root at container start. The node user may run it,
# and fix ownership of the node_modules volume, through sudo, and nothing else.
COPY init-firewall.sh /usr/local/bin/
USER root
RUN chmod +x /usr/local/bin/init-firewall.sh \
  && printf '%s\n' \
    'node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh' \
    'node ALL=(root) NOPASSWD: /usr/bin/chown node\:node /workspace/prototype/node_modules' \
    > /etc/sudoers.d/node-devcontainer \
  && chmod 0440 /etc/sudoers.d/node-devcontainer
USER node
