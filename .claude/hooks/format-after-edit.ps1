#!/usr/bin/env pwsh
# PostToolUse hook: format (always) + lint (surface findings) the file Claude just edited.
# Defensive: no-ops cleanly if the toolchain/project isn't present yet (pre-M0).
# Formatting is blocking + fast (file-scoped). Linting is surfaced as context, never hard-blocks edits.

$ErrorActionPreference = 'SilentlyContinue'

# --- read hook payload from stdin ---
$raw = [Console]::In.ReadToEnd()
if (-not $raw) { exit 0 }
try { $payload = $raw | ConvertFrom-Json } catch { exit 0 }

$file = $payload.tool_input.file_path
if (-not $file) { exit 0 }
if (-not (Test-Path $file)) { exit 0 }

$ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
$findings = @()

function Have($name) { return [bool](Get-Command $name -ErrorAction SilentlyContinue) }

switch -Regex ($ext) {
    '\.rs$' {
        # Format the single file via rustfmt (fast, file-scoped).
        if (Have 'rustfmt') { & rustfmt --edition 2021 -- "$file" 2>$null }
        elseif (Have 'cargo') { & cargo fmt 2>$null }
        # Lint: clippy is crate-level; surface findings without blocking the edit.
        if ((Have 'cargo') -and (Test-Path 'src-tauri/Cargo.toml')) {
            Push-Location 'src-tauri'
            $clip = & cargo clippy --quiet --all-targets -- -D warnings 2>&1
            if ($LASTEXITCODE -ne 0) { $findings += "clippy:`n$($clip -join "`n")" }
            Pop-Location
        }
    }
    '\.(ts|tsx|js|jsx)$' {
        # Format with prettier (file-scoped), then lint with eslint (file-scoped).
        if (Have 'npx') {
            & npx --no-install prettier --write "$file" 2>$null
            $es = & npx --no-install eslint "$file" 2>&1
            if ($LASTEXITCODE -ne 0) { $findings += "eslint:`n$($es -join "`n")" }
        }
    }
    default { exit 0 }
}

# Surface lint findings back to the model as non-blocking context.
if ($findings.Count -gt 0) {
    $ctx = "Lint findings on $file (please fix to keep the tree clippy/eslint clean):`n" + ($findings -join "`n`n")
    $out = @{ hookSpecificOutput = @{ hookEventName = 'PostToolUse'; additionalContext = $ctx } }
    $out | ConvertTo-Json -Depth 6 -Compress
}
exit 0
