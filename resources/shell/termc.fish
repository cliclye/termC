# TermC shell integration for fish.
set -g _termc_alias_mtime ""
function _termc_load_aliases
    set -l f "$TERMC_HOME/aliases.fish"
    test -f "$f"; or return
    set -l m (stat -f %m "$f" 2>/dev/null; or stat -c %Y "$f")
    test "$m" = "$_termc_alias_mtime"; and return
    set -g _termc_alias_mtime $m
    functions -q _termc_clear_aliases; and _termc_clear_aliases
    source "$f"
end
function _termc_prompt --on-event fish_prompt
    printf '\e]1337;CurrentDir=%s\a' "$PWD"
    _termc_load_aliases
    printf '\e]133;A\a'
end
function _termc_preexec --on-event fish_preexec
    printf '\e]133;C\a'
end
function _termc_postexec --on-event fish_postexec
    printf '\e]133;D;%s\a' $status
end
