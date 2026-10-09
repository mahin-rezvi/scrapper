export const ROUTINE_ADMIN_EMAIL = "mahindra.x01@gmail.com";

export function isRoutineAdmin(email: string | null | undefined) {
  return email?.trim().toLowerCase() === ROUTINE_ADMIN_EMAIL;
}
