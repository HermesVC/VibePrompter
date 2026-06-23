param(
    [string[]] $BaseUrls = @(
        "http://127.0.0.1:1234/v1",
        "http://127.0.0.1:11434/v1"
    ),
    [string[]] $EmbedModels = @(
        "text-embedding-nomic-embed-text-v1.5",
        "nomic-embed-text",
        "nomic-embed-text:latest"
    ),
    [string] $DockerComposeFile = "",
    [string[]] $DockerServices = @(),
    [switch] $StartContainers,
    [switch] $SkipNpmBuild,
    [switch] $SkipCargoCheck
)

$ErrorActionPreference = "Stop"

function Write-Step([string] $Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok([string] $Message) {
    Write-Host "OK  $Message" -ForegroundColor Green
}

function Write-Warn([string] $Message) {
    Write-Host "WARN $Message" -ForegroundColor Yellow
}

function Normalize-BaseUrl([string] $BaseUrl) {
    return $BaseUrl.TrimEnd("/")
}

function Invoke-JsonRequest(
    [string] $Method,
    [string] $Uri,
    [object] $Body = $null
) {
    $params = @{
        Method = $Method
        Uri = $Uri
        TimeoutSec = 20
        Headers = @{ "Accept" = "application/json" }
    }
    if ($null -ne $Body) {
        $params.ContentType = "application/json"
        $params.Body = ($Body | ConvertTo-Json -Depth 8 -Compress)
    }
    return Invoke-RestMethod @params
}

function Try-StartContainers {
    if (-not $StartContainers) {
        return
    }
    if ([string]::IsNullOrWhiteSpace($DockerComposeFile)) {
        Write-Warn "StartContainers was set, but DockerComposeFile is empty; skipping container start."
        return
    }
    if (-not (Test-Path $DockerComposeFile)) {
        Write-Warn "Docker compose file not found: $DockerComposeFile"
        return
    }

    $args = @("compose", "-f", $DockerComposeFile, "up", "-d")
    foreach ($service in $DockerServices) {
        if (-not [string]::IsNullOrWhiteSpace($service)) {
            $args += $service
        }
    }

    Write-Step "Ensuring containers are running via docker $($args -join ' ')"
    & docker @args
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose up failed with exit code $LASTEXITCODE"
    }
}

function Get-EmbeddingModelCandidates([object] $ModelsResponse, [string[]] $Fallbacks) {
    $seen = New-Object "System.Collections.Generic.HashSet[string]"
    $out = New-Object "System.Collections.Generic.List[string]"

    if ($null -ne $ModelsResponse -and $null -ne $ModelsResponse.data) {
        foreach ($item in $ModelsResponse.data) {
            $id = [string] $item.id
            if ([string]::IsNullOrWhiteSpace($id)) {
                continue
            }
            $lower = $id.ToLowerInvariant()
            if ($lower.Contains("embed") -or $lower.Contains("nomic") -or $lower.Contains("bge")) {
                if ($seen.Add($id)) {
                    [void] $out.Add($id)
                }
            }
        }
    }

    foreach ($fallback in $Fallbacks) {
        if (-not [string]::IsNullOrWhiteSpace($fallback) -and $seen.Add($fallback)) {
            [void] $out.Add($fallback)
        }
    }

    return ,$out.ToArray()
}

function Test-EmbeddingEndpoint([string] $BaseUrl, [string[]] $FallbackModels) {
    $base = Normalize-BaseUrl $BaseUrl
    $modelsUri = "$base/models"
    $embeddingsUri = "$base/embeddings"

    Write-Step "Checking models endpoint: $modelsUri"
    try {
        $models = Invoke-JsonRequest -Method "GET" -Uri $modelsUri
    } catch {
        Write-Warn "Models endpoint failed at $modelsUri : $($_.Exception.Message)"
        return $null
    }

    $candidates = Get-EmbeddingModelCandidates -ModelsResponse $models -Fallbacks $FallbackModels
    if ($candidates.Count -eq 0) {
        Write-Warn "No embedding model candidates found for $base"
        return $null
    }

    Write-Host "Candidates: $($candidates -join ', ')"
    foreach ($model in $candidates) {
        Write-Step "Testing embeddings: $embeddingsUri model=$model"
        try {
            $body = @{
                model = $model
                input = "vibeprompter embedding preflight"
            }
            $response = Invoke-JsonRequest -Method "POST" -Uri $embeddingsUri -Body $body
            $embedding = $response.data[0].embedding
            if ($null -ne $embedding -and $embedding.Count -gt 0) {
                Write-Ok "$base embeddings work with model '$model' (dims=$($embedding.Count))"
                return @{
                    BaseUrl = $base
                    Model = $model
                    Dims = $embedding.Count
                }
            }
            Write-Warn "Embeddings response did not include a vector for model '$model'"
        } catch {
            Write-Warn "Embeddings failed for model '$model': $($_.Exception.Message)"
        }
    }

    return $null
}

function Run-CheckedCommand([string] $Label, [string] $FilePath, [string[]] $Arguments, [string] $WorkingDirectory) {
    Write-Step $Label
    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$Label failed with exit code $LASTEXITCODE"
        }
        Write-Ok $Label
    } finally {
        Pop-Location
    }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

Write-Step "VibePrompter RAG/build preflight"
Try-StartContainers

$workingEmbedding = $null
foreach ($baseUrl in $BaseUrls) {
    $workingEmbedding = Test-EmbeddingEndpoint -BaseUrl $baseUrl -FallbackModels $EmbedModels
    if ($null -ne $workingEmbedding) {
        break
    }
}

if ($null -eq $workingEmbedding) {
    throw "No working OpenAI-compatible embeddings endpoint found. Checked: $($BaseUrls -join ', ')"
}

if (-not $SkipNpmBuild) {
    Run-CheckedCommand `
        -Label "npm run build" `
        -FilePath "cmd.exe" `
        -Arguments @("/d", "/c", "npm run build") `
        -WorkingDirectory $repoRoot
}

if (-not $SkipCargoCheck) {
    Run-CheckedCommand `
        -Label "cargo check --lib" `
        -FilePath "cargo.exe" `
        -Arguments @("check", "--lib") `
        -WorkingDirectory (Join-Path $repoRoot "src-tauri")
}

Write-Step "Preflight complete"
Write-Ok "Embeddings: $($workingEmbedding.BaseUrl) model=$($workingEmbedding.Model) dims=$($workingEmbedding.Dims)"
