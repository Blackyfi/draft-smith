#!/usr/bin/env pwsh
# PreToolUse hook on Bash: deny clearly-destructive commands deterministically.
# Blocks recursive-forced deletes (rm -rf / -fr / -r -f) and forced pushes
# (git push --force / -f / --force-with-lease). Emits a PreToolUse deny decision.

$ErrorActionPreference = 'SilentlyContinue'

$raw = [Console]::In.ReadToEnd()
if (-not $raw) { exit 0 }
try { $payload = $raw | ConvertFrom-Json } catch { exit 0 }

$cmd = [string]$payload.tool_input.command
if (-not $cmd) { exit 0 }

$reason = $null

# rm with both recursive and force flags (any order / combined): rm -rf, -fr, -r -f, --recursive --force
if ($cmd -match '(^|[;&|]|\s)rm\s' -and
    $cmd -match '(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|--recursive|--force|-r\b.*-f\b|-f\b.*-r\b)') {
    $reason = 'Blocked: recursive-forced "rm" deletes irreversibly. Remove specific paths explicitly, or ask the user to run it.'
}

# Forced git push.
if ($cmd -match '(^|[;&|]|\s)git\s+push\b' -and $cmd -match '(--force\b|--force-with-lease|\s-f\b)') {
    $reason = 'Blocked: forced "git push" can overwrite remote history. Push without --force, or ask the user to confirm.'
}

if ($reason) {
    $out = @{
        hookSpecificOutput = @{
            hookEventName            = 'PreToolUse'
            permissionDecision       = 'deny'
            permissionDecisionReason = $reason
        }
    }
    $out | ConvertTo-Json -Depth 6 -Compress
    exit 0
}

exit 0
