import { spawn } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const isWindows = process.platform === "win32";
const pythonExe = isWindows
  ? resolve(rootDir, "backend/.venv/Scripts/python.exe")
  : resolve(rootDir, "backend/.venv/bin/python");

const npmCmd = isWindows ? "npm.cmd" : "npm";

console.log("\x1b[36m%s\x1b[0m", "==================================================");
console.log("\x1b[36m%s\x1b[0m", "🚀 Tanzim Full-Stack Development Runner");
console.log("\x1b[36m%s\x1b[0m", "   Frontend: http://localhost:5173");
console.log("\x1b[36m%s\x1b[0m", "   Backend:  http://127.0.0.1:8000 (Docs: /docs)");
console.log("\x1b[36m%s\x1b[0m", "==================================================");

const backendEnv = {
  ...process.env,
  PYTHONPATH: resolve(rootDir, "backend"),
  PYTHONUNBUFFERED: "1",
};

const backend = spawn(
  pythonExe,
  ["-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8000", "--app-dir", "backend"],
  {
    cwd: rootDir,
    env: backendEnv,
    stdio: ["inherit", "pipe", "pipe"],
  }
);

const frontend = spawn(npmCmd, ["run", "dev"], {
  cwd: rootDir,
  env: process.env,
  stdio: ["inherit", "pipe", "pipe"],
});

function pipeOutput(stream, prefix, colorCode) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim().length > 0) {
        console.log(`${colorCode}${prefix}\x1b[0m ${line}`);
      }
    }
  });
  stream.on("end", () => {
    if (buffer.trim().length > 0) {
      console.log(`${colorCode}${prefix}\x1b[0m ${buffer}`);
    }
  });
}

pipeOutput(backend.stdout, "[BACKEND]", "\x1b[36m");
pipeOutput(backend.stderr, "[BACKEND]", "\x1b[33m");
pipeOutput(frontend.stdout, "[FRONTEND]", "\x1b[32m");
pipeOutput(frontend.stderr, "[FRONTEND]", "\x1b[31m");

function cleanup() {
  console.log("\n\x1b[33mShutting down Tanzim full-stack dev servers...\x1b[0m");
  try {
    backend.kill();
  } catch {}
  try {
    frontend.kill();
  } catch {}
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

backend.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.error(`\x1b[31m[BACKEND exited with code ${code}]\x1b[0m`);
  }
});

frontend.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.error(`\x1b[31m[FRONTEND exited with code ${code}]\x1b[0m`);
  }
});
