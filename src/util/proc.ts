import { spawn, ChildProcess } from "node:child_process";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Proceso en segundo plano (p.ej. grabación de vídeo) con parada elegante. */
export interface BackgroundProcess {
  child: ChildProcess;
  /** Envía SIGINT (para flush limpio) y resuelve al cerrar; mata si no cede. */
  stop(graceMs?: number): Promise<void>;
}

export function spawnBackground(cmd: string, args: string[]): BackgroundProcess {
  const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "ignore"] });
  return {
    child,
    stop(graceMs = 4000) {
      return new Promise<void>((resolve) => {
        if (child.exitCode !== null || child.signalCode) return resolve();
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        child.once("close", finish);
        try {
          child.kill("SIGINT");
        } catch {
          /* ignore */
        }
        setTimeout(() => {
          if (!done) {
            try {
              child.kill("SIGKILL");
            } catch {
              /* ignore */
            }
            finish();
          }
        }, graceMs);
      });
    },
  };
}

/**
 * Ejecuta un binario externo (adb, simctl, idb...) capturando stdout/stderr.
 * No usa shell, así que es seguro frente a inyección de argumentos.
 */
export function exec(
  cmd: string,
  args: string[],
  opts: { timeoutMs?: number; input?: Buffer; encoding?: "buffer" } = {}
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let settled = false;

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          if (settled) return;
          settled = true;
          child.kill("SIGKILL");
          reject(new Error(`Comando excedió ${opts.timeoutMs}ms: ${cmd} ${args.join(" ")}`));
        }, opts.timeoutMs)
      : null;

    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => err.push(d));

    child.on("error", (e) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(new Error(`No se pudo ejecutar '${cmd}'. ¿Está en el PATH? (${e.message})`));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({
        code: code ?? -1,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      });
    });

    if (opts.input) child.stdin.write(opts.input);
    child.stdin.end();
  });
}

/**
 * Abstracción de ejecución: local o REMOTA por SSH.
 *
 * Esto es lo que permite ejecutar el driver de iOS (simctl/idb, que son
 * exclusivos de macOS) desde un cliente Windows o Linux apuntando a un Mac
 * remoto (en la nube o un device farm). El mismo mecanismo sirve para Android
 * remoto. Si `remoteHost` es undefined, todo corre en local.
 */
export interface CommandRunner {
  readonly remote: boolean;
  exec(cmd: string, args: string[], timeoutMs?: number): Promise<ExecResult>;
  execBinary(cmd: string, args: string[], timeoutMs?: number): Promise<Buffer>;
}

/** Comilla simple estilo POSIX para construir comandos remotos seguros. */
export function shellQuote(arg: string): string {
  if (/^[A-Za-z0-9_./:@%+=-]+$/.test(arg)) return arg;
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

/**
 * Crea un runner. `remoteHost` con formato ssh ("usuario@host" o un alias de
 * ~/.ssh/config). Opcionalmente `sshArgs` para puerto/identidad, p.ej.
 * ["-p", "2222", "-i", "~/.ssh/mac"].
 */
export function makeRunner(remoteHost?: string, sshArgs: string[] = []): CommandRunner {
  if (!remoteHost) {
    return {
      remote: false,
      exec: (cmd, args, timeoutMs = 30_000) => exec(cmd, args, { timeoutMs }),
      execBinary: (cmd, args, timeoutMs = 30_000) => execBinary(cmd, args, timeoutMs),
    };
  }
  const base = ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", ...sshArgs, remoteHost];
  const toRemote = (cmd: string, args: string[]) =>
    [cmd, ...args].map(shellQuote).join(" ");
  return {
    remote: true,
    exec: (cmd, args, timeoutMs = 30_000) =>
      exec("ssh", [...base, toRemote(cmd, args)], { timeoutMs }),
    execBinary: (cmd, args, timeoutMs = 30_000) =>
      execBinary("ssh", [...base, toRemote(cmd, args)], timeoutMs),
  };
}

/** Igual que exec pero devolviendo stdout como Buffer (para PNG/screenshots). */
export function execBinary(cmd: string, args: string[], timeoutMs = 30_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      done(() => reject(new Error(`Comando excedió ${timeoutMs}ms: ${cmd}`)));
    }, timeoutMs);

    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => err.push(d));
    child.on("error", (e) => done(() => reject(e)));
    child.on("close", (code) => {
      if (code !== 0) {
        done(() => reject(new Error(`${cmd} salió con código ${code}: ${Buffer.concat(err).toString()}`)));
        return;
      }
      done(() => resolve(Buffer.concat(out)));
    });
  });
}
