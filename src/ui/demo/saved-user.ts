// The one module that uses browser storage (SEC-13.AC-1, SEC-10.AC-4). It saves the picked demo user's
// id and nothing else; business data lives only in IndexedDB behind the API.
const KEY = "service-scheduler-demo-user";

export function readSavedUser(): string | null {
  // An empty value counts as nobody picked.
  return localStorage.getItem(KEY) || null;
}

export function saveUser(id: string): void {
  localStorage.setItem(KEY, id);
}
