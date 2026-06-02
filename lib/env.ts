export function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`缺少环境变量：${name}`);
  return v;
}

