ZDOTDIR="$TERMC_USER_ZDOTDIR"
# /etc/zshrc derived HISTFILE from our ZDOTDIR; point history back at the user's own file.
if [[ -z "$HISTFILE" || "$HISTFILE" == "$TERMC_SHELL_DIR"/* ]]; then HISTFILE="$ZDOTDIR/.zsh_history"; fi
[[ -f "$ZDOTDIR/.zshrc" ]] && source "$ZDOTDIR/.zshrc"
source "$TERMC_SHELL_DIR/termc.zsh"
if [[ -o login ]]; then ZDOTDIR="$TERMC_SHELL_DIR/zsh"; fi
