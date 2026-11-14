#!/bin/sh
set -e

# Debian's postrm runs as root under apt/dpkg, so $HOME here is root's home,
# not the desktop user's — resolve the real invoking user ourselves.
real_user="${SUDO_USER:-$(logname 2>/dev/null || true)}"

delete_config() {
  user="$1"
  home=$(getent passwd "$user" | cut -d: -f6)
  [ -n "$home" ] && [ -d "$home/.config/Docenti" ] && rm -rf "$home/.config/Docenti"
}

if [ -n "$real_user" ]; then
  delete_config "$real_user"
else
  # No reliable invoking user (e.g. unattended removal) — sweep all local
  # home directories rather than silently leaving data behind.
  for home in /home/*; do
    [ -d "$home/.config/Docenti" ] && rm -rf "$home/.config/Docenti"
  done
fi

exit 0
