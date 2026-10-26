# TermC shell integration for bash.
if [ -f "$HOME/.bash_profile" ]; then . "$HOME/.bash_profile"
elif [ -f "$HOME/.bash_login" ]; then . "$HOME/.bash_login"
elif [ -f "$HOME/.profile" ]; then . "$HOME/.profile"; fi
[ -f "$HOME/.bashrc" ] && [ -z "$_TERMC_RC" ] && { _TERMC_RC=1; . "$HOME/.bashrc"; }
_termc_alias_mtime=""
_termc_load_aliases() {
  local f="$TERMC_HOME/aliases.bash" m
  [ -f "$f" ] || return
  m=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f")
  [ "$m" = "$_termc_alias_mtime" ] && return
  _termc_alias_mtime="$m"
  declare -F _termc_clear_aliases >/dev/null && _termc_clear_aliases
  . "$f"
}
_termc_precmd() {
  local ec=$?
  builtin printf '\e]133;D;%s\a\e]1337;CurrentDir=%s\a' "$ec" "$PWD"
  _termc_load_aliases
  builtin printf '\e]133;A\a'
  return $ec
}
PROMPT_COMMAND="_termc_precmd${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
PS0='\[\e]133;C\a\]'"${PS0:-}"
