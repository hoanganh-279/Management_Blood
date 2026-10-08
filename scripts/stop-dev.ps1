# Free dev ports (default 5173 = Vite, 8000 = FastAPI).
# Use when "Port 5173 is already in use" because an old process is still running.
param(
    [int[]]$Ports = @(5173, 8000)
)

function Stop-Tree([int]$procId) {
    Get-CimInstance Win32_Process -Filter "ParentProcessId=$procId" -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Tree $_.ProcessId }
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}

foreach ($port in $Ports) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if (-not $conns) {
        Write-Host "Port ${port}: free"
        continue
    }
    foreach ($procId in ($conns.OwningProcess | Sort-Object -Unique)) {
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        Write-Host "Port ${port}: stopping $($proc.ProcessName) (PID $procId)"
        Stop-Tree $procId
    }
}
