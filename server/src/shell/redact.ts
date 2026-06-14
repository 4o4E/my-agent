const SECRET_OUTPUT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/"(password|passwd|token|secret|credential|connectionUrl)"\s*:\s*"[^"]*"/gi, '"$1":"[redacted]"'],
  [/\b([A-Z0-9_]*(?:PASSWORD|TOKEN|SECRET|KEY|DATABASE_URL|CONNECTION_URL)[A-Z0-9_]*)=('[^']*'|"[^"]*"|[^\s;&|]+)/gi, '$1=[redacted]'],
  [/\b([A-Z0-9_]*(?:PASSWORD|TOKEN|SECRET|KEY)[A-Z0-9_]*)=('[^']*'|"[^"]*"|[^\s;&|]+)/gi, '$1=[redacted]'],
  [/(postgres(?:ql)?:\/\/)([^:\s/@]+):([^@\s]+)@/gi, '$1$2:[redacted]@'],
  [/(Authorization:\s*Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[redacted]'],
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[redacted]'],
];

/** shell 输出统一脱敏，写入日志和返回 LLM 前都走这里。 */
export function redactShellOutput(output: string): string {
  return SECRET_OUTPUT_REPLACEMENTS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), output);
}
