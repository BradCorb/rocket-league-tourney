export function isAdminAuthorized(request: Request): boolean {
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (!configuredPassword) {
    return true;
  }
  const provided = request.headers.get("x-admin-password");
  return provided === configuredPassword;
}
