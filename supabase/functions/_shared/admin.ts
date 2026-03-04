export function assertAdmin(adminCode: unknown) {
  const expected = Deno.env.get("SURVIVOR_ADMIN_CODE") || "";
  if (!expected) {
    const err: any = new Error("Server admin code not configured (SURVIVOR_ADMIN_CODE).");
    err.status = 500;
    throw err;
  }
  if (typeof adminCode !== "string" || adminCode !== expected) {
    const err: any = new Error("Invalid admin code");
    err.status = 403;
    throw err;
  }
}
