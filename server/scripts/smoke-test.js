# Smoke test for HRMS demo
$ErrorActionPreference = 'Stop'

Write-Output "=== FRONTEND SMOKE TESTS ==="

$routes = @('/', '/super-admin/login', '/admin/login', '/hr/login', '/employee/login')
foreach ($route in $routes) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:5173$route" -UseBasicParsing
        $hasTitle = $r.Content -match '<title>'
        $hasLogin = $r.Content -match 'login|Login'
        Write-Output "$route -> Status: $($r.StatusCode) | Has title: $hasTitle | Has login: $hasLogin | Size: $($r.Content.Length) bytes"
    } catch {
        Write-Output "$route -> ERROR: $($_.Exception.Message)"
    }
}

Write-Output ""
Write-Output "=== BACKEND SMOKE TESTS ==="

$endpoints = @('/api/health', '/api/auth/me')
foreach ($ep in $endpoints) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:5000$ep" -UseBasicParsing
        Write-Output "$ep -> Status: $($r.StatusCode) | Body: $($r.Content)"
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Output "$ep -> Status: $statusCode | Error: $($_.Exception.Message)"
    }
}

Write-Output ""
Write-Output "=== DONE ==="
