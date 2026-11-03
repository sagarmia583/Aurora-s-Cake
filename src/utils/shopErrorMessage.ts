const internalMessage = /\b(?:google\s+sheets?|apps\s+script|database|backend|supabase|firestore|firebase|postgres(?:ql)?|sql|endpoint|deploy(?:ment|ed)?|code\.gs|json|cors|stack trace|typeerror|syntaxerror|internal server error|http\s*\d{3}|unknown action|setup required|failed to fetch)\b|গুগল\s*শিট|ড[াে]টাবেস|ব্যাকএন্ড/i;

export function shopErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : '';
  return message && !internalMessage.test(message) ? message : fallback;
}
