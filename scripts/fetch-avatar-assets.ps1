# fetch-avatar-assets.ps1
# ------------------------------------------------------------------
# Downloads, SHA-256 verifies, and extracts the Wilbur signalling
# bundle and the UE5 avatar engine from the public release repo into
# %LOCALAPPDATA%\edututor\avatar\.
#
# Ports the logic from desktop/main.mjs ensureUE5Downloaded() (lines
# 252-345) and ensureWilburDownloaded() (around line 364+) into a
# standalone PowerShell script so the assets can be staged outside
# the Electron launcher (CI smoke-test, dev-stack bring-up, manual
# cache priming, etc.).
#
# Cache layout (matches what desktop/main.mjs reads at runtime):
#   %LOCALAPPDATA%\edututor\avatar\wilbur\wilbur.bundle.cjs
#   %LOCALAPPDATA%\edututor\avatar\wilbur\.bundle-version
#   %LOCALAPPDATA%\edututor\avatar\ue5\SlovakEdu.exe
#   %LOCALAPPDATA%\edututor\avatar\ue5\.bundle-version
# ------------------------------------------------------------------

param(
    [switch]$SkipDownload,
    [switch]$ForceRedownload,
    [switch]$WilburOnly
)

# ---- Constants ---------------------------------------------------
# Pinned to v0.5.1 -- the only published tag that carries both the
# wilbur-bundle-*.zip and ue5-engine-*.zip release assets. Bumping
# this requires that the matching .zip + .sha256 pair exists on the
# GitHub release page, otherwise download will 404.
$AVATAR_VERSION = '0.5.1'
$RELEASE_URL = "https://github.com/sorrywecann/edututor-ai/releases/download/v$AVATAR_VERSION"
$CACHE_ROOT = Join-Path $env:LOCALAPPDATA 'edututor\avatar'

# Fail fast on any uncaught error so the outer try/catch reports it
# with an actionable hint, instead of silently producing a broken
# half-extracted cache.
$ErrorActionPreference = 'Stop'

# ---- Helpers -----------------------------------------------------

function Write-Step($msg) {
    # Single info-log helper so all messages are uniformly tagged
    # and easy to grep in launcher.log style transcripts.
    Write-Host "[fetch-avatar-assets] $msg"
}

function Format-Size($bytes) {
    # Human-readable size used in the final summary. Keeps output
    # compact even for the ~700 MB UE5 zip.
    if ($bytes -ge 1GB) { return "{0:N2} GB" -f ($bytes / 1GB) }
    if ($bytes -ge 1MB) { return "{0:N1} MB" -f ($bytes / 1MB) }
    if ($bytes -ge 1KB) { return "{0:N0} KB" -f ($bytes / 1KB) }
    return "$bytes B"
}

function Get-AssetIfMissing {
    param(
        [Parameter(Mandatory = $true)] [string] $AssetName,    # e.g. 'wilbur-bundle-0.5.1.zip'
        [Parameter(Mandatory = $true)] [string] $DestSubdir,   # e.g. 'wilbur'  (under $CACHE_ROOT)
        [Parameter(Mandatory = $true)] [string] $MarkerFile    # e.g. 'wilbur.bundle.cjs' - presence proves extraction succeeded
    )

    $dest = Join-Path $CACHE_ROOT $DestSubdir
    $marker = Join-Path $dest '.bundle-version'
    $markerFilePath = Join-Path $dest $MarkerFile
    $tmpZip = Join-Path $CACHE_ROOT $AssetName
    $tmpHash = "$tmpZip.sha256"

    # ---- Cache-hit short-circuit --------------------------------
    # Three things must all be true for us to trust the cache:
    #   1. The bundle-version marker exists
    #   2. It matches the version this script is pinned to
    #   3. The extraction marker file (e.g. wilbur.bundle.cjs) is on disk
    # Any one missing => fall through to re-download.
    if ((Test-Path $marker) -and (Test-Path $markerFilePath)) {
        try {
            $cachedVersion = (Get-Content $marker -Raw).Trim()
            if ($cachedVersion -eq $AVATAR_VERSION) {
                Write-Step "[$AssetName] cache hit version $AVATAR_VERSION"
                return
            }
            Write-Step "[$AssetName] cache version=$cachedVersion != $AVATAR_VERSION -- re-downloading"
        } catch {
            Write-Step "[$AssetName] cache marker unreadable -- re-downloading"
        }
    }

    # Ensure the cache root exists before we drop temp files into it.
    if (-not (Test-Path $CACHE_ROOT)) {
        New-Item -ItemType Directory -Path $CACHE_ROOT -Force | Out-Null
    }

    # ---- 1. Fetch expected SHA-256 (small text file) ------------
    # Format on GitHub releases is "<hex>  <filename>" -- we split on
    # whitespace and take the first token. If this fetch fails we
    # abort: an unverified ~700 MB download is not worth attempting.
    $sha256Url = "$RELEASE_URL/$AssetName.sha256"
    Write-Step "[$AssetName] fetching SHA-256 from $sha256Url"
    if (Test-Path $tmpHash) { Remove-Item $tmpHash -Force }
    try {
        Invoke-WebRequest -Uri $sha256Url -OutFile $tmpHash -UseBasicParsing
    } catch {
        $errMsg = $_.Exception.Message
        throw "Cannot reach ${sha256Url}: $errMsg"
    }
    $expectedHash = ((Get-Content $tmpHash -Raw).Trim() -split '\s+')[0]
    Remove-Item $tmpHash -Force
    if (-not $expectedHash) {
        throw "SHA-256 file for $AssetName was empty"
    }
    Write-Step "[$AssetName] expected sha256=$expectedHash"

    # ---- 2. Download the zip ------------------------------------
    # Invoke-WebRequest -UseBasicParsing shows a built-in progress
    # bar in interactive sessions. We delete any pre-existing tmp
    # zip to avoid Invoke-WebRequest refusing to overwrite or
    # appending mid-stream.
    $zipUrl = "$RELEASE_URL/$AssetName"
    Write-Step "Stahujem $AssetName z $zipUrl"
    if (Test-Path $tmpZip) { Remove-Item $tmpZip -Force }
    try {
        Invoke-WebRequest -Uri $zipUrl -OutFile $tmpZip -UseBasicParsing
    } catch {
        if (Test-Path $tmpZip) { Remove-Item $tmpZip -Force }
        $errMsg = $_.Exception.Message
        throw "Cannot reach ${zipUrl}: $errMsg"
    }
    $downloadedBytes = (Get-Item $tmpZip).Length
    Write-Step "[$AssetName] downloaded $(Format-Size $downloadedBytes)"

    # ---- 3. Verify SHA-256 --------------------------------------
    # Mismatch => the download is corrupt OR the release was
    # re-cut without updating the .sha256. Either way we delete
    # the bad file and tell the operator to re-run with
    # -ForceRedownload (which nukes the whole cache root).
    Write-Step "[$AssetName] verifying SHA-256..."
    $actualHash = (Get-FileHash -Algorithm SHA256 -Path $tmpZip).Hash.ToLower()
    if ($actualHash -ne $expectedHash.ToLower()) {
        Remove-Item $tmpZip -Force
        throw "SHA_MISMATCH: $AssetName expected=$expectedHash got=$actualHash"
    }
    Write-Step "[$AssetName] sha256 verified OK"

    # ---- 4. Extract into destination ----------------------------
    # We wipe the destination first so stale files from a previous
    # bundle version do not leak into the new one. Expand-Archive
    # is the PowerShell equivalent of tar -xf for .zip files.
    if (Test-Path $dest) {
        Write-Step "[$AssetName] clearing previous cache at $dest"
        Remove-Item $dest -Recurse -Force
    }
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    Write-Step "[$AssetName] extracting to $dest"
    Expand-Archive -Path $tmpZip -DestinationPath $dest -Force

    # ---- 5. Write marker + cleanup ------------------------------
    # The marker is what cache-hit checks read on the next run.
    # Without it, every invocation would re-download.
    Set-Content -Path $marker -Value $AVATAR_VERSION -Encoding utf8
    Remove-Item $tmpZip -Force

    # Confirm the extraction marker exists -- otherwise the zip
    # was structurally wrong and the next cache-hit check would
    # silently re-download forever.
    if (-not (Test-Path $markerFilePath)) {
        throw "Extracted $AssetName but marker file '$MarkerFile' is missing under $dest"
    }
    Write-Step "[$AssetName] cached OK ($(Format-Size $downloadedBytes) downloaded)"
}

# ---- Main --------------------------------------------------------
try {
    Write-Step "version=$AVATAR_VERSION  cache=$CACHE_ROOT"

    # -ForceRedownload nukes the whole cache root so every asset
    # is fetched and verified afresh. Use this when SHA mismatch
    # warnings persist or when the release was re-cut.
    if ($ForceRedownload) {
        if (Test-Path $CACHE_ROOT) {
            Write-Step "-ForceRedownload -- deleting $CACHE_ROOT"
            Remove-Item $CACHE_ROOT -Recurse -Force
        }
    }

    # -SkipDownload is for CI smoke tests / offline dev where the
    # cache is known to already be populated. We do NOT verify the
    # cache contents here -- that is the caller's responsibility.
    if ($SkipDownload) {
        Write-Step "skipping (cache may be incomplete)"
        exit 0
    }

    # Wilbur is the small (~3 MB) signalling bundle. Always fetched.
    Get-AssetIfMissing -AssetName "wilbur-bundle-$AVATAR_VERSION.zip" `
        -DestSubdir 'wilbur' `
        -MarkerFile 'wilbur.bundle.cjs'

    # UE5 engine is the ~700 MB heavy asset. -WilburOnly is the
    # escape hatch for frontend-only dev sessions that don't need
    # the avatar renderer locally.
    if (-not $WilburOnly) {
        Get-AssetIfMissing -AssetName "ue5-engine-$AVATAR_VERSION.zip" `
            -DestSubdir 'ue5' `
            -MarkerFile 'SlovakEdu.exe'
    } else {
        Write-Step "-WilburOnly -- skipping UE5 engine"
    }

    # ---- Final summary --------------------------------------
    # Walk every cached subdir and report total bytes on disk
    # so the operator can sanity-check the cache size.
    Write-Step '----------------------------------------'
    Write-Step 'Cache summary:'
    Get-ChildItem -Path $CACHE_ROOT -Directory | ForEach-Object {
        $sizeBytes = (Get-ChildItem -Path $_.FullName -Recurse -File -ErrorAction SilentlyContinue |
                      Measure-Object -Property Length -Sum).Sum
        if (-not $sizeBytes) { $sizeBytes = 0 }
        Write-Step "  $($_.Name)  =>  $(Format-Size $sizeBytes)"
    }
    Write-Step 'done.'
}
catch {
    $msg = $_.Exception.Message
    Write-Host ''
    Write-Host '================================================================'
    Write-Host '[fetch-avatar-assets] FAILED'
    Write-Host '================================================================'

    # Pick the most actionable hint based on the exception text.
    if ($msg -like '*SHA_MISMATCH*') {
        Write-Host "Asset corrupted (SHA mismatch). Run with -ForceRedownload to retry."
    }
    elseif ($msg -like '*Cannot reach*') {
        Write-Host "Cannot reach $RELEASE_URL. Run with -SkipDownload to use existing cache."
    }
    else {
        Write-Host "Avatar asset download failed. Check internet connection."
    }

    Write-Host ''
    Write-Host "Detailed log: $msg"
    Write-Host ''
    exit 1
}
