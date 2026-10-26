# TermC hooks: cwd + command lifecycle reporting and hot-reloaded aliases.
[[ -n "$_TERMC_LOADED" ]] && return
_TERMC_LOADED=1
autoload -Uz add-zsh-hook
zmodload -F zsh/stat b:zstat 2>/dev/null
_termc_alias_mtime=""
_termc_load_aliases() {
  local f="$TERMC_HOME/aliases.zsh" m
  [[ -f "$f" ]] || return
  m=$(zstat +mtime "$f" 2>/dev/null || stat -f %m "$f")
  [[ "$m" == "$_termc_alias_mtime" ]] && return
  _termc_alias_mtime="$m"
  (( $+functions[_termc_clear_aliases] )) && _termc_clear_aliases
  source "$f"
}
_termc_precmd() {
  local ec=$?
  builtin printf '\e]133;D;%s\a\e]1337;CurrentDir=%s\a' "$ec" "$PWD"
  _termc_load_aliases
  builtin printf '\e]133;A\a'
}
_termc_preexec() { builtin printf '\e]133;C\a'; }
add-zsh-hook precmd _termc_precmd
add-zsh-hook preexec _termc_preexec
_termc_load_aliases
