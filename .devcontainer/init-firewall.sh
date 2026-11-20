#!/bin/bash
# Default-deny outbound firewall for the dev container.
# Only GitHub, npm, Anthropic/Claude and VS Code services are reachable.
# Domains are resolved to IPs when this runs (at each container start), so a
# service that moves to new IPs needs a container restart.
set -euo pipefail
IFS=$'\n\t'

ALLOWED_DOMAINS=(
  # Claude Code: API, sign-in, telemetry and error reports
  api.anthropic.com
  claude.ai
  console.anthropic.com
  platform.claude.com
  statsig.anthropic.com
  statsig.com
  sentry.io
  # Packages
  registry.npmjs.org
  # VS Code server and extensions
  marketplace.visualstudio.com
  vscode.blob.core.windows.net
  update.code.visualstudio.com
)

# Keep Docker's internal DNS rules before flushing everything.
DOCKER_DNS_RULES=$(iptables-save -t nat | grep "127\.0\.0\.11" || true)

iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X
ipset destroy allowed-domains 2>/dev/null || true

if [ -n "$DOCKER_DNS_RULES" ]; then
  echo "Restoring Docker DNS rules"
  iptables -t nat -N DOCKER_OUTPUT 2>/dev/null || true
  iptables -t nat -N DOCKER_POSTROUTING 2>/dev/null || true
  echo "$DOCKER_DNS_RULES" | xargs -L 1 iptables -t nat
fi

# DNS, SSH (for git) and loopback are always allowed.
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A INPUT -p udp --sport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

ipset create allowed-domains hash:net

# GitHub publishes its address ranges.
echo "Fetching GitHub IP ranges"
gh_ranges=$(curl -s --connect-timeout 10 https://api.github.com/meta)
if [ -z "$gh_ranges" ] || ! echo "$gh_ranges" | jq -e '.web and .api and .git' >/dev/null; then
  echo "ERROR: could not fetch GitHub IP ranges" >&2
  exit 1
fi
while read -r cidr; do
  if [[ "$cidr" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/[0-9]{1,2}$ ]]; then
    ipset add -exist allowed-domains "$cidr"
  fi
done < <(echo "$gh_ranges" | jq -r '(.web + .api + .git)[]' | grep -v ':' | aggregate -q)

for domain in "${ALLOWED_DOMAINS[@]}"; do
  ips=$(dig +noall +answer A "$domain" | awk '$4 == "A" {print $5}')
  if [ -z "$ips" ]; then
    echo "WARNING: could not resolve $domain, skipping" >&2
    continue
  fi
  while read -r ip; do
    if [[ "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
      ipset add -exist allowed-domains "$ip"
    fi
  done <<< "$ips"
done

# The host network (Docker Desktop, VS Code's port forwarding).
HOST_IP=$(ip route | grep default | cut -d" " -f3)
if [ -z "$HOST_IP" ]; then
  echo "ERROR: could not detect the host IP" >&2
  exit 1
fi
HOST_NETWORK=$(echo "$HOST_IP" | sed "s/\.[0-9]*$/.0\/24/")
iptables -A INPUT -s "$HOST_NETWORK" -j ACCEPT
iptables -A OUTPUT -d "$HOST_NETWORK" -j ACCEPT

# Default deny; allow replies and the allowlist.
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT
iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited

# Check it works both ways.
if curl --connect-timeout 5 -s https://example.com >/dev/null 2>&1; then
  echo "ERROR: firewall check failed: example.com is reachable" >&2
  exit 1
fi
if ! curl --connect-timeout 5 -s https://api.github.com/zen >/dev/null 2>&1; then
  echo "ERROR: firewall check failed: api.github.com is not reachable" >&2
  exit 1
fi
echo "Firewall is up: outbound traffic is limited to the allowlist."
