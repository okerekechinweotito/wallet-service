export function info(message: string, meta?: any) {
  const out = { level: "info", message, ...meta };
  console.log(JSON.stringify(out));
}

export function warn(message: string, meta?: any) {
  const out = { level: "warn", message, ...meta };
  console.warn(JSON.stringify(out));
}

export function error(message: string, meta?: any) {
  const out = { level: "error", message, ...meta };
  console.error(JSON.stringify(out));
}

export default { info, warn, error };
