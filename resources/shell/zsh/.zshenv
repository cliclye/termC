# TermC shell integration: load the user's startup files, then ours.
ZDOTDIR="${TERMC_USER_ZDOTDIR:-$HOME}"
[[ -f "$ZDOTDIR/.zshenv" ]] && source "$ZDOTDIR/.zshenv"
TERMC_USER_ZDOTDIR="$ZDOTDIR"
ZDOTDIR="$TERMC_SHELL_DIR/zsh"
