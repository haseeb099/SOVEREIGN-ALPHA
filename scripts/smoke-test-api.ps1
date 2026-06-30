# Live API smoke test — hits all major endpoints
$base = "http://localhost:8000"
$results = @()

function Test-Endpoint {
    param([string]$Name, [string]$Method, [string]$Path, [object]$Body = $null, [int[]]$OkStatuses = @(200))
    try {
        $params = @{
            Uri = "$base$Path"
            Method = $Method
            UseBasicParsing = $true
            TimeoutSec = 30
        }
        if ($Body) {
            $params.ContentType = "application/json"
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
        }
        $r = Invoke-WebRequest @params
        $ok = $OkStatuses -contains $r.StatusCode
        $results += [PSCustomObject]@{ Name=$Name; Status=$r.StatusCode; OK=$ok; Detail="OK" }
        Write-Host "$(if($ok){'PASS'}else{'FAIL'}) $Name -> $($r.StatusCode)"
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        $ok = $OkStatuses -contains $code
        $results += [PSCustomObject]@{ Name=$Name; Status=$code; OK=$ok; Detail=$_.Exception.Message }
        Write-Host "$(if($ok){'PASS'}else{'FAIL'}) $Name -> $code"
    }
}

Write-Host "=== Sovereign-Alpha API Smoke Test ===" -ForegroundColor Cyan

Test-Endpoint "health" GET "/health"
Test-Endpoint "market TSLA" GET "/api/market/TSLA"
Test-Endpoint "market search" GET "/api/market/search?q=tesla&limit=5"
Test-Endpoint "assets list" GET "/api/market/assets/list"
Test-Endpoint "market history" GET "/api/market/TSLA/history?range=1mo"
Test-Endpoint "market news" GET "/api/market/TSLA/news?limit=3"
Test-Endpoint "market earnings" GET "/api/market/TSLA/earnings"
Test-Endpoint "flatfiles status" GET "/api/market/flatfiles/status"
Test-Endpoint "history TSLA" GET "/api/history/TSLA?limit=5"
Test-Endpoint "health history" GET "/api/history/TSLA/health?range=30d"
Test-Endpoint "portfolio holdings (no auth)" GET "/api/portfolio/holdings" -OkStatuses @(200, 401)
Test-Endpoint "portfolio summary (no auth)" GET "/api/portfolio/summary" -OkStatuses @(200, 401)
Test-Endpoint "library (no auth)" GET "/api/library" -OkStatuses @(200, 401)
Test-Endpoint "alerts rules (no auth)" GET "/api/alerts/rules" -OkStatuses @(200, 401)
Test-Endpoint "watchlists (no auth)" GET "/api/watchlists" -OkStatuses @(200, 401)
Test-Endpoint "community" GET "/api/v1/public/community"
Test-Endpoint "scenario preview" POST "/api/scenario/preview" @{
    ticker = "TSLA"
    scenario = @{ margin_delta = 0; rate_delta = 0; regulatory_pressure = 0 }
}
Test-Endpoint "scenario nl" POST "/api/scenario/nl" @{ text = "rates up 50bps" }
Test-Endpoint "watchlists PUT (no auth)" PUT "/api/watchlists/00000000-0000-0000-0000-000000000001" @{ tickers = @("TSLA") } -OkStatuses @(200, 401, 404)
Test-Endpoint "alerts notifications (no auth)" GET "/api/alerts/notifications" -OkStatuses @(200, 401)
Test-Endpoint "reports generate (no auth)" POST "/api/reports/generate" @{
    ticker = "TSLA"
    analysis = @{ ticker = "TSLA"; memo = @{ rating = "BULLISH"; summary = "test" } }
} -OkStatuses @(200, 401, 422)

$passed = ($results | Where-Object { $_.OK }).Count
$total = $results.Count
Write-Host "`n$passed / $total passed" -ForegroundColor $(if($passed -eq $total){"Green"}else{"Yellow"})
