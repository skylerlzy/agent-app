@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   agent-app 一键启动（Docker）
echo ============================================
echo.

where docker >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 docker 命令。
    echo 请先安装 Docker Desktop 并确保已启动：
    echo   https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

if not exist ".env.local" (
    echo [提示] 当前目录下没有 .env.local 文件。
    echo 请在本机将 .env.sample 复制为 .env.local，按说明填入 Clerk / Convex / DashScope 等密钥后，再重新运行本脚本。
    echo.
    pause
    exit /b 1
)

echo 正在启动（首次会执行 npm ci，请稍候）…
echo 浏览器打开: http://localhost:3000
echo 按 Ctrl+C 可停止服务。
echo.

docker compose up

pause
