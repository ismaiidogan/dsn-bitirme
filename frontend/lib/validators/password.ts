export function validatePasswordRules(password: string): string | null {
  if (password.length < 8) {
    return "Şifre en az 8 karakter olmalı";
  }
  if (!/[A-Z]/.test(password)) {
    return "Şifre en az 1 büyük harf içermeli";
  }
  if (!/\d/.test(password)) {
    return "Şifre en az 1 rakam içermeli";
  }
  return null;
}
