export function getCorsOrigin(
  configuredOrigin = process.env.CORS_ORIGIN,
  nodeEnv = process.env.NODE_ENV,
): boolean | string | string[] {
  if (!configuredOrigin?.trim()) {
    return nodeEnv === 'production' ? false : true;
  }

  const origins = configuredOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    return nodeEnv === 'production' ? false : true;
  }

  return origins.length === 1 ? origins[0] : origins;
}
