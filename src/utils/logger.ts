export function info(message: string, meta?: any) {
  const out = { level: "info", message, ...meta };
  console.log(JSON.stringify(out));
}

export function error(message: string, meta?: any) {
  const out = { level: "error", message, ...meta };
  console.error(JSON.stringify(out));
}

export default { info, error };
